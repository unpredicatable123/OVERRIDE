import { SELF_PACED } from './gameState';
import { effective, isClosed, type Clock } from './projection';
import type { Attempt, Challenge, Protocol, ProtocolId, RoundStart, TeamRounds } from './types';

/**
 * Self-paced run: where one team is. Derived — never stored — from the team's round start
 * times, its attempts and the clock, so it can't drift out of sync with the authoritative rows.
 *
 * A round is over once every challenge in it is closed (solved / failed) or the team's own
 * round clock runs out. The next protocol then opens in `ready` and its clock starts when the
 * team initializes it. After the last self-paced protocol the team waits for the boss fight.
 */

export type TeamRoundStatus = 'ready' | 'live' | 'waiting';

export interface TeamRound {
	/** null once every self-paced protocol is done. */
	protocol: ProtocolId | null;
	status: TeamRoundStatus;
	/** Pause-adjusted remaining time on the team's own clock (live only). */
	remainingMs: number | null;
	durationMs: number | null;
	/** Self-paced protocols this team has finished, in order. */
	completed: ProtocolId[];
}

/** Pause-adjusted milliseconds left on one team's round clock. */
export function roundRemaining(start: RoundStart, durationMs: number, clock: Clock): number {
	const paused = clock.pauseClock - start.pauseClockAtStart;
	return Math.max(0, start.startedAt + durationMs + paused - clock.now);
}

export function allClosed(list: Challenge[], attempts: Map<string, Attempt>, clock: Clock): boolean {
	return list.length > 0 && list.every((ch) => isClosed(effective(attempts.get(ch.id), ch, clock)));
}

export function currentRound(
	rounds: TeamRounds,
	protocols: Map<ProtocolId, Protocol>,
	/** The team's challenge list for a protocol, or null while it is still being generated. */
	listOf: (p: ProtocolId) => Challenge[] | null,
	attempts: Map<string, Attempt>,
	clock: Clock
): TeamRound {
	const completed: ProtocolId[] = [];
	for (const id of SELF_PACED) {
		const p = protocols.get(id);
		if (!p) continue;
		const durationMs = p.durationSec * 1000;
		const start = rounds[id];
		if (!start) return { protocol: id, status: 'ready', remainingMs: null, durationMs, completed };
		const remainingMs = roundRemaining(start, durationMs, clock);
		const list = listOf(id);
		if (remainingMs > 0 && !(list && allClosed(list, attempts, clock))) {
			return { protocol: id, status: 'live', remainingMs, durationMs, completed };
		}
		completed.push(id);
	}
	return { protocol: null, status: 'waiting', remainingMs: null, durationMs: null, completed };
}

/** The protocol a team plays after `id` (the boss fight follows the last self-paced round). */
export function nextProtocol(id: ProtocolId): ProtocolId | null {
	const i = SELF_PACED.indexOf(id);
	if (i < 0) return null;
	return SELF_PACED[i + 1] ?? 'override';
}
