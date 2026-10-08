// Domain model shared by server, client and tests. No I/O lives in #lib/engine.

export const PROTOCOL_IDS = ['scan', 'decode', 'trace', 'escape', 'overdrive', 'override'] as const;
export type ProtocolId = (typeof PROTOCOL_IDS)[number];

export type Difficulty = 'easy' | 'medium' | 'hard' | 'boss';

/**
 * How challenges inside a protocol unlock.
 * - grid: bingo board, every cell open, completed lines award a bonus
 * - free: every challenge open, any order
 * - sequence: challenge N unlocks once challenge N-1 is closed (solved or failed)
 */
export type Flow = 'grid' | 'free' | 'sequence';

export type ChallengeKind = 'text' | 'choice';

/** Rich content blocks used for puzzles, evidence and dossiers. */
export type Block =
	| { type: 'text'; text: string }
	| { type: 'code'; label?: string; text: string }
	| { type: 'log'; label?: string; lines: string[] }
	| { type: 'table'; label?: string; columns: string[]; rows: string[][] }
	| { type: 'note'; label?: string; text: string };

export interface Protocol {
	id: ProtocolId;
	index: number;
	code: string; // P-01
	name: string; // SCAN
	title: string; // Tech Bingo
	tagline: string;
	/** Narrative shown while the protocol is READY. Never contains puzzle data. */
	story: string;
	/** Shared evidence shown only while the protocol is live (e.g. the TRACE case file). */
	dossier: Block[];
	flow: Flow;
	durationSec: number;
	/** grid flow only: XP for each completed row / column / diagonal. */
	lineBonus: number;
}

export interface Challenge {
	id: string;
	protocol: ProtocolId;
	order: number;
	title: string;
	/** Short label: bingo cell caption, escape subsystem name, etc. */
	tag: string;
	kind: ChallengeKind;
	prompt: string;
	blocks: Block[];
	options: string[];
	/** Accepted answers. SERVER ONLY. */
	answers: string[];
	baseXp: number;
	difficulty: Difficulty;
	/** null = fixed XP, no speed factor. */
	timeLimitSec: number | null;
	/** When true, submissions after the time limit fail. Otherwise XP decays to the floor. */
	hardTimeout: boolean;
	maxAttempts: number;
	/** Revealed once the challenge closes (decode keys, escape unlock messages). SERVER ONLY until closed. */
	reveal: string | null;
	hint: string | null;
	active: boolean;
	/** Owner of a generated, per-team challenge. null / absent = shared base content. */
	teamId?: string | null;
}

export interface Team {
	id: string; // OV-042
	name: string;
	/** players[1] is '' while the second player hasn't accepted the invite yet. */
	players: [string, string];
	accessKey: string;
	/** Invite token for the second player; null once the team is full. */
	inviteCode: string | null;
	disabled: boolean;
	joinedAt: number | null;
	createdAt: number;
	/** Self-paced run: when this team started each of its own rounds. */
	rounds: TeamRounds;
}

/** One team's own round clock in the self-paced run. */
export interface RoundStart {
	startedAt: number;
	/** Event pause clock when the round started; paused time doesn't count against the team. */
	pauseClockAtStart: number;
}

export type TeamRounds = Partial<Record<ProtocolId, RoundStart>>;

export type AttemptStatus = 'open' | 'solved' | 'failed';

/** One row per (team, challenge). Authoritative source of all XP. */
export interface Attempt {
	teamId: string;
	challengeId: string;
	protocol: ProtocolId;
	startedAt: number;
	/** Event pause clock at the moment the attempt opened; used to exclude paused time. */
	pauseClockAtStart: number;
	tries: number;
	status: AttemptStatus;
	xp: number;
	closedAt: number | null;
}

export interface Submission {
	teamId: string;
	challengeId: string;
	protocol: ProtocolId;
	answer: string;
	correct: boolean;
	xp: number;
	tryNo: number;
	elapsedMs: number;
	at: number;
}
