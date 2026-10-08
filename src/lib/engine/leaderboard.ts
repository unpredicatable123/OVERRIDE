import { boardMode, type BoardMode, type EventState } from './gameState';
import { BINGO_SIZE, bingoLines } from './scoring';
import { PROTOCOL_IDS, type Attempt, type Challenge, type Protocol, type ProtocolId, type Team } from './types';

export type RoundScores = Record<ProtocolId, number>;

export interface TeamScore {
	teamId: string;
	name: string;
	players: [string, string];
	rounds: RoundScores;
	/** Bingo lines completed in SCAN (bonus is already inside rounds.scan). */
	bingoLines: number;
	total: number;
	solved: number;
	/** Last time XP was earned, per protocol and overall. Used as a deterministic tie-break. */
	lastAt: Record<ProtocolId, number>;
	lastAtTotal: number;
}

export const emptyRounds = (): RoundScores =>
	Object.fromEntries(PROTOCOL_IDS.map((p) => [p, 0])) as RoundScores;

/**
 * Aggregates authoritative attempt rows into per-round XP.
 * FINAL XP = scan + decode + trace + escape + overdrive + override.
 */
export function computeScores(
	teams: Team[],
	attempts: Attempt[],
	challenges: Map<string, Challenge>,
	protocols: Map<ProtocolId, Protocol>
): TeamScore[] {
	const byTeam = new Map<string, TeamScore>();
	const bingoCells = new Map<string, number[]>();
	for (const t of teams) {
		if (t.disabled) continue;
		byTeam.set(t.id, {
			teamId: t.id,
			name: t.name,
			players: t.players,
			rounds: emptyRounds(),
			bingoLines: 0,
			total: 0,
			solved: 0,
			lastAt: emptyRounds(),
			lastAtTotal: 0
		});
	}
	for (const a of attempts) {
		const s = byTeam.get(a.teamId);
		if (!s || a.status !== 'solved') continue;
		s.rounds[a.protocol] += a.xp;
		s.solved++;
		const at = a.closedAt ?? a.startedAt;
		if (at > s.lastAt[a.protocol]) s.lastAt[a.protocol] = at;
		if (at > s.lastAtTotal) s.lastAtTotal = at;
		const ch = challenges.get(a.challengeId);
		if (ch && protocols.get(ch.protocol)?.flow === 'grid') {
			let cells = bingoCells.get(a.teamId);
			if (!cells) bingoCells.set(a.teamId, (cells = []));
			cells.push(ch.order);
		}
	}
	for (const [teamId, cells] of bingoCells) {
		const s = byTeam.get(teamId)!;
		const lines = bingoLines(cells, BINGO_SIZE);
		s.bingoLines = lines;
		s.rounds.scan += lines * (protocols.get('scan')?.lineBonus ?? 0);
	}
	for (const s of byTeam.values()) {
		s.total = PROTOCOL_IDS.reduce((sum, p) => sum + s.rounds[p], 0);
	}
	return [...byTeam.values()];
}

export interface BoardRow {
	rank: number;
	teamId: string;
	name: string;
	xp: number;
}

type Metric = 'total' | ProtocolId;

const metricOf = (s: TeamScore, m: Metric) => (m === 'total' ? s.total : s.rounds[m]);
const lastOf = (s: TeamScore, m: Metric) => (m === 'total' ? s.lastAtTotal : s.lastAt[m]);

/** XP desc → whoever reached it first → name. Unique, deterministic ranks. */
export function rankBy(scores: TeamScore[], metric: Metric): BoardRow[] {
	return [...scores]
		.sort((a, b) => {
			const d = metricOf(b, metric) - metricOf(a, metric);
			if (d !== 0) return d;
			const la = lastOf(a, metric) || Number.MAX_SAFE_INTEGER;
			const lb = lastOf(b, metric) || Number.MAX_SAFE_INTEGER;
			if (la !== lb) return la - lb;
			return a.name.localeCompare(b.name);
		})
		.map((s, i) => ({ rank: i + 1, teamId: s.teamId, name: s.name, xp: metricOf(s, metric) }));
}

export interface Board {
	mode: BoardMode;
	rows: BoardRow[];
}

/** Applies the visibility rule: boss phases expose ONLY boss XP; totals only after finalization. */
export function buildBoard(state: EventState, scores: TeamScore[]): Board {
	const mode = boardMode(state);
	return { mode, rows: rankBy(scores, mode === 'boss' ? 'override' : 'total') };
}

export interface FinalResult {
	rank: number;
	teamId: string;
	name: string;
	players: [string, string];
	rounds: RoundScores;
	total: number;
}

export function buildFinal(scores: TeamScore[]): FinalResult[] {
	const byId = new Map(scores.map((s) => [s.teamId, s]));
	return rankBy(scores, 'total').map((r) => {
		const s = byId.get(r.teamId)!;
		return { rank: r.rank, teamId: s.teamId, name: s.name, players: s.players, rounds: s.rounds, total: s.total };
	});
}
