import { matchesAnswer } from '#lib/engine/answers.ts';
import type { BoardRow, FinalResult, RoundScores } from '#lib/engine/leaderboard.ts';
import { emptyRounds } from '#lib/engine/leaderboard.ts';
import { effective, projectChallenge, statusOf, type Clock } from '#lib/engine/projection.ts';
import { BINGO_SIZE, bingoLines, isExpired, maxXp, scoreSubmission } from '#lib/engine/scoring.ts';
import { PROTOCOL_IDS, type Attempt, type Challenge, type Protocol, type ProtocolId } from '#lib/engine/types.ts';
import type { ChallengeView, ProtocolMeta, SubmitResult, TeamStateView } from '#lib/engine/views.ts';
import { clock } from '#lib/client/clock.svelte.ts';
import { sound } from '#lib/client/sound.svelte.ts';
import type { GameClient, Verdict } from '#lib/client/team.svelte.ts';
import { DEMO_CHALLENGES, DEMO_PROTOCOLS } from './content.ts';

/**
 * Local sandbox: the same engine (projection, scoring, answer matching, bingo lines) as the live
 * arena, running entirely in the browser against demo-only content. Nothing touches the server.
 */

export type DemoPhase = 'select' | 'ready' | 'live' | 'done';

const ME = 'DEMO';
const RIVALS: Array<{ id: string; name: string; skill: number }> = [
	{ id: 'OV-901', name: 'BYTEFORCE', skill: 0.92 },
	{ id: 'OV-902', name: 'NULL POINTER', skill: 0.86 },
	{ id: 'OV-903', name: 'CODEX', skill: 0.8 },
	{ id: 'OV-904', name: 'STACK RAIDERS', skill: 0.74 },
	{ id: 'OV-905', name: 'DEBUGGERS', skill: 0.66 },
	{ id: 'OV-906', name: 'ZERO DAY', skill: 0.58 },
	{ id: 'OV-907', name: 'CACHE MISS', skill: 0.5 }
];

const byProtocol = new Map<ProtocolId, Challenge[]>(PROTOCOL_IDS.map((p) => [p, DEMO_CHALLENGES.filter((c) => c.protocol === p)]));
const protocolMap = new Map(DEMO_PROTOCOLS.map((p) => [p.id, p]));
const protocolMax = (p: ProtocolId) =>
	(byProtocol.get(p) ?? []).reduce((s, c) => s + maxXp(c.baseXp, c.difficulty), 0) + (protocolMap.get(p)!.lineBonus ? 2 * protocolMap.get(p)!.lineBonus : 0);

/** Deterministic pseudo-random per (rival, protocol) so the board is stable across renders. */
function luck(id: string, p: string): number {
	let h = 2166136261;
	for (const ch of id + p) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return ((h >>> 0) % 1000) / 1000;
}

export class DemoGame implements GameClient {
	phase = $state<DemoPhase>('select');
	protocolId = $state<ProtocolId | null>(null);
	startedAt = $state<number | null>(null);
	verdict = $state<Verdict | null>(null);
	submitting = $state<string | null>(null);
	notice = $state<string | null>(null);
	/** Best XP per protocol across runs. */
	best = $state<RoundScores>(emptyRounds());

	private attempts = $state<Record<string, Attempt>>({});
	private seq = 0;
	private tick = $state(0);

	readonly protocols: ProtocolMeta[] = DEMO_PROTOCOLS.map(({ id, index, code, name, title, tagline, durationSec }) => ({ id, index, code, name, title, tagline, durationSec }));

	get protocol(): Protocol | null {
		return this.protocolId ? protocolMap.get(this.protocolId)! : null;
	}

	get durationMs(): number | null {
		return this.protocol ? this.protocol.durationSec * 1000 : null;
	}

	get remainingMs(): number | null {
		if (this.phase !== 'live' || this.startedAt === null || !this.durationMs) return this.phase === 'ready' ? this.durationMs : null;
		return Math.max(0, this.startedAt + this.durationMs - clock.now);
	}

	private clockNow(): Clock {
		return { now: Date.now(), pauseClock: 0 };
	}

	private list(): Challenge[] {
		return this.protocolId ? (byProtocol.get(this.protocolId) ?? []) : [];
	}

	private attemptMap(): Map<string, Attempt> {
		return new Map(Object.values(this.attempts).map((a) => [a.challengeId, a]));
	}

	/** XP earned in the current run of the current protocol (includes bingo bonus). */
	get runXp(): number {
		const list = this.list();
		const map = this.attemptMap();
		let xp = 0;
		const cells: number[] = [];
		for (const c of list) {
			const a = map.get(c.id);
			if (a?.status === 'solved') {
				xp += a.xp;
				cells.push(c.order);
			}
		}
		const p = this.protocol;
		if (p?.flow === 'grid') xp += bingoLines(cells, BINGO_SIZE) * p.lineBonus;
		return xp;
	}

	get lines(): number {
		const cells = this.list()
			.filter((c) => this.attempts[c.id]?.status === 'solved')
			.map((c) => c.order);
		return this.protocol?.flow === 'grid' ? bingoLines(cells, BINGO_SIZE) : 0;
	}

	get totals(): RoundScores {
		const r = { ...this.best };
		if (this.protocolId && this.phase !== 'select') r[this.protocolId] = Math.max(r[this.protocolId], this.runXp);
		return r;
	}

	get total(): number {
		return PROTOCOL_IDS.reduce((s, p) => s + this.totals[p], 0);
	}

	/** Simulated rivals: each protocol they "play" ramps up while your run is live. */
	private rivalRounds(id: string, skill: number): RoundScores {
		const r = emptyRounds();
		const progress = this.phase === 'live' && this.startedAt && this.durationMs ? Math.min(1, (clock.now - this.startedAt) / this.durationMs) : 1;
		for (const p of PROTOCOL_IDS) {
			const played = this.best[p] > 0 || p === this.protocolId;
			if (!played) continue;
			const share = skill * (0.45 + 0.4 * luck(id, p));
			const ramp = p === this.protocolId && this.phase === 'live' ? progress : 1;
			r[p] = Math.round(protocolMax(p) * share * ramp);
		}
		return r;
	}

	get board(): BoardRow[] {
		const boss = this.protocolId === 'override' && this.phase !== 'select';
		const metric = (r: RoundScores) => (boss ? r.override : PROTOCOL_IDS.reduce((s, p) => s + r[p], 0));
		const rows = [
			{ teamId: ME, name: 'YOUR TEAM', xp: metric(this.totals) },
			...RIVALS.map((t) => ({ teamId: t.id, name: t.name, xp: metric(this.rivalRounds(t.id, t.skill)) }))
		];
		return rows.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name)).map((r, i) => ({ ...r, rank: i + 1 }));
	}

	get finalResults(): FinalResult[] {
		const rows: FinalResult[] = [
			{ rank: 0, teamId: ME, name: 'YOUR TEAM', players: ['You', 'Teammate'], rounds: this.totals, total: this.total },
			...RIVALS.map((t) => {
				const rounds = emptyRounds();
				for (const p of PROTOCOL_IDS) rounds[p] = Math.round(protocolMax(p) * t.skill * (0.45 + 0.4 * luck(t.id, p)));
				return { rank: 0, teamId: t.id, name: t.name, players: ['Player 1', 'Player 2'] as [string, string], rounds, total: PROTOCOL_IDS.reduce((s, p) => s + rounds[p], 0) };
			})
		];
		return rows.sort((a, b) => b.total - a.total).map((r, i) => ({ ...r, rank: i + 1 }));
	}

	/** Server-shaped view so the live protocol components render unchanged. */
	get view(): TeamStateView {
		void this.tick; // re-derive after refresh()
		const p = this.protocol;
		const now = Date.now();
		const clk = this.clockNow();
		const attempts = this.attemptMap();
		const list = this.list();
		const hidden = this.phase === 'ready';
		const challenges: ChallengeView[] = p
			? list.map((ch) => projectChallenge(ch, statusOf(ch, list, attempts, p, clk), effective(attempts.get(ch.id), ch, clk), clk, { halted: false, hidden }))
			: [];
		const boss = p?.id === 'override' && this.phase !== 'select';
		const me = this.board.find((r) => r.teamId === ME);
		return {
			serverNow: now,
			stateVersion: 0,
			team: { id: ME, name: 'YOUR TEAM', players: ['You', 'Teammate'] },
			invite: null,
			protocol: p
				? { ...p, dossier: this.phase === 'live' || this.phase === 'done' ? p.dossier : null }
				: null,
			challenges,
			xp: boss ? this.totals.override : this.total,
			xpLabel: boss ? 'Boss XP' : 'XP',
			rounds: this.totals,
			rank: me?.rank ?? null,
			teamsRanked: RIVALS.length + 1,
			bingoLines: this.lines,
			mode: boss ? 'boss' : 'live',
			selfPaced: null,
			generating: false
		};
	}

	/* ── flow ── */

	choose(id: ProtocolId) {
		this.protocolId = id;
		this.phase = 'ready';
		this.attempts = {};
		this.startedAt = null;
	}

	start() {
		this.phase = 'live';
		this.startedAt = Date.now();
	}

	finish() {
		if (!this.protocolId) return;
		this.best[this.protocolId] = Math.max(this.best[this.protocolId], this.runXp);
		this.phase = 'done';
	}

	back() {
		if (this.phase === 'live') this.finish();
		this.phase = 'select';
	}

	reset() {
		this.best = emptyRounds();
		this.attempts = {};
		this.protocolId = null;
		this.phase = 'select';
	}

	/* ── GameClient ── */

	async refresh() {
		this.tick++;
	}

	private flash(msg: string) {
		this.notice = msg;
		setTimeout(() => (this.notice = null), 2400);
	}

	async open(id: string): Promise<ChallengeView | null> {
		if (this.phase !== 'live') return null;
		const p = this.protocol!;
		const list = this.list();
		const ch = list.find((c) => c.id === id);
		if (!ch) return null;
		if (statusOf(ch, list, this.attemptMap(), p, this.clockNow()) === 'locked') {
			this.flash('Locked — clear the previous node first');
			return null;
		}
		if (!this.attempts[id]) {
			this.attempts[id] = { teamId: ME, challengeId: id, protocol: ch.protocol, startedAt: Date.now(), pauseClockAtStart: 0, tries: 0, status: 'open', xp: 0, closedAt: null };
		}
		return this.view.challenges.find((c) => c.id === id) ?? null;
	}

	async submit(id: string, answer: string): Promise<SubmitResult | null> {
		const ch = this.list().find((c) => c.id === id);
		const a = this.attempts[id];
		if (!ch || !a || a.status !== 'open' || this.phase !== 'live' || (this.remainingMs ?? 0) <= 0) return null;
		if (!answer.trim()) return null;
		this.submitting = id;
		try {
			const now = Date.now();
			const elapsedMs = now - a.startedAt;
			const tryNo = a.tries + 1;
			const expired = isExpired(elapsedMs, ch.timeLimitSec, ch.hardTimeout);
			const correct = !expired && matchesAnswer(answer, ch.answers);
			const linesBefore = this.lines;
			const score = scoreSubmission({ baseXp: ch.baseXp, difficulty: ch.difficulty, kind: ch.kind, timeLimitSec: ch.timeLimitSec, hardTimeout: ch.hardTimeout, elapsedMs, tryNo, correct });
			const status: Attempt['status'] = correct ? 'solved' : expired || tryNo >= ch.maxAttempts ? 'failed' : 'open';
			this.attempts[id] = { ...a, tries: tryNo, status, xp: score.xp, closedAt: status === 'open' ? null : now };
			const bonusXp = correct && this.protocol?.flow === 'grid' ? (this.lines - linesBefore) * this.protocol.lineBonus : 0;

			const outcome: SubmitResult['outcome'] = correct ? 'accepted' : expired ? 'expired' : status === 'failed' ? 'failed' : 'denied';
			const message = { accepted: 'System accepted', denied: 'Access denied', failed: 'Node locked out', expired: 'Time expired' }[outcome];
			const view = this.view.challenges.find((c) => c.id === id)!;
			const list = this.list();
			const next = list[list.indexOf(ch) + 1];
			const result: SubmitResult = {
				outcome,
				xp: score.xp,
				maxXp: score.maxXp,
				speed: score.speed,
				accuracy: score.accuracy,
				triesLeft: Math.max(0, ch.maxAttempts - tryNo),
				bonusXp,
				message,
				challenge: view,
				nextUnlocked: status !== 'open' && this.protocol?.flow === 'sequence' && next ? next.id : null
			};
			this.verdict = { id: ++this.seq, result };
			if (correct) {
				sound.play('accept');
				setTimeout(() => sound.play(bonusXp || result.nextUnlocked ? 'unlock' : 'xp'), 160);
			} else sound.play('deny');
			return result;
		} finally {
			this.submitting = null;
		}
	}

	/** Every node in the current protocol is closed. */
	get cleared(): boolean {
		const clk = this.clockNow();
		const map = this.attemptMap();
		const list = this.list();
		return list.length > 0 && list.every((c) => {
			const a = effective(map.get(c.id), c, clk);
			return a !== undefined && a.status !== 'open';
		});
	}
}
