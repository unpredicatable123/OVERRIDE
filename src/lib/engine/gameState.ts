import { PROTOCOL_IDS, type ProtocolId } from './types';

/** Protocols teams play at their own pace during EVENT_LIVE. The boss fight stays admin-driven. */
export const SELF_PACED: readonly ProtocolId[] = ['scan', 'decode', 'trace', 'escape', 'overdrive'];

/**
 * Centralised event state machine. Every phase change in the arena goes through `transition`.
 * Pure: time is passed in, nothing is read from the environment.
 */

export const PHASES = [
	'EVENT_IDLE',
	'EVENT_LOBBY',
	/** Self-paced run: every team moves through SELF_PACED on its own round clock. */
	'EVENT_LIVE',
	'LIVE_PAUSED',
	'ROUND_READY',
	'ROUND_ACTIVE',
	'ROUND_PAUSED',
	'ROUND_COMPLETED',
	'BOSS_ACTIVE',
	'BOSS_COMPLETED',
	'RESULTS_LOCKED',
	'RESULTS_FINALIZED',
	'EVENT_COMPLETE'
] as const;
export type Phase = (typeof PHASES)[number];

export interface RoundClock {
	startedAt: number;
	durationMs: number;
	/** pauseClockMs value when the round started. */
	pauseBaseMs: number;
}

export interface EventState {
	version: number;
	phase: Phase;
	protocol: ProtocolId | null;
	completed: ProtocolId[];
	round: RoundClock | null;
	/** Total milliseconds the event has spent paused (monotonic, never reset). */
	pauseClockMs: number;
	pausedAt: number | null;
	submissionsLocked: boolean;
	finalizedAt: number | null;
	updatedAt: number;
}

export type GameAction =
	| { type: 'OPEN_LOBBY' }
	| { type: 'START_LIVE' }
	| { type: 'PREPARE_ROUND'; protocol: ProtocolId }
	| { type: 'START_ROUND'; durationMs: number }
	| { type: 'PAUSE' }
	| { type: 'RESUME' }
	| { type: 'EXTEND'; seconds: number }
	| { type: 'END_ROUND' }
	| { type: 'LOCK_SUBMISSIONS' }
	| { type: 'UNLOCK_SUBMISSIONS' }
	| { type: 'LOCK_RESULTS' }
	| { type: 'FINALIZE' }
	| { type: 'COMPLETE_EVENT' }
	| { type: 'RESET' };

export type ActionType = GameAction['type'];

export function initialState(now = 0): EventState {
	return {
		version: 0,
		phase: 'EVENT_IDLE',
		protocol: null,
		completed: [],
		round: null,
		pauseClockMs: 0,
		pausedAt: null,
		submissionsLocked: false,
		finalizedAt: null,
		updatedAt: now
	};
}

/** Which actions are legal in each phase. The admin UI renders directly from this table. */
const ALLOWED: Record<Phase, ActionType[]> = {
	EVENT_IDLE: ['OPEN_LOBBY', 'RESET'],
	EVENT_LOBBY: ['START_LIVE', 'PREPARE_ROUND', 'RESET'],
	EVENT_LIVE: ['PAUSE', 'LOCK_SUBMISSIONS', 'UNLOCK_SUBMISSIONS', 'PREPARE_ROUND', 'RESET'],
	LIVE_PAUSED: ['RESUME', 'RESET'],
	ROUND_READY: ['START_ROUND', 'PREPARE_ROUND', 'RESET'],
	ROUND_ACTIVE: ['PAUSE', 'EXTEND', 'END_ROUND', 'LOCK_SUBMISSIONS', 'UNLOCK_SUBMISSIONS', 'RESET'],
	ROUND_PAUSED: ['RESUME', 'EXTEND', 'END_ROUND', 'RESET'],
	ROUND_COMPLETED: ['PREPARE_ROUND', 'RESET'],
	BOSS_ACTIVE: ['PAUSE', 'EXTEND', 'END_ROUND', 'LOCK_SUBMISSIONS', 'UNLOCK_SUBMISSIONS', 'RESET'],
	BOSS_COMPLETED: ['LOCK_RESULTS', 'FINALIZE', 'RESET'],
	RESULTS_LOCKED: ['FINALIZE', 'RESET'],
	RESULTS_FINALIZED: ['COMPLETE_EVENT', 'RESET'],
	EVENT_COMPLETE: ['RESET']
};

export function availableActions(state: EventState): ActionType[] {
	return ALLOWED[state.phase].filter((a) => {
		if (a === 'LOCK_SUBMISSIONS') return !state.submissionsLocked;
		if (a === 'UNLOCK_SUBMISSIONS') return state.submissionsLocked;
		return true;
	});
}

export type TransitionResult = { ok: true; state: EventState } | { ok: false; error: string };

export function transition(state: EventState, action: GameAction, now: number): TransitionResult {
	if (!ALLOWED[state.phase].includes(action.type)) {
		return { ok: false, error: `${action.type} is not allowed during ${state.phase}` };
	}
	const next = applyAction(state, action, now);
	if (typeof next === 'string') return { ok: false, error: next };
	return { ok: true, state: { ...next, version: state.version + 1, updatedAt: now } };
}

function applyAction(s: EventState, a: GameAction, now: number): EventState | string {
	switch (a.type) {
		case 'OPEN_LOBBY':
			return { ...s, phase: 'EVENT_LOBBY' };

		case 'START_LIVE':
			return { ...s, phase: 'EVENT_LIVE', protocol: null, round: null, submissionsLocked: false };

		case 'PREPARE_ROUND':
			if (!PROTOCOL_IDS.includes(a.protocol)) return 'Unknown protocol';
			// Leaving the self-paced run: only the boss fight can follow, and every self-paced round is over.
			if (s.phase === 'EVENT_LIVE') {
				if (a.protocol !== 'override') return 'During the self-paced run only the OVERRIDE boss fight can be prepared';
				return {
					...s,
					phase: 'ROUND_READY',
					protocol: a.protocol,
					round: null,
					submissionsLocked: false,
					completed: [...new Set([...s.completed, ...SELF_PACED])]
				};
			}
			return {
				...s,
				phase: 'ROUND_READY',
				protocol: a.protocol,
				round: null,
				submissionsLocked: false
			};

		case 'START_ROUND':
			if (!s.protocol) return 'No protocol prepared';
			if (!(a.durationMs > 0)) return 'Round duration must be positive';
			return {
				...s,
				phase: s.protocol === 'override' ? 'BOSS_ACTIVE' : 'ROUND_ACTIVE',
				round: { startedAt: now, durationMs: a.durationMs, pauseBaseMs: s.pauseClockMs },
				submissionsLocked: false
			};

		case 'PAUSE':
			return { ...s, phase: s.phase === 'EVENT_LIVE' ? 'LIVE_PAUSED' : 'ROUND_PAUSED', pausedAt: now };

		case 'RESUME': {
			const paused = s.pausedAt === null ? 0 : Math.max(0, now - s.pausedAt);
			return {
				...s,
				phase: s.phase === 'LIVE_PAUSED' ? 'EVENT_LIVE' : s.protocol === 'override' ? 'BOSS_ACTIVE' : 'ROUND_ACTIVE',
				pausedAt: null,
				pauseClockMs: s.pauseClockMs + paused
			};
		}

		case 'EXTEND': {
			if (!s.round) return 'No round running';
			const seconds = Math.round(a.seconds);
			if (!Number.isFinite(seconds) || seconds === 0 || Math.abs(seconds) > 3600) return 'Invalid extension';
			const durationMs = Math.max(1000, s.round.durationMs + seconds * 1000);
			return { ...s, round: { ...s.round, durationMs } };
		}

		case 'END_ROUND': {
			// Close out an in-progress pause so the pause clock stays consistent.
			const paused = s.pausedAt === null ? 0 : Math.max(0, now - s.pausedAt);
			const protocol = s.protocol!;
			return {
				...s,
				phase: protocol === 'override' ? 'BOSS_COMPLETED' : 'ROUND_COMPLETED',
				pausedAt: null,
				pauseClockMs: s.pauseClockMs + paused,
				completed: s.completed.includes(protocol) ? s.completed : [...s.completed, protocol]
			};
		}

		case 'LOCK_SUBMISSIONS':
			return { ...s, submissionsLocked: true };

		case 'UNLOCK_SUBMISSIONS':
			return { ...s, submissionsLocked: false };

		case 'LOCK_RESULTS':
			return { ...s, phase: 'RESULTS_LOCKED', submissionsLocked: true };

		case 'FINALIZE':
			return { ...s, phase: 'RESULTS_FINALIZED', submissionsLocked: true, finalizedAt: now };

		case 'COMPLETE_EVENT':
			return { ...s, phase: 'EVENT_COMPLETE' };

		case 'RESET':
			return { ...initialState(now), pauseClockMs: 0 };
	}
}

/** Pause clock value at `now`, including an in-progress pause. */
export function pauseClockAt(s: EventState, now: number): number {
	return s.pauseClockMs + (s.pausedAt === null ? 0 : Math.max(0, now - s.pausedAt));
}

/** Milliseconds left on the round clock, or null when no round is timed. */
export function roundRemainingMs(s: EventState, now: number): number | null {
	if (!s.round) return null;
	const paused = pauseClockAt(s, now) - s.round.pauseBaseMs;
	return Math.max(0, s.round.startedAt + s.round.durationMs + paused - now);
}

export function isLivePhase(phase: Phase): boolean {
	return phase === 'ROUND_ACTIVE' || phase === 'BOSS_ACTIVE';
}

export type SubmissionGate = { open: true } | { open: false; reason: string };

export function isPausedPhase(phase: Phase): boolean {
	return phase === 'ROUND_PAUSED' || phase === 'LIVE_PAUSED';
}

export function isSelfPacedPhase(phase: Phase): boolean {
	return phase === 'EVENT_LIVE' || phase === 'LIVE_PAUSED';
}

/**
 * Event-level gate. In the self-paced run the round clock belongs to each team, so the caller
 * must still check the team's own round (see `currentRound`).
 */
export function submissionGate(s: EventState, now: number): SubmissionGate {
	if (s.phase === 'LIVE_PAUSED') return { open: false, reason: 'SYSTEM HALTED — the arena is paused' };
	if (s.phase === 'EVENT_LIVE') return s.submissionsLocked ? { open: false, reason: 'Submissions are locked' } : { open: true };
	if (s.phase === 'ROUND_PAUSED') return { open: false, reason: 'SYSTEM HALTED — protocol paused' };
	if (!isLivePhase(s.phase)) return { open: false, reason: 'No protocol is live' };
	if (s.submissionsLocked) return { open: false, reason: 'Submissions are locked' };
	if ((roundRemainingMs(s, now) ?? 0) <= 0) return { open: false, reason: 'Protocol timer expired' };
	return { open: true };
}

export type BoardMode = 'live' | 'boss' | 'final';

/**
 * Leaderboard visibility rule. Once the boss protocol is prepared, only boss XP is visible.
 * Aggregated totals appear only after the admin finalizes.
 */
export function boardMode(s: EventState): BoardMode {
	if (s.phase === 'RESULTS_FINALIZED' || s.phase === 'EVENT_COMPLETE') return 'final';
	if (s.protocol === 'override') return 'boss';
	if (s.phase === 'BOSS_ACTIVE' || s.phase === 'BOSS_COMPLETED' || s.phase === 'RESULTS_LOCKED') return 'boss';
	return 'live';
}
