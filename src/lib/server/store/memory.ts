import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialState } from '#lib/engine/gameState.ts';
import type { Attempt, Challenge, Protocol, Submission, Team } from '#lib/engine/types.ts';
import type { Store, StoredState } from './types';

interface Data {
	state: StoredState;
	protocols: Protocol[];
	challenges: Challenge[];
	teams: Team[];
	attempts: Attempt[];
	submissions: Submission[];
}

const key = (teamId: string, challengeId: string) => `${teamId}\u0000${challengeId}`;
const clone = <T>(v: T): T => structuredClone(v);

/**
 * Single-process store. Node runs each handler's synchronous section atomically, so the
 * check-then-write in casState/updateAttempt is race free. State is flushed to a JSON file
 * (debounced) so a restart mid-event doesn't lose progress.
 */
export class MemoryStore implements Store {
	readonly kind = 'memory' as const;
	private d: Data;
	private attempts = new Map<string, Attempt>();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private file: string | null) {
		this.d = this.load();
		for (const a of this.d.attempts) this.attempts.set(key(a.teamId, a.challengeId), a);
		for (const t of this.d.teams) t.rounds ??= {};
	}

	private load(): Data {
		const empty: Data = {
			state: { ...initialState(Date.now()), finalResults: null },
			protocols: [],
			challenges: [],
			teams: [],
			attempts: [],
			submissions: []
		};
		if (!this.file) return empty;
		try {
			return { ...empty, ...JSON.parse(readFileSync(this.file, 'utf8')) };
		} catch {
			return empty;
		}
	}

	private dirty() {
		if (!this.file || this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			this.flush();
		}, 1000);
	}

	flush() {
		if (!this.file) return;
		this.d.attempts = [...this.attempts.values()];
		mkdirSync(dirname(this.file), { recursive: true });
		const tmp = `${this.file}.tmp`;
		writeFileSync(tmp, JSON.stringify(this.d));
		renameSync(tmp, this.file);
	}

	async getState() {
		return clone(this.d.state);
	}
	async casState(next: StoredState, expectedVersion: number) {
		if (this.d.state.version !== expectedVersion) return false;
		this.d.state = clone(next);
		this.dirty();
		return true;
	}

	async listProtocols() {
		return clone(this.d.protocols).sort((a, b) => a.index - b.index);
	}
	async upsertProtocols(rows: Protocol[]) {
		for (const r of rows) {
			const i = this.d.protocols.findIndex((p) => p.id === r.id);
			if (i >= 0) this.d.protocols[i] = clone(r);
			else this.d.protocols.push(clone(r));
		}
		this.dirty();
	}

	async listChallenges() {
		return clone(this.d.challenges);
	}
	async upsertChallenges(rows: Challenge[]) {
		for (const r of rows) {
			const i = this.d.challenges.findIndex((c) => c.id === r.id);
			if (i >= 0) this.d.challenges[i] = clone(r);
			else this.d.challenges.push(clone(r));
		}
		this.dirty();
	}
	async deleteChallenge(id: string) {
		this.d.challenges = this.d.challenges.filter((c) => c.id !== id);
		for (const [k, a] of this.attempts) if (a.challengeId === id) this.attempts.delete(k);
		this.dirty();
	}

	async deleteGenerated(filter: { teamId?: string; protocol?: string } = {}) {
		const hit = (c: Challenge) =>
			Boolean(c.teamId) && (!filter.teamId || c.teamId === filter.teamId) && (!filter.protocol || c.protocol === filter.protocol);
		const gone = new Set(this.d.challenges.filter(hit).map((c) => c.id));
		if (!gone.size) return;
		this.d.challenges = this.d.challenges.filter((c) => !gone.has(c.id));
		for (const [k, a] of this.attempts) if (gone.has(a.challengeId)) this.attempts.delete(k);
		this.dirty();
	}

	async listTeams() {
		return clone(this.d.teams);
	}
	async getTeam(id: string) {
		const t = this.d.teams.find((t) => t.id === id);
		return t ? clone(t) : null;
	}
	async insertTeam(team: Team) {
		if (this.d.teams.some((t) => t.id === team.id || t.name.toLowerCase() === team.name.toLowerCase())) {
			throw new Error('Team already exists');
		}
		this.d.teams.push(clone(team));
		this.dirty();
	}
	async updateTeam(id: string, patch: Partial<Omit<Team, 'id'>>) {
		const t = this.d.teams.find((t) => t.id === id);
		if (t) Object.assign(t, clone(patch));
		this.dirty();
	}
	async deleteTeam(id: string) {
		this.d.teams = this.d.teams.filter((t) => t.id !== id);
		await this.wipeProgress({ teamId: id });
	}

	async listAttempts(teamId?: string) {
		const all = [...this.attempts.values()];
		return clone(teamId ? all.filter((a) => a.teamId === teamId) : all);
	}
	async openAttempt(a: Attempt) {
		const k = key(a.teamId, a.challengeId);
		const existing = this.attempts.get(k);
		if (existing) return clone(existing);
		this.attempts.set(k, clone(a));
		this.dirty();
		return clone(a);
	}
	async updateAttempt(teamId: string, challengeId: string, expectedTries: number, patch: Partial<Attempt>) {
		const a = this.attempts.get(key(teamId, challengeId));
		if (!a || a.tries !== expectedTries || a.status !== 'open') return false;
		Object.assign(a, patch);
		this.dirty();
		return true;
	}

	async insertSubmission(s: Submission) {
		this.d.submissions.push(s);
		this.dirty();
	}
	async countSubmissions() {
		return this.d.submissions.length;
	}

	async wipeProgress(filter: { teamId?: string; protocol?: string } = {}) {
		const hit = (x: { teamId: string; protocol: string }) =>
			(!filter.teamId || x.teamId === filter.teamId) && (!filter.protocol || x.protocol === filter.protocol);
		for (const [k, a] of this.attempts) if (hit(a)) this.attempts.delete(k);
		this.d.submissions = this.d.submissions.filter((s) => !hit(s));
		this.dirty();
	}

	async publishSnapshot() {
		// Delivered in-process over SSE by the snapshot publisher.
	}
}
