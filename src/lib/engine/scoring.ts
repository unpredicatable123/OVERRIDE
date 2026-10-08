import type { ChallengeKind, Difficulty } from './types';

/**
 * THE scoring engine. Every XP number in OVERRIDE is produced here.
 *
 *   XP = round( BASE × DIFFICULTY × SPEED × ACCURACY )
 *
 * SPEED (time-based challenges only) follows a cosine ease from 1.0 down to SPEED_FLOOR:
 *   t     = clamp(elapsed / limit, 0, 1)
 *   speed = FLOOR + (1 − FLOOR) × (1 + cos(π·t)) / 2
 * The curve is flat at the start (reading time isn't punished), steepest mid-way and flat
 * again near the limit, so a correct late answer still earns ≥ 40% of the max XP.
 *
 * ACCURACY punishes guessing:
 *   - choice questions: only the first try can earn XP (a lucky second guess earns 0)
 *   - text answers: 1.0, 0.7, 0.45, 0.25 for tries 1..4+
 *   - wrong answers always earn 0, XP is never negative
 *
 * All factors are rounded to 4 decimals before multiplying so results are reproducible.
 */

export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
	easy: 1,
	medium: 1.25,
	hard: 1.5,
	boss: 2
};

export const SPEED_FLOOR = 0.4;
export const TEXT_TRY_MULTIPLIERS = [1, 0.7, 0.45, 0.25] as const;
/** Network grace allowed on hard timeouts. */
export const HARD_TIMEOUT_GRACE_MS = 1500;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function maxXp(baseXp: number, difficulty: Difficulty): number {
	return Math.round(Math.max(0, baseXp) * DIFFICULTY_MULTIPLIER[difficulty]);
}

export function speedFactor(elapsedMs: number, timeLimitSec: number | null): number {
	if (timeLimitSec === null || timeLimitSec <= 0) return 1;
	const t = clamp01(elapsedMs / (timeLimitSec * 1000));
	return round4(SPEED_FLOOR + (1 - SPEED_FLOOR) * ((1 + Math.cos(Math.PI * t)) / 2));
}

export function accuracyFactor(kind: ChallengeKind, tryNo: number): number {
	if (tryNo < 1) return 0;
	if (kind === 'choice') return tryNo === 1 ? 1 : 0;
	return TEXT_TRY_MULTIPLIERS[Math.min(tryNo, TEXT_TRY_MULTIPLIERS.length) - 1];
}

export interface ScoreInput {
	baseXp: number;
	difficulty: Difficulty;
	kind: ChallengeKind;
	timeLimitSec: number | null;
	hardTimeout: boolean;
	elapsedMs: number;
	tryNo: number;
	correct: boolean;
}

export interface ScoreResult {
	xp: number;
	maxXp: number;
	speed: number;
	accuracy: number;
	/** True when a hard timeout rejected the submission. */
	expired: boolean;
}

export function isExpired(elapsedMs: number, timeLimitSec: number | null, hardTimeout: boolean): boolean {
	return hardTimeout && timeLimitSec !== null && elapsedMs > timeLimitSec * 1000 + HARD_TIMEOUT_GRACE_MS;
}

export function scoreSubmission(input: ScoreInput): ScoreResult {
	const max = maxXp(input.baseXp, input.difficulty);
	const elapsed = Math.max(0, Math.floor(input.elapsedMs));
	const expired = isExpired(elapsed, input.timeLimitSec, input.hardTimeout);
	const speed = speedFactor(elapsed, input.timeLimitSec);
	const accuracy = accuracyFactor(input.kind, input.tryNo);
	if (!input.correct || expired) return { xp: 0, maxXp: max, speed, accuracy, expired };
	return { xp: Math.max(0, Math.round(max * speed * accuracy)), maxXp: max, speed, accuracy, expired };
}

/** Number of completed rows, columns and diagonals on a size×size bingo grid. */
export function bingoLines(solvedCells: Iterable<number>, size: number): number {
	const s = new Set(solvedCells);
	const has = (r: number, c: number) => s.has(r * size + c);
	let lines = 0;
	for (let i = 0; i < size; i++) {
		let row = true;
		let col = true;
		for (let j = 0; j < size; j++) {
			row &&= has(i, j);
			col &&= has(j, i);
		}
		if (row) lines++;
		if (col) lines++;
	}
	let d1 = true;
	let d2 = true;
	for (let i = 0; i < size; i++) {
		d1 &&= has(i, i);
		d2 &&= has(i, size - 1 - i);
	}
	return lines + (d1 ? 1 : 0) + (d2 ? 1 : 0);
}

export const BINGO_SIZE = 4;
