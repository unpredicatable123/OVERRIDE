import { isExpired, maxXp } from './scoring';
import type { Attempt, Challenge, Protocol } from './types';
import type { ChallengeStatus, ChallengeView } from './views';

/**
 * How a challenge looks to one team at one instant: unlock order, hard-timeout expiry and which
 * content may be shown. Shared by the authoritative server and the local demo sandbox.
 */

export interface Clock {
	now: number;
	/** Total paused milliseconds at `now` (0 when the event was never paused). */
	pauseClock: number;
}

const MASK = '▒▒▒▒▒▒▒▒';

/** An open attempt on a hard-timeout challenge counts as failed once its fuse burns out. */
export function effective(a: Attempt | undefined, ch: Challenge, clock: Clock): Attempt | undefined {
	if (!a || a.status !== 'open' || !ch.hardTimeout) return a;
	const elapsed = clock.now - a.startedAt - (clock.pauseClock - a.pauseClockAtStart);
	return isExpired(elapsed, ch.timeLimitSec, true) ? { ...a, status: 'failed' } : a;
}

export function isClosed(a: Attempt | undefined): boolean {
	return a !== undefined && a.status !== 'open';
}

/** Unlock rule for a challenge given the team's attempts. */
export function statusOf(ch: Challenge, list: Challenge[], attempts: Map<string, Attempt>, protocol: Protocol, clock: Clock): ChallengeStatus {
	const a = effective(attempts.get(ch.id), ch, clock);
	if (a) return a.status;
	if (protocol.flow === 'sequence') {
		const i = list.indexOf(ch);
		if (i > 0 && !isClosed(effective(attempts.get(list[i - 1].id), list[i - 1], clock))) return 'locked';
	}
	return 'ready';
}

export function projectChallenge(
	ch: Challenge,
	status: ChallengeStatus,
	a: Attempt | undefined,
	clock: Clock,
	opts: { halted: boolean; hidden: boolean }
): ChallengeView {
	const timedNotOpened = status === 'ready' && ch.timeLimitSec !== null;
	const showContent = !opts.halted && !opts.hidden && status !== 'locked' && !timedNotOpened;
	const masked = status === 'locked' || opts.hidden;
	return {
		id: ch.id,
		order: ch.order,
		title: masked ? MASK : ch.title,
		tag: ch.tag,
		kind: ch.kind,
		difficulty: ch.difficulty,
		baseXp: ch.baseXp,
		maxXp: maxXp(ch.baseXp, ch.difficulty),
		timeLimitSec: ch.timeLimitSec,
		hardTimeout: ch.hardTimeout,
		maxAttempts: ch.maxAttempts,
		status: opts.hidden ? 'locked' : status,
		tries: a?.tries ?? 0,
		xp: a?.status === 'solved' ? a.xp : 0,
		startedAt: a?.startedAt ?? null,
		deadlineAt: a && ch.timeLimitSec !== null ? a.startedAt + ch.timeLimitSec * 1000 + (clock.pauseClock - a.pauseClockAtStart) : null,
		content: showContent ? { prompt: ch.prompt, blocks: ch.blocks, options: ch.options, hint: a && a.tries > 0 ? ch.hint : null } : null,
		reveal: isClosed(a) ? ch.reveal : null
	};
}
