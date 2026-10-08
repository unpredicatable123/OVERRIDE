import { error } from '@sveltejs/kit';
import { matchesAnswer } from '#lib/engine/answers.ts';
import {
	availableActions,
	boardMode,
	isPausedPhase,
	isSelfPacedPhase,
	pauseClockAt,
	SELF_PACED,
	submissionGate,
	transition,
	type GameAction
} from '#lib/engine/gameState.ts';
import { buildFinal, computeScores } from '#lib/engine/leaderboard.ts';
import { BINGO_SIZE, bingoLines, isExpired, scoreSubmission } from '#lib/engine/scoring.ts';
import { currentRound, nextProtocol, type TeamRound } from '#lib/engine/progress.ts';
import { effective, projectChallenge as view, statusOf, type Clock } from '#lib/engine/projection.ts';
import { PROTOCOL_IDS, type Attempt, type Challenge, type Protocol, type ProtocolId, type Team } from '#lib/engine/types.ts';
import type { AdminOverview, ChallengeView, SubmitResult, TeamStateView } from '#lib/engine/views.ts';
import { catalog, invalidateCatalog, type Catalog } from './catalog';
import { ensureSet, generating, generationStats, isGenerated, pendingSets, prewarm, teamList } from './generate';
import { geminiEnabled, geminiModel } from './generate/gemini';
import { CHALLENGES, DEMO_TEAMS, PROTOCOLS } from './seed/content';
import { cachedRanks, clearFeed, currentSnapshot, freshScores, pushFeed, requestPublish } from './snapshot';
import { store, type StoredState } from './store';

/* ───────────────────────────── projection ───────────────────────────── */

const clockOf = (state: StoredState, now: number): Clock => ({ now, pauseClock: pauseClockAt(state, now) });

async function requireTeam(teamId: string): Promise<Team> {
	const team = await store().getTeam(teamId);
	if (!team) error(401, 'Team session expired');
	if (team.disabled) error(403, 'TEAM DISABLED — contact the arena admin');
	return team;
}

/** One team's own round in the self-paced run. */
function roundOf(team: Team, cat: Catalog, attempts: Map<string, Attempt>, clock: Clock): TeamRound {
	return currentRound(team.rounds ?? {}, cat.protocolMap, (id) => teamList(cat, team.id, id), attempts, clock);
}

/** Self-paced stage label for the admin console. */
function stageLabel(r: TeamRound, cat: Catalog): string {
	if (!r.protocol) return 'BOSS GATE';
	const name = cat.protocolMap.get(r.protocol)?.name ?? r.protocol.toUpperCase();
	return r.status === 'ready' ? `${name} (READY)` : name;
}

/** Generates `protocol` sets in the background for every team that can play. */
async function prewarmAll(protocol: ProtocolId) {
	if (!isGenerated(protocol)) return;
	for (const t of await store().listTeams()) if (!t.disabled) prewarm(t.id, protocol);
}

/* ───────────────────────────── player API ───────────────────────────── */

export async function teamState(teamId: string): Promise<TeamStateView> {
	const db = store();
	const [team, state, cat, own] = await Promise.all([requireTeam(teamId), db.getState(), catalog(), db.listAttempts(teamId)]);
	const now = Date.now();
	const mode = boardMode(state);
	const attempts = new Map(own.map((a) => [a.challengeId, a]));
	const clock = clockOf(state, now);
	const phase = state.phase;

	// Self-paced: the protocol is wherever this team is. Otherwise: the one the admin prepared.
	const round = isSelfPacedPhase(phase) ? roundOf(team, cat, attempts, clock) : null;
	const pid = round ? round.protocol : state.protocol;
	const p = pid ? cat.protocolMap.get(pid) : undefined;
	const set = p ? teamList(cat, teamId, p.id) : null;
	const pendingSet = p !== undefined && set === null;
	const list = set ?? [];
	if (pendingSet) prewarm(teamId, p!.id);
	if (round) {
		// Have the next round's questions ready before the team gets there.
		const next = round.protocol ? nextProtocol(round.protocol) : 'override';
		if (next && !teamList(cat, teamId, next)) prewarm(teamId, next);
	}

	const showProtocol = p !== undefined && phase !== 'EVENT_IDLE' && phase !== 'EVENT_LOBBY';
	const hidden = round ? round.status === 'ready' : phase === 'ROUND_READY';
	const halted = isPausedPhase(phase);
	const live = round ? round.status === 'live' : phase === 'ROUND_ACTIVE' || phase === 'BOSS_ACTIVE' || halted;

	const challenges = showProtocol
		? list.map((ch) => {
				const a = effective(attempts.get(ch.id), ch, clock);
				return view(ch, statusOf(ch, list, attempts, p!, clock), a, clock, { halted, hidden });
			})
		: [];

	const [score] = computeScores([team], own, cat.challengeMap, cat.protocolMap);
	const board = await cachedRanks();
	const row = board.rows.find((r) => r.teamId === teamId);
	const rounds = mode === 'boss' ? { override: score.rounds.override } : score.rounds;

	return {
		serverNow: now,
		stateVersion: state.version,
		team: { id: team.id, name: team.name, players: team.players },
		invite: team.players[1] ? null : team.inviteCode,
		protocol: showProtocol
			? {
					id: p!.id,
					index: p!.index,
					code: p!.code,
					name: p!.name,
					title: p!.title,
					tagline: p!.tagline,
					durationSec: p!.durationSec,
					story: p!.story,
					flow: p!.flow,
					lineBonus: p!.lineBonus,
					dossier: live && !halted ? p!.dossier : !round && phase === 'ROUND_COMPLETED' ? p!.dossier : null
				}
			: null,
		challenges,
		xp: mode === 'boss' ? score.rounds.override : score.total,
		xpLabel: mode === 'boss' ? 'BOSS XP' : mode === 'final' ? 'FINAL XP' : 'XP',
		rounds,
		rank: row?.rank ?? null,
		teamsRanked: board.rows.length,
		bingoLines: score.bingoLines,
		mode,
		selfPaced: round
			? {
					status: round.status,
					endsAt: round.status === 'live' && !halted && round.remainingMs !== null ? now + round.remainingMs : null,
					remainingMs: round.remainingMs,
					durationMs: round.durationMs,
					completed: round.completed
				}
			: null,
		generating: pendingSet
	};
}

/**
 * Self-paced run: starts the team's own clock on the protocol that just opened for it.
 * Idempotent, so both teammates pressing INITIALIZE at once is fine.
 */
export async function startRound(teamId: string, protocolId: string): Promise<void> {
	const db = store();
	const [team, state, cat, own] = await Promise.all([requireTeam(teamId), db.getState(), catalog(), db.listAttempts(teamId)]);
	if (state.phase === 'LIVE_PAUSED') error(409, 'SYSTEM HALTED — the arena is paused');
	if (state.phase !== 'EVENT_LIVE') error(409, 'The self-paced run is not live');
	const attempts = new Map(own.map((a) => [a.challengeId, a]));
	const round = roundOf(team, cat, attempts, clockOf(state, Date.now()));
	if (!round.protocol || round.protocol !== protocolId) error(409, 'That protocol is not open for your team');
	if (round.status === 'live') return;
	const pid = round.protocol;

	// Never start a clock on questions that don't exist yet.
	await ensureSet(teamId, pid);
	const fresh = await requireTeam(teamId);
	if (fresh.rounds?.[pid]) return;
	const now = Date.now();
	const latest = await db.getState();
	if (latest.phase !== 'EVENT_LIVE') error(409, 'The self-paced run is not live');
	await db.updateTeam(teamId, {
		rounds: { ...fresh.rounds, [pid]: { startedAt: now, pauseClockAtStart: pauseClockAt(latest, now) } }
	});
	prewarm(teamId, nextProtocol(pid));
	requestPublish();
}

interface Ctx {
	team: Team;
	state: StoredState;
	ch: Challenge;
	protocol: Protocol;
	list: Challenge[];
	attempts: Map<string, Attempt>;
	now: number;
}

async function context(teamId: string, challengeId: string): Promise<Ctx> {
	const db = store();
	const [team, state, cat, own] = await Promise.all([requireTeam(teamId), db.getState(), catalog(), db.listAttempts(teamId)]);
	const now = Date.now();
	const gate = submissionGate(state, now);
	if (!gate.open) error(409, gate.reason);
	const ch = cat.challengeMap.get(challengeId);
	if (!ch || !ch.active) error(404, 'Challenge not available in this protocol');
	const attempts = new Map(own.map((a) => [a.challengeId, a]));
	if (state.phase === 'EVENT_LIVE') {
		// Self-paced: the team's own round must be running, and its own clock must not have run out.
		const round = roundOf(team, cat, attempts, clockOf(state, now));
		if (ch.protocol !== round.protocol) error(409, 'PROTOCOL CLOSED — that round is over for your team');
		if (round.status !== 'live') error(409, 'Initialize the protocol first');
	} else if (ch.protocol !== state.protocol) {
		error(404, 'Challenge not available in this protocol');
	}
	const protocol = cat.protocolMap.get(ch.protocol)!;
	// Teams only ever see and play their own generated set.
	const list = teamList(cat, teamId, ch.protocol);
	if (!list || !list.some((c) => c.id === ch.id)) error(404, 'Challenge not available in this protocol');
	if (statusOf(ch, list, attempts, protocol, clockOf(state, now)) === 'locked') error(409, 'LOCKED — clear the previous node first');
	return { team, state, ch, protocol, list, attempts, now };
}

/** Starts the per-challenge clock. Idempotent: re-opening returns the original start time. */
export async function openChallenge(teamId: string, challengeId: string): Promise<ChallengeView> {
	const { state, ch, protocol, list, attempts, now } = await context(teamId, challengeId);
	let a = attempts.get(ch.id);
	if (!a) {
		a = await store().openAttempt({
			teamId,
			challengeId: ch.id,
			protocol: ch.protocol,
			startedAt: now,
			pauseClockAtStart: pauseClockAt(state, now),
			tries: 0,
			status: 'open',
			xp: 0,
			closedAt: null
		});
		attempts.set(ch.id, a);
	}
	const clock = clockOf(state, now);
	return view(ch, statusOf(ch, list, attempts, protocol, clock), effective(a, ch, clock), clock, { halted: false, hidden: false });
}

const lastSubmit = new Map<string, number>();
const SUBMIT_COOLDOWN_MS = 350;

export async function submitAnswer(teamId: string, challengeId: string, rawAnswer: string): Promise<SubmitResult> {
	const answer = String(rawAnswer ?? '').slice(0, 200);
	const t = Date.now();
	if (t - (lastSubmit.get(teamId) ?? 0) < SUBMIT_COOLDOWN_MS) error(429, 'Too fast — the system is cooling down');
	lastSubmit.set(teamId, t);

	const { team, state, ch, protocol, list, attempts, now } = await context(teamId, challengeId);
	const a = attempts.get(ch.id);
	if (!a) error(409, 'Challenge not initialized — open it first');
	if (a.status !== 'open') error(409, a.status === 'solved' ? 'Already accepted' : 'Node is closed');
	if (ch.kind === 'choice' && !ch.options.includes(answer)) error(400, 'Invalid option');
	if (!answer.trim()) error(400, 'Empty input');

	// Elapsed time excludes any time the event spent paused since this attempt opened.
	const elapsedMs = Math.max(0, now - a.startedAt - (pauseClockAt(state, now) - a.pauseClockAtStart));
	const tryNo = a.tries + 1;
	const expired = isExpired(elapsedMs, ch.timeLimitSec, ch.hardTimeout);
	const correct = !expired && matchesAnswer(answer, ch.answers);
	const score = scoreSubmission({
		baseXp: ch.baseXp,
		difficulty: ch.difficulty,
		kind: ch.kind,
		timeLimitSec: ch.timeLimitSec,
		hardTimeout: ch.hardTimeout,
		elapsedMs,
		tryNo,
		correct
	});
	const status: Attempt['status'] = correct ? 'solved' : expired || tryNo >= ch.maxAttempts ? 'failed' : 'open';
	const patch: Partial<Attempt> = { tries: tryNo, status, xp: score.xp, closedAt: status === 'open' ? null : now };

	// Optimistic concurrency: if a teammate submitted first, this write is rejected.
	const ok = await store().updateAttempt(teamId, ch.id, a.tries, patch);
	if (!ok) error(409, 'Your teammate just submitted this node — syncing');
	const updated: Attempt = { ...a, ...patch };
	attempts.set(ch.id, updated);

	await store().insertSubmission({ teamId, challengeId: ch.id, protocol: ch.protocol, answer, correct, xp: score.xp, tryNo, elapsedMs, at: now });

	let bonusXp = 0;
	if (correct && protocol.flow === 'grid') {
		const cells = (excludeCurrent: boolean) =>
			list.filter((c) => attempts.get(c.id)?.status === 'solved' && (!excludeCurrent || c.id !== ch.id)).map((c) => c.order);
		const gained = bingoLines(cells(false), BINGO_SIZE) - bingoLines(cells(true), BINGO_SIZE);
		bonusXp = gained * protocol.lineBonus;
		if (gained > 0) pushFeed({ at: now, teamId, team: team.name, protocol: ch.protocol, label: `BINGO ×${gained}`, xp: bonusXp, kind: 'bingo' });
	}
	if (correct) {
		const last = list[list.length - 1]?.id === ch.id && protocol.flow === 'sequence';
		pushFeed({
			at: now,
			teamId,
			team: team.name,
			protocol: ch.protocol,
			label: last ? `${protocol.name} CLEARED` : ch.tag || ch.title,
			xp: score.xp,
			kind: last ? 'escape' : 'solve'
		});
	}
	requestPublish();

	const nextIdx = list.indexOf(ch) + 1;
	const nextUnlocked = status !== 'open' && protocol.flow === 'sequence' && nextIdx < list.length ? list[nextIdx].id : null;
	const outcome: SubmitResult['outcome'] = correct ? 'accepted' : expired ? 'expired' : status === 'failed' ? 'failed' : 'denied';
	const messages: Record<SubmitResult['outcome'], string> = {
		accepted: 'SYSTEM ACCEPTED ✓',
		denied: 'ACCESS DENIED ✕',
		failed: 'NODE LOCKED OUT ✕',
		expired: 'SIGNAL LOST — TIME EXPIRED'
	};
	return {
		outcome,
		xp: score.xp,
		maxXp: score.maxXp,
		speed: score.speed,
		accuracy: score.accuracy,
		triesLeft: Math.max(0, ch.maxAttempts - tryNo),
		bonusXp,
		message: messages[outcome],
		challenge: view(ch, updated.status, updated, clockOf(state, now), { halted: false, hidden: false }),
		nextUnlocked
	};
}

/* ───────────────────────────── admin API ───────────────────────────── */

export type AdminActionInput =
	| { type: 'PREPARE_ROUND'; protocol: string }
	| { type: 'EXTEND'; seconds: number }
	| { type: Exclude<GameAction['type'], 'PREPARE_ROUND' | 'EXTEND' | 'START_ROUND'> }
	| { type: 'START_ROUND' };

export async function adminAction(input: AdminActionInput): Promise<StoredState> {
	const db = store();
	const cat = await catalog();
	for (let i = 0; i < 4; i++) {
		const state = await db.getState();
		const now = Date.now();
		let action: GameAction;
		if (input.type === 'START_ROUND') {
			const p = state.protocol ? cat.protocolMap.get(state.protocol) : undefined;
			if (!p) error(400, 'No protocol prepared');
			action = { type: 'START_ROUND', durationMs: p.durationSec * 1000 };
		} else if (input.type === 'PREPARE_ROUND') {
			if (!PROTOCOL_IDS.includes(input.protocol as never)) error(400, 'Unknown protocol');
			action = { type: 'PREPARE_ROUND', protocol: input.protocol as (typeof PROTOCOL_IDS)[number] };
		} else {
			action = input as GameAction;
		}

		const r = transition(state, action, now);
		if (!r.ok) error(409, r.error);
		const next: StoredState = { ...r.state, finalResults: state.finalResults };

		if (action.type === 'FINALIZE') {
			// Aggregate every round + boss XP from authoritative attempts, then freeze the ranking.
			const [teams, attempts] = await Promise.all([db.listTeams(), db.listAttempts()]);
			next.finalResults = buildFinal(computeScores(teams, attempts, cat.challengeMap, cat.protocolMap));
		}
		if (action.type === 'RESET') next.finalResults = null;

		if (await db.casState(next, state.version)) {
			if (action.type === 'RESET') {
				await db.wipeProgress();
				// Fresh event, fresh questions.
				await db.deleteGenerated();
				invalidateCatalog();
				for (const t of await db.listTeams()) {
					if (t.joinedAt || Object.keys(t.rounds ?? {}).length) await db.updateTeam(t.id, { joinedAt: null, rounds: {} });
				}
				clearFeed();
			}
			if (action.type === 'START_LIVE') await prewarmAll(SELF_PACED[0]);
			if (action.type === 'PREPARE_ROUND') await prewarmAll(action.protocol);
			requestPublish({ immediate: true });
			return next;
		}
	}
	error(409, 'State changed concurrently — try again');
}

const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function accessKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return [...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
}

function inviteToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	return [...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
}

async function findByInvite(code: string): Promise<Team | null> {
	const c = code.trim().toUpperCase();
	if (!/^[A-Z0-9]{6,20}$/.test(c)) return null;
	return (await store().listTeams()).find((t) => t.inviteCode === c) ?? null;
}

/** Public preview of an invite: who is asking you to join. */
export async function invitePreview(code: string) {
	const t = await findByInvite(code);
	if (!t || t.disabled) return null;
	return { teamId: t.id, name: t.name, captain: t.players[0], full: Boolean(t.players[1]) };
}

/** Player 02 accepts an invite: fills the empty seat and burns the invite token. */
export async function joinTeam(code: string, playerName: unknown): Promise<Team> {
	const name = cleanName(playerName, 24);
	if (!name) error(400, 'Enter your name');
	const t = await findByInvite(code);
	if (!t || t.disabled) error(404, 'This invite is invalid or has expired');
	if (t.players[1]) error(409, 'This team is already full');
	const players: [string, string] = [t.players[0], name];
	await store().updateTeam(t.id, { players, inviteCode: null, joinedAt: t.joinedAt ?? Date.now() });
	requestPublish();
	return { ...t, players, inviteCode: null };
}

function cleanName(s: unknown, max: number): string {
	return String(s ?? '')
		.replace(/[\u0000-\u001f]/g, '')
		.trim()
		.slice(0, max);
}

/**
 * Creates a team. With `pending`, only player 01 is required: player 02 joins later through
 * the invite link / QR (`joinTeam`).
 */
export async function createTeam(input: { name: unknown; players: unknown[]; pending?: boolean }): Promise<Team> {
	const name = cleanName(input.name, 24).toUpperCase();
	const players = [cleanName(input.players?.[0], 24), cleanName(input.players?.[1], 24)] as [string, string];
	if (name.length < 2) error(400, 'Team name must be at least 2 characters');
	if (!players[0]) error(400, 'Player 01 needs a name');
	if (!players[1] && !input.pending) error(400, 'Each team needs exactly two players');
	const teams = await store().listTeams();
	if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) error(409, 'That team name is taken');
	const max = teams.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, '')) || 0), 0);
	const team: Team = {
		id: `OV-${String(max + 1).padStart(3, '0')}`,
		name,
		players,
		accessKey: accessKey(),
		inviteCode: players[1] ? null : inviteToken(),
		disabled: false,
		joinedAt: null,
		createdAt: Date.now(),
		rounds: {}
	};
	await store().insertTeam(team);
	requestPublish();
	return team;
}

export async function loginTeam(teamId: string, key: string): Promise<Team | null> {
	const team = await store().getTeam(teamId.trim().toUpperCase());
	if (!team || team.disabled || team.accessKey !== key.trim().toUpperCase()) return null;
	if (team.joinedAt === null) {
		await store().updateTeam(team.id, { joinedAt: Date.now() });
		requestPublish();
	}
	return team;
}

export async function teamOp(op: string, teamId: string, data: Record<string, unknown> = {}) {
	const db = store();
	const team = await db.getTeam(teamId);
	if (!team) error(404, 'Team not found');
	switch (op) {
		case 'disable':
			await db.updateTeam(teamId, { disabled: true });
			break;
		case 'enable':
			await db.updateTeam(teamId, { disabled: false });
			break;
		case 'reset':
			// Clears the team's progress, round clocks and question sets; new sets are generated on demand.
			await db.wipeProgress({ teamId });
			await db.deleteGenerated({ teamId });
			await db.updateTeam(teamId, { rounds: {} });
			invalidateCatalog();
			break;
		case 'rekey':
			await db.updateTeam(teamId, { accessKey: accessKey() });
			break;
		case 'rename': {
			const name = cleanName(data.name, 24).toUpperCase();
			const players = Array.isArray(data.players)
				? ([cleanName(data.players[0], 24), cleanName(data.players[1], 24)] as [string, string])
				: team.players;
			if (name.length < 2 || !players[0]) error(400, 'Invalid team details');
			await db.updateTeam(teamId, { name, players, inviteCode: players[1] ? null : (team.inviteCode ?? inviteToken()) });
			break;
		}
		case 'delete':
			await db.deleteGenerated({ teamId });
			await db.deleteTeam(teamId);
			invalidateCatalog();
			break;
		default:
			error(400, 'Unknown team operation');
	}
	requestPublish({ immediate: true });
}

export async function seedDemoTeams(): Promise<number> {
	const existing = new Set((await store().listTeams()).map((t) => t.name.toLowerCase()));
	let n = 0;
	for (const t of DEMO_TEAMS) {
		if (existing.has(t.name.toLowerCase())) continue;
		await createTeam(t);
		n++;
	}
	return n;
}

export async function restoreContent() {
	await store().upsertProtocols(PROTOCOLS);
	await store().upsertChallenges(CHALLENGES);
	invalidateCatalog();
	requestPublish({ immediate: true });
}

export async function wipeProtocol(protocol: string) {
	if (!PROTOCOL_IDS.includes(protocol as never)) error(400, 'Unknown protocol');
	await store().wipeProgress({ protocol: protocol as (typeof PROTOCOL_IDS)[number] });
	requestPublish({ immediate: true });
}

export async function adminOverview(): Promise<AdminOverview> {
	const [state, teams, scores, cat, attempts] = await Promise.all([
		store().getState(),
		store().listTeams(),
		freshScores(),
		catalog(),
		store().listAttempts()
	]);
	const mode = boardMode(state);
	const byId = new Map(scores.map((s) => [s.teamId, s]));
	const snapshot = await currentSnapshot(0);
	const selfPaced = isSelfPacedPhase(state.phase);
	const byTeam = new Map<string, Map<string, Attempt>>();
	for (const a of attempts) {
		let m = byTeam.get(a.teamId);
		if (!m) byTeam.set(a.teamId, (m = new Map()));
		m.set(a.challengeId, a);
	}
	const clock = clockOf(state, Date.now());
	return {
		snapshot,
		actions: availableActions(state),
		generation: {
			gemini: geminiEnabled(),
			model: geminiModel(),
			sets: generationStats.sets,
			fallbacks: generationStats.fallbacks,
			pending: pendingSets()
		},
		teams: teams.map((t) => {
			const s = byId.get(t.id);
			let stage = selfPaced && !t.disabled ? stageLabel(roundOf(t, cat, byTeam.get(t.id) ?? new Map(), clock), cat) : null;
			if (stage?.endsWith('(READY)') && generating(t.id)) stage = stage.replace('(READY)', '(GENERATING)');
			return {
				stage,
				id: t.id,
				name: t.name,
				players: t.players,
				accessKey: t.accessKey,
				disabled: t.disabled,
				joinedAt: t.joinedAt,
				solved: s?.solved ?? 0,
				xp: s ? (mode === 'boss' ? s.rounds.override : s.total) : 0,
				rounds: s ? (mode === 'boss' ? { override: s.rounds.override } : s.rounds) : {}
			};
		})
	};
}

/* ───────────────────────────── challenge management ───────────────────────────── */

const DIFFS = ['easy', 'medium', 'hard', 'boss'] as const;

export function validateChallenge(raw: Record<string, any>): Challenge {
	const str = (v: unknown, max = 4000) => String(v ?? '').slice(0, max);
	if (!PROTOCOL_IDS.includes(raw.protocol)) error(400, 'Unknown protocol');
	if (!DIFFS.includes(raw.difficulty)) error(400, 'Unknown difficulty');
	const id = str(raw.id, 64).trim() || `${raw.protocol}-${Date.now().toString(36)}`;
	if (!/^[a-z0-9-]+$/i.test(id)) error(400, 'ID may only contain letters, digits and dashes');
	const answers = (Array.isArray(raw.answers) ? raw.answers : []).map((a: unknown) => str(a, 200)).filter((a: string) => a.trim());
	if (!answers.length) error(400, 'At least one accepted answer is required');
	const kind = raw.kind === 'choice' ? 'choice' : 'text';
	const options = (Array.isArray(raw.options) ? raw.options : []).map((o: unknown) => str(o, 200)).filter((o: string) => o.trim());
	if (kind === 'choice' && (options.length < 2 || !answers.every((a: string) => options.includes(a)))) {
		error(400, 'Choice challenges need ≥2 options and every answer must be one of them');
	}
	const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
	const timeLimit = raw.timeLimitSec === null || raw.timeLimitSec === '' || raw.timeLimitSec === undefined ? null : Number(raw.timeLimitSec);
	if (timeLimit !== null && !(timeLimit > 0 && timeLimit <= 3600)) error(400, 'Time limit must be 1–3600 seconds or empty');
	const baseXp = Math.round(Number(raw.baseXp));
	if (!(baseXp >= 0 && baseXp <= 10_000)) error(400, 'Base XP must be 0–10000');
	const maxAttempts = Math.round(Number(raw.maxAttempts) || 1);
	return {
		id,
		protocol: raw.protocol,
		order: Math.round(Number(raw.order) || 0),
		title: str(raw.title, 120) || 'UNTITLED',
		tag: str(raw.tag, 24),
		kind,
		prompt: str(raw.prompt),
		blocks,
		options,
		answers,
		baseXp,
		difficulty: raw.difficulty,
		timeLimitSec: timeLimit,
		hardTimeout: Boolean(raw.hardTimeout),
		maxAttempts: Math.min(10, Math.max(1, maxAttempts)),
		reveal: raw.reveal ? str(raw.reveal, 1000) : null,
		hint: raw.hint ? str(raw.hint, 500) : null,
		active: raw.active !== false
	};
}

export async function upsertChallenge(raw: Record<string, any>) {
	const c = validateChallenge(raw);
	await store().upsertChallenges([c]);
	invalidateCatalog();
	return c;
}

export async function deleteChallenge(id: string) {
	await store().deleteChallenge(id);
	invalidateCatalog();
}

export async function updateProtocol(id: string, patch: { durationSec?: number; lineBonus?: number }) {
	const cat = await catalog();
	const p = cat.protocolMap.get(id as never);
	if (!p) error(404, 'Unknown protocol');
	const next = { ...p };
	if (patch.durationSec !== undefined) {
		const d = Math.round(Number(patch.durationSec));
		if (!(d >= 30 && d <= 7200)) error(400, 'Duration must be 30–7200 seconds');
		next.durationSec = d;
	}
	if (patch.lineBonus !== undefined) next.lineBonus = Math.max(0, Math.round(Number(patch.lineBonus) || 0));
	await store().upsertProtocols([next]);
	invalidateCatalog();
	requestPublish({ immediate: true });
}

export async function listChallengesAdmin(opts: { generated?: boolean } = {}) {
	const cat = await catalog();
	const rows = opts.generated ? [...cat.challengeMap.values()] : cat.all;
	return { protocols: cat.protocols, challenges: [...rows].sort((a, b) => a.protocol.localeCompare(b.protocol) || a.order - b.order) };
}
