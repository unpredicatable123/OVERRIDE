import { describe, expect, it } from 'vitest';
import { matchesAnswer } from './answers';
import { availableActions, boardMode, initialState, roundRemainingMs, submissionGate, transition, type EventState, type GameAction } from './gameState';
import { buildBoard, buildFinal, computeScores } from './leaderboard';
import { bingoLines, maxXp, scoreSubmission, speedFactor, SPEED_FLOOR } from './scoring';
import type { Attempt, Challenge, Protocol, ProtocolId, Team } from './types';

const base = { baseXp: 500, difficulty: 'easy' as const, kind: 'text' as const, timeLimitSec: 60, hardTimeout: false, tryNo: 1, correct: true };

describe('scoring', () => {
	it('applies difficulty multipliers', () => {
		expect(maxXp(400, 'hard')).toBe(600);
		expect(maxXp(400, 'boss')).toBe(800);
		expect(maxXp(400, 'medium')).toBe(500);
	});

	it('rewards faster correct answers with a smooth curve', () => {
		const fast = scoreSubmission({ ...base, elapsedMs: 18_000 }).xp;
		const slow = scoreSubmission({ ...base, elapsedMs: 55_000 }).xp;
		expect(fast).toBeGreaterThan(slow);
		let prev = Infinity;
		for (let ms = 0; ms <= 60_000; ms += 1000) {
			const xp = scoreSubmission({ ...base, elapsedMs: ms }).xp;
			expect(xp).toBeLessThanOrEqual(prev);
			prev = xp;
		}
	});

	it('always gives meaningful XP for correct answers', () => {
		expect(speedFactor(10 * 60_000, 60)).toBe(SPEED_FLOOR);
		expect(scoreSubmission({ ...base, elapsedMs: 999_999 }).xp).toBe(200);
		expect(scoreSubmission({ ...base, elapsedMs: 0 }).xp).toBe(500);
	});

	it('never rewards wrong answers or guessing', () => {
		expect(scoreSubmission({ ...base, correct: false, elapsedMs: 1000 }).xp).toBe(0);
		expect(scoreSubmission({ ...base, kind: 'choice', tryNo: 2, elapsedMs: 1000 }).xp).toBe(0);
		expect(scoreSubmission({ ...base, tryNo: 2, elapsedMs: 0 }).xp).toBe(350);
	});

	it('expires hard timeouts', () => {
		const r = scoreSubmission({ ...base, hardTimeout: true, timeLimitSec: 10, elapsedMs: 12_000 });
		expect(r.expired).toBe(true);
		expect(r.xp).toBe(0);
	});

	it('is deterministic', () => {
		const a = scoreSubmission({ ...base, difficulty: 'boss', elapsedMs: 23_456 });
		const b = scoreSubmission({ ...base, difficulty: 'boss', elapsedMs: 23_456 });
		expect(a).toEqual(b);
	});

	it('counts bingo lines', () => {
		expect(bingoLines([0, 1, 2, 3], 4)).toBe(1);
		expect(bingoLines([0, 5, 10, 15], 4)).toBe(1);
		expect(bingoLines([0, 1, 2, 3, 4, 8, 12], 4)).toBe(2);
		expect(bingoLines([...Array(16).keys()], 4)).toBe(10);
	});
});

describe('answers', () => {
	it('normalises formatting', () => {
		expect(matchesAnswer('  Node.JS ', ['nodejs'])).toBe(true);
		expect(matchesAnswer('vs code', ['VSCode'])).toBe(true);
		expect(matchesAnswer('"Kubernetes."', ['kubernetes'])).toBe(true);
		expect(matchesAnswer('java', ['javascript'])).toBe(false);
		expect(matchesAnswer('', [''])).toBe(false);
	});
});

function run(actions: GameAction[], start = initialState(0)) {
	let s: EventState = start;
	let t = 0;
	for (const a of actions) {
		t += 1000;
		const r = transition(s, a, t);
		if (!r.ok) throw new Error(r.error);
		s = r.state;
	}
	return s;
}

describe('game state', () => {
	it('walks the full event', () => {
		const s = run([
			{ type: 'OPEN_LOBBY' },
			{ type: 'PREPARE_ROUND', protocol: 'scan' },
			{ type: 'START_ROUND', durationMs: 60_000 },
			{ type: 'END_ROUND' },
			{ type: 'PREPARE_ROUND', protocol: 'override' },
			{ type: 'START_ROUND', durationMs: 60_000 },
			{ type: 'PAUSE' },
			{ type: 'RESUME' },
			{ type: 'END_ROUND' },
			{ type: 'FINALIZE' },
			{ type: 'COMPLETE_EVENT' }
		]);
		expect(s.phase).toBe('EVENT_COMPLETE');
		expect(s.completed).toEqual(['scan', 'override']);
	});

	it('rejects illegal transitions', () => {
		expect(transition(initialState(), { type: 'FINALIZE' }, 1).ok).toBe(false);
		expect(availableActions(initialState())).toContain('OPEN_LOBBY');
	});

	it('freezes the round clock while paused', () => {
		let s = run([{ type: 'OPEN_LOBBY' }, { type: 'PREPARE_ROUND', protocol: 'decode' }, { type: 'START_ROUND', durationMs: 60_000 }]);
		const startedAt = s.round!.startedAt;
		s = (transition(s, { type: 'PAUSE' }, startedAt + 10_000) as { state: EventState }).state;
		expect(roundRemainingMs(s, startedAt + 40_000)).toBe(50_000);
		expect(submissionGate(s, startedAt + 40_000).open).toBe(false);
		s = (transition(s, { type: 'RESUME' }, startedAt + 40_000) as { state: EventState }).state;
		expect(roundRemainingMs(s, startedAt + 50_000)).toBe(40_000);
		expect(submissionGate(s, startedAt + 50_000).open).toBe(true);
		expect(submissionGate(s, startedAt + 95_000).open).toBe(false);
	});

	it('hides totals during the boss fight', () => {
		const ready = run([{ type: 'OPEN_LOBBY' }, { type: 'PREPARE_ROUND', protocol: 'override' }]);
		expect(boardMode(ready)).toBe('boss');
		const done = run([{ type: 'START_ROUND', durationMs: 1000 }, { type: 'END_ROUND' }, { type: 'LOCK_RESULTS' }], ready);
		expect(boardMode(done)).toBe('boss');
		expect(boardMode(run([{ type: 'FINALIZE' }], done))).toBe('final');
	});
});

describe('leaderboard', () => {
	const protocols = new Map<ProtocolId, Protocol>([
		['scan', { id: 'scan', flow: 'grid', lineBonus: 100 } as Protocol],
		['override', { id: 'override', flow: 'sequence', lineBonus: 0 } as Protocol]
	]);
	const ch = (id: string, protocol: ProtocolId, order: number) => ({ id, protocol, order }) as Challenge;
	const challenges = new Map([
		...[0, 1, 2, 3].map((o) => [`s${o}`, ch(`s${o}`, 'scan', o)] as const),
		['b1', ch('b1', 'override', 0)] as const
	]);
	const team = (id: string, name: string): Team => ({ id, name, players: ['a', 'b'], accessKey: '', inviteCode: null, disabled: false, joinedAt: 1, createdAt: 1, rounds: {} });
	const att = (teamId: string, challengeId: string, protocol: ProtocolId, xp: number, at: number): Attempt => ({
		teamId, challengeId, protocol, xp, startedAt: 0, pauseClockAtStart: 0, tries: 1, status: 'solved', closedAt: at
	});
	const teams = [team('A', 'ALPHA'), team('B', 'BRAVO')];
	const attempts = [
		...[0, 1, 2, 3].map((o) => att('A', `s${o}`, 'scan', 50, 10 + o)),
		att('A', 'b1', 'override', 100, 50),
		att('B', 'b1', 'override', 900, 60)
	];
	const scores = computeScores(teams, attempts, challenges, protocols);

	it('adds bingo bonuses and aggregates every round', () => {
		const a = scores.find((s) => s.teamId === 'A')!;
		expect(a.rounds.scan).toBe(300);
		expect(a.total).toBe(400);
	});

	it('ranks boss board by boss XP only, final by total', () => {
		const bossState = run([{ type: 'OPEN_LOBBY' }, { type: 'PREPARE_ROUND', protocol: 'override' }]);
		const board = buildBoard(bossState, scores);
		expect(board.rows.map((r) => [r.name, r.xp])).toEqual([['BRAVO', 900], ['ALPHA', 100]]);
		const final = buildFinal(scores);
		expect(final.map((r) => [r.name, r.total])).toEqual([['BRAVO', 900], ['ALPHA', 400]]);
	});
});
