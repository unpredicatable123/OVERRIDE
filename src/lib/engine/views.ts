// Wire types: what the server is allowed to send to clients.
import type { ActionType, BoardMode, Phase } from './gameState';
import type { Board, FinalResult, RoundScores } from './leaderboard';
import type { TeamRoundStatus } from './progress';
import type { AttemptStatus, Block, ChallengeKind, Difficulty, Flow, ProtocolId } from './types';

export interface ProtocolMeta {
	id: ProtocolId;
	index: number;
	code: string;
	name: string;
	title: string;
	tagline: string;
	durationSec: number;
}

export interface PublicState {
	version: number;
	phase: Phase;
	protocol: ProtocolId | null;
	completed: ProtocolId[];
	/** Server timestamp when the round ends; null when paused or not running. */
	endsAt: number | null;
	remainingMs: number | null;
	durationMs: number | null;
	submissionsLocked: boolean;
	finalizedAt: number | null;
}

/** Player screens hold back final results this long so the projector reveal isn't spoiled. */
export const REVEAL_HOLD_MS = 34_000;

export interface FeedItem {
	id: number;
	at: number;
	teamId: string;
	team: string;
	protocol: ProtocolId;
	label: string;
	xp: number;
	kind: 'solve' | 'bingo' | 'escape';
}

export interface ArenaStats {
	teams: number;
	activeTeams: number;
	submissions: number;
	avgXp: number;
	/** Self-paced run: active teams per SELF_PACED protocol; the last entry counts teams waiting for the boss. */
	stages: number[];
}

/** The single realtime payload every screen renders from. */
export interface ArenaSnapshot {
	seq: number;
	serverNow: number;
	state: PublicState;
	protocols: ProtocolMeta[];
	stats: ArenaStats;
	board: Board;
	feed: FeedItem[];
	final: FinalResult[] | null;
}

export type ChallengeStatus = 'locked' | 'ready' | AttemptStatus;

export interface ChallengeView {
	id: string;
	order: number;
	title: string;
	tag: string;
	kind: ChallengeKind;
	difficulty: Difficulty;
	baseXp: number;
	maxXp: number;
	timeLimitSec: number | null;
	hardTimeout: boolean;
	maxAttempts: number;
	status: ChallengeStatus;
	tries: number;
	xp: number;
	startedAt: number | null;
	/** Server time when this challenge's clock runs out (pause-adjusted); null if untimed / not opened. */
	deadlineAt: number | null;
	/** Only present when the content may be shown (opened, or untimed and unlocked). */
	content: { prompt: string; blocks: Block[]; options: string[]; hint: string | null } | null;
	reveal: string | null;
}

export interface ProtocolView extends ProtocolMeta {
	story: string;
	flow: Flow;
	lineBonus: number;
	dossier: Block[] | null;
}

export interface TeamStateView {
	serverNow: number;
	stateVersion: number;
	team: { id: string; name: string; players: [string, string] };
	/** Invite token while the second seat is empty (only ever sent to the team itself). */
	invite: string | null;
	protocol: ProtocolView | null;
	challenges: ChallengeView[];
	/** XP the team may see right now (boss-only during the boss fight). */
	xp: number;
	xpLabel: string;
	rounds: Partial<RoundScores>;
	rank: number | null;
	teamsRanked: number;
	bingoLines: number;
	mode: BoardMode;
	/** This team's own round during the self-paced run; null otherwise. */
	selfPaced: {
		status: TeamRoundStatus;
		/** Server time the team's round clock runs out; null unless running. */
		endsAt: number | null;
		remainingMs: number | null;
		durationMs: number | null;
		completed: ProtocolId[];
	} | null;
	/** The team's question set for the current protocol is still being generated. */
	generating: boolean;
}

export interface SubmitResult {
	outcome: 'accepted' | 'denied' | 'failed' | 'expired';
	xp: number;
	maxXp: number;
	speed: number;
	accuracy: number;
	triesLeft: number;
	bonusXp: number;
	message: string;
	challenge: ChallengeView;
	nextUnlocked: string | null;
}

export interface AdminTeamRow {
	id: string;
	name: string;
	players: [string, string];
	accessKey: string;
	disabled: boolean;
	joinedAt: number | null;
	solved: number;
	/** Visible metric only (boss XP during the boss fight). */
	xp: number;
	rounds: Partial<RoundScores>;
	/** Self-paced run: e.g. "DECODE", "DECODE (READY)", "BOSS GATE". null outside the run. */
	stage: string | null;
}

export interface GenerationStatus {
	/** Gemini is configured; otherwise sets are randomized locally. */
	gemini: boolean;
	model: string;
	/** Sets created since the server started. */
	sets: number;
	/** Sets that fell back to local randomization because Gemini failed. */
	fallbacks: number;
	pending: number;
}

export interface AdminOverview {
	snapshot: ArenaSnapshot;
	actions: ActionType[];
	teams: AdminTeamRow[];
	generation: GenerationStatus;
}
