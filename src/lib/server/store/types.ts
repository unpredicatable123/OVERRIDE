import type { EventState } from '#lib/engine/gameState.ts';
import type { FinalResult } from '#lib/engine/leaderboard.ts';
import type { Attempt, Challenge, Protocol, ProtocolId, Submission, Team } from '#lib/engine/types.ts';
import type { ArenaSnapshot } from '#lib/engine/views.ts';

export interface StoredState extends EventState {
	finalResults: FinalResult[] | null;
}

/**
 * Persistence boundary. Two implementations: Supabase (production) and memory (dev, demos,
 * simulation). Conditional writes (`casState`, `updateAttempt`) make concurrent submissions
 * from both teammates safe.
 */
export interface Store {
	readonly kind: 'memory' | 'supabase';

	getState(): Promise<StoredState>;
	/** Writes `next` only if the stored version still equals `expectedVersion`. */
	casState(next: StoredState, expectedVersion: number): Promise<boolean>;

	listProtocols(): Promise<Protocol[]>;
	upsertProtocols(rows: Protocol[]): Promise<void>;

	listChallenges(): Promise<Challenge[]>;
	upsertChallenges(rows: Challenge[]): Promise<void>;
	deleteChallenge(id: string): Promise<void>;
	/** Deletes generated (per-team) challenges and, through them, their attempts. Base content is untouched. */
	deleteGenerated(filter?: { teamId?: string; protocol?: ProtocolId }): Promise<void>;

	listTeams(): Promise<Team[]>;
	getTeam(id: string): Promise<Team | null>;
	insertTeam(team: Team): Promise<void>;
	updateTeam(id: string, patch: Partial<Omit<Team, 'id'>>): Promise<void>;
	deleteTeam(id: string): Promise<void>;

	listAttempts(teamId?: string): Promise<Attempt[]>;
	/** Inserts if absent; returns the stored row either way. */
	openAttempt(a: Attempt): Promise<Attempt>;
	/** Applies `patch` only if the row still has `expectedTries` tries and is open. */
	updateAttempt(teamId: string, challengeId: string, expectedTries: number, patch: Partial<Attempt>): Promise<boolean>;

	insertSubmission(s: Submission): Promise<void>;
	countSubmissions(): Promise<number>;

	/** Deletes attempts + submissions (for one team, one protocol, or everyone). */
	wipeProgress(filter?: { teamId?: string; protocol?: ProtocolId }): Promise<void>;

	publishSnapshot(s: ArenaSnapshot): Promise<void>;
}
