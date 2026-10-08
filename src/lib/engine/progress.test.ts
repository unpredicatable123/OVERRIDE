import { describe, expect, it } from 'vitest';
import { initialState, SELF_PACED, submissionGate, transition, type EventState, type GameAction } from './gameState';
import { currentRound, nextProtocol } from './progress';
import type { Attempt, Challenge, Protocol, ProtocolId, TeamRounds } from './types';

const protocols = new Map<ProtocolId, Protocol>(
	(['scan', 'decode', 'trace', 'escape', 'overdrive', 'override'] as ProtocolId[]).map((id) => [id, { id, durationSec: 60, flow: 'sequence' } as Protocol])
);
const ch = (id: string, protocol: ProtocolId): Challenge => ({ id, protocol, order: 0, hardTimeout: false, timeLimitSec: null }) as Challenge;
const lists = new Map<ProtocolId, Challenge[]>(SELF_PACED.map((p) => [p, [ch(`${p}-1`, p), ch(`${p}-2`, p)]]));
const listOf = (p: ProtocolId) => lists.get(p) ?? null;
const closed = (challengeId: string, status: Attempt['status'] = 'solved'): Attempt =>
	({ challengeId, status, startedAt: 0, pauseClockAtStart: 0 }) as Attempt;
const clock = (now: number, pauseClock = 0) => ({ now, pauseClock });

describe('self-paced rounds', () => {
	it('opens the first protocol for a team that has not started', () => {
		const r = currentRound({}, protocols, listOf, new Map(), clock(0));
		expect(r).toMatchObject({ protocol: 'scan', status: 'ready', completed: [] });
	});

	it('runs the team’s own clock once the round starts', () => {
		const rounds: TeamRounds = { scan: { startedAt: 1000, pauseClockAtStart: 0 } };
		const r = currentRound(rounds, protocols, listOf, new Map(), clock(31_000));
		expect(r).toMatchObject({ protocol: 'scan', status: 'live', remainingMs: 30_000 });
	});

	it('opens the next round as soon as every node is closed', () => {
		const rounds: TeamRounds = { scan: { startedAt: 0, pauseClockAtStart: 0 } };
		const attempts = new Map([closed('scan-1'), closed('scan-2', 'failed')].map((a) => [a.challengeId, a]));
		const r = currentRound(rounds, protocols, listOf, attempts, clock(5000));
		expect(r).toMatchObject({ protocol: 'decode', status: 'ready', completed: ['scan'] });
	});

	it('opens the next round when the team’s clock runs out', () => {
		const rounds: TeamRounds = { scan: { startedAt: 0, pauseClockAtStart: 0 } };
		expect(currentRound(rounds, protocols, listOf, new Map(), clock(60_000)).protocol).toBe('decode');
	});

	it('does not count paused time against the team', () => {
		const rounds: TeamRounds = { scan: { startedAt: 0, pauseClockAtStart: 0 } };
		const r = currentRound(rounds, protocols, listOf, new Map(), clock(70_000, 20_000));
		expect(r).toMatchObject({ protocol: 'scan', status: 'live', remainingMs: 10_000 });
	});

	it('keeps a round live while its question set is still generating', () => {
		const rounds: TeamRounds = { scan: { startedAt: 0, pauseClockAtStart: 0 } };
		expect(currentRound(rounds, protocols, () => null, new Map(), clock(1000)).status).toBe('live');
	});

	it('waits for the boss fight after the last self-paced round', () => {
		const rounds = Object.fromEntries(SELF_PACED.map((p) => [p, { startedAt: 0, pauseClockAtStart: 0 }]));
		const r = currentRound(rounds, protocols, listOf, new Map(), clock(120_000));
		expect(r).toMatchObject({ protocol: null, status: 'waiting', completed: [...SELF_PACED] });
		expect(nextProtocol('overdrive')).toBe('override');
		expect(nextProtocol('scan')).toBe('decode');
	});
});

describe('self-paced state machine', () => {
	const run = (actions: GameAction[], from: EventState = initialState(0), t0 = 0) =>
		actions.reduce((s, a, i) => {
			const r = transition(s, a, t0 + i * 1000);
			if (!r.ok) throw new Error(r.error);
			return r.state;
		}, from);

	it('goes lobby → live → paused → live', () => {
		const s = run([{ type: 'OPEN_LOBBY' }, { type: 'START_LIVE' }, { type: 'PAUSE' }]);
		expect(s.phase).toBe('LIVE_PAUSED');
		expect(submissionGate(s, 3000).open).toBe(false);
		const r = run([{ type: 'RESUME' }], s, 3000);
		expect(r.phase).toBe('EVENT_LIVE');
		expect(r.pauseClockMs).toBe(1000);
		expect(submissionGate(r, 5000).open).toBe(true);
	});

	it('only lets the boss fight follow the self-paced run, closing every self-paced round', () => {
		const s = run([{ type: 'OPEN_LOBBY' }, { type: 'START_LIVE' }]);
		expect(transition(s, { type: 'PREPARE_ROUND', protocol: 'decode' }, 5000).ok).toBe(false);
		const boss = run([{ type: 'PREPARE_ROUND', protocol: 'override' }], s, 5000);
		expect(boss.phase).toBe('ROUND_READY');
		expect(boss.completed).toEqual([...SELF_PACED]);
	});

	it('honours LOCK_SUBMISSIONS during the run', () => {
		const s = run([{ type: 'OPEN_LOBBY' }, { type: 'START_LIVE' }, { type: 'LOCK_SUBMISSIONS' }]);
		expect(submissionGate(s, 5000)).toEqual({ open: false, reason: 'Submissions are locked' });
	});
});
