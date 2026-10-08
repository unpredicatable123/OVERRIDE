import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { initialState } from '#lib/engine/gameState.ts';
import type { Attempt, Challenge, Protocol, ProtocolId, Submission, Team } from '#lib/engine/types.ts';
import type { ArenaSnapshot } from '#lib/engine/views.ts';
import type { Store, StoredState } from './types';

/* Row <-> domain mappers. Timestamps are epoch milliseconds (bigint) throughout. */

const toProtocol = (r: any): Protocol => ({
	id: r.id,
	index: r.idx,
	code: r.code,
	name: r.name,
	title: r.title,
	tagline: r.tagline,
	story: r.story,
	dossier: r.dossier ?? [],
	flow: r.flow,
	durationSec: r.duration_sec,
	lineBonus: r.line_bonus
});
const fromProtocol = (p: Protocol) => ({
	id: p.id,
	idx: p.index,
	code: p.code,
	name: p.name,
	title: p.title,
	tagline: p.tagline,
	story: p.story,
	dossier: p.dossier,
	flow: p.flow,
	duration_sec: p.durationSec,
	line_bonus: p.lineBonus
});

const toChallenge = (r: any): Challenge => ({
	id: r.id,
	protocol: r.protocol,
	order: r.ord,
	title: r.title,
	tag: r.tag,
	kind: r.kind,
	prompt: r.prompt,
	blocks: r.blocks ?? [],
	options: r.options ?? [],
	answers: r.answers ?? [],
	baseXp: r.base_xp,
	difficulty: r.difficulty,
	timeLimitSec: r.time_limit_sec,
	hardTimeout: r.hard_timeout,
	maxAttempts: r.max_attempts,
	reveal: r.reveal,
	hint: r.hint,
	active: r.active,
	teamId: r.team_id ?? null
});
const fromChallenge = (c: Challenge) => ({
	id: c.id,
	protocol: c.protocol,
	ord: c.order,
	title: c.title,
	tag: c.tag,
	kind: c.kind,
	prompt: c.prompt,
	blocks: c.blocks,
	options: c.options,
	answers: c.answers,
	base_xp: c.baseXp,
	difficulty: c.difficulty,
	time_limit_sec: c.timeLimitSec,
	hard_timeout: c.hardTimeout,
	max_attempts: c.maxAttempts,
	reveal: c.reveal,
	hint: c.hint,
	active: c.active,
	team_id: c.teamId ?? null
});

const toTeam = (r: any): Team => ({
	id: r.id,
	name: r.name,
	players: r.players,
	accessKey: r.access_key,
	inviteCode: r.invite_code ?? null,
	disabled: r.disabled,
	joinedAt: r.joined_at === null ? null : Number(r.joined_at),
	createdAt: Number(r.created_at),
	rounds: r.rounds ?? {}
});
const teamPatch = (t: Partial<Team>) => {
	const out: Record<string, unknown> = {};
	if (t.id !== undefined) out.id = t.id;
	if (t.name !== undefined) out.name = t.name;
	if (t.players !== undefined) out.players = t.players;
	if (t.accessKey !== undefined) out.access_key = t.accessKey;
	if (t.inviteCode !== undefined) out.invite_code = t.inviteCode;
	if (t.disabled !== undefined) out.disabled = t.disabled;
	if (t.joinedAt !== undefined) out.joined_at = t.joinedAt;
	if (t.createdAt !== undefined) out.created_at = t.createdAt;
	if (t.rounds !== undefined) out.rounds = t.rounds;
	return out;
};

const toAttempt = (r: any): Attempt => ({
	teamId: r.team_id,
	challengeId: r.challenge_id,
	protocol: r.protocol,
	startedAt: Number(r.started_at),
	pauseClockAtStart: Number(r.pause_clock_at_start),
	tries: r.tries,
	status: r.status,
	xp: r.xp,
	closedAt: r.closed_at === null ? null : Number(r.closed_at)
});
const attemptPatch = (a: Partial<Attempt>) => {
	const out: Record<string, unknown> = {};
	if (a.teamId !== undefined) out.team_id = a.teamId;
	if (a.challengeId !== undefined) out.challenge_id = a.challengeId;
	if (a.protocol !== undefined) out.protocol = a.protocol;
	if (a.startedAt !== undefined) out.started_at = a.startedAt;
	if (a.pauseClockAtStart !== undefined) out.pause_clock_at_start = a.pauseClockAtStart;
	if (a.tries !== undefined) out.tries = a.tries;
	if (a.status !== undefined) out.status = a.status;
	if (a.xp !== undefined) out.xp = a.xp;
	if (a.closedAt !== undefined) out.closed_at = a.closedAt;
	return out;
};

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
	if (res.error) throw new Error(`Supabase: ${res.error.message}`);
	return res.data as T;
}

export class SupabaseStore implements Store {
	readonly kind = 'supabase' as const;
	private db: SupabaseClient;

	constructor(url: string, serviceKey: string) {
		this.db = createClient(url, serviceKey, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}

	async getState(): Promise<StoredState> {
		const row = check<{ version: number; data: StoredState } | null>(await this.db.from('event_state').select('version, data').eq('id', 1).maybeSingle());
		if (row) return { ...(row.data as StoredState), version: Number(row.version) };
		const fresh: StoredState = { ...initialState(Date.now()), finalResults: null };
		await this.db.from('event_state').upsert({ id: 1, version: 0, data: fresh }, { onConflict: 'id', ignoreDuplicates: true });
		return fresh;
	}

	async casState(next: StoredState, expectedVersion: number) {
		const rows = check(
			await this.db
				.from('event_state')
				.update({ version: next.version, data: next, updated_at: new Date().toISOString() })
				.eq('id', 1)
				.eq('version', expectedVersion)
				.select('id')
		);
		return rows.length === 1;
	}

	async listProtocols() {
		return check(await this.db.from('protocols').select('*').order('idx')).map(toProtocol);
	}
	async upsertProtocols(rows: Protocol[]) {
		check(await this.db.from('protocols').upsert(rows.map(fromProtocol)));
	}

	async listChallenges() {
		// Paginate: generated per-team sets push this well past PostgREST's 1000-row default.
		const out: Challenge[] = [];
		for (let from = 0; ; from += 1000) {
			const page = check(await this.db.from('challenges').select('*').order('id').range(from, from + 999));
			out.push(...page.map(toChallenge));
			if (page.length < 1000) return out;
		}
	}
	async upsertChallenges(rows: Challenge[]) {
		for (let i = 0; i < rows.length; i += 500) check(await this.db.from('challenges').upsert(rows.slice(i, i + 500).map(fromChallenge)));
	}
	async deleteGenerated(filter: { teamId?: string; protocol?: ProtocolId } = {}) {
		// attempts.challenge_id cascades, so a team's progress on these sets goes with them.
		let q = this.db.from('challenges').delete().not('team_id', 'is', null);
		if (filter.teamId) q = q.eq('team_id', filter.teamId);
		if (filter.protocol) q = q.eq('protocol', filter.protocol);
		check(await q);
	}
	async deleteChallenge(id: string) {
		check(await this.db.from('attempts').delete().eq('challenge_id', id));
		check(await this.db.from('challenges').delete().eq('id', id));
	}

	async listTeams() {
		return check(await this.db.from('teams').select('*').order('id')).map(toTeam);
	}
	async getTeam(id: string) {
		const r = check(await this.db.from('teams').select('*').eq('id', id).maybeSingle());
		return r ? toTeam(r) : null;
	}
	async insertTeam(team: Team) {
		check(await this.db.from('teams').insert(teamPatch(team)));
	}
	async updateTeam(id: string, patch: Partial<Omit<Team, 'id'>>) {
		check(await this.db.from('teams').update(teamPatch(patch)).eq('id', id));
	}
	async deleteTeam(id: string) {
		check(await this.db.from('teams').delete().eq('id', id));
	}

	async listAttempts(teamId?: string) {
		// Paginate: PostgREST caps responses at 1000 rows by default.
		const out: Attempt[] = [];
		for (let from = 0; ; from += 1000) {
			let q = this.db.from('attempts').select('*').range(from, from + 999);
			if (teamId) q = q.eq('team_id', teamId);
			const page = check(await q);
			out.push(...page.map(toAttempt));
			if (page.length < 1000) return out;
		}
	}
	async openAttempt(a: Attempt) {
		await this.db.from('attempts').upsert(attemptPatch(a), { onConflict: 'team_id,challenge_id', ignoreDuplicates: true });
		const r = check(
			await this.db.from('attempts').select('*').eq('team_id', a.teamId).eq('challenge_id', a.challengeId).single()
		);
		return toAttempt(r);
	}
	async updateAttempt(teamId: string, challengeId: string, expectedTries: number, patch: Partial<Attempt>) {
		const rows = check(
			await this.db
				.from('attempts')
				.update(attemptPatch(patch))
				.eq('team_id', teamId)
				.eq('challenge_id', challengeId)
				.eq('tries', expectedTries)
				.eq('status', 'open')
				.select('team_id')
		);
		return rows.length === 1;
	}

	async insertSubmission(s: Submission) {
		check(
			await this.db.from('submissions').insert({
				team_id: s.teamId,
				challenge_id: s.challengeId,
				protocol: s.protocol,
				answer: s.answer.slice(0, 500),
				correct: s.correct,
				xp: s.xp,
				try_no: s.tryNo,
				elapsed_ms: Math.min(s.elapsedMs, 2_147_000_000),
				at: s.at
			})
		);
	}
	async countSubmissions() {
		const res = await this.db.from('submissions').select('id', { count: 'exact', head: true });
		if (res.error) throw new Error(res.error.message);
		return res.count ?? 0;
	}

	async wipeProgress(filter: { teamId?: string; protocol?: ProtocolId } = {}) {
		for (const table of ['attempts', 'submissions'] as const) {
			let q = this.db.from(table).delete();
			if (filter.teamId) q = q.eq('team_id', filter.teamId);
			if (filter.protocol) q = q.eq('protocol', filter.protocol);
			if (!filter.teamId && !filter.protocol) q = q.neq('team_id', '');
			check(await q);
		}
	}

	async publishSnapshot(s: ArenaSnapshot) {
		check(await this.db.from('arena_snapshot').upsert({ id: 1, data: s, updated_at: new Date().toISOString() }));
	}
}
