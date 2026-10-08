import { boardMode, isSelfPacedPhase, pauseClockAt, roundRemainingMs, SELF_PACED } from '#lib/engine/gameState.ts';
import { buildBoard, computeScores, type TeamScore } from '#lib/engine/leaderboard.ts';
import { currentRound } from '#lib/engine/progress.ts';
import type { Attempt } from '#lib/engine/types.ts';
import type { ArenaSnapshot, FeedItem, ProtocolMeta } from '#lib/engine/views.ts';
import { catalog } from './catalog';
import { teamList } from './generate';
import { store, type StoredState } from './store';

/**
 * Builds the public arena snapshot and pushes it to every screen.
 * Publishing is throttled (leading + trailing edge) so a burst of submissions results in
 * at most one database write + realtime broadcast per interval.
 */

const MIN_INTERVAL_MS = 700;
/**
 * Self-paced rounds also end on each team's own clock, which writes nothing. While the run is
 * live, republish on a slow heartbeat so the arena's per-protocol team counts stay current.
 */
const HEARTBEAT_MS = 5000;
const FEED_SIZE = 14;

let seq = 0;
let latest: { snapshot: ArenaSnapshot; scores: TeamScore[]; builtAt: number } | null = null;
let lastPublishAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let again = false;
let feedId = 0;
const feed: FeedItem[] = [];
const listeners = new Set<(s: ArenaSnapshot) => void>();

export function subscribe(fn: (s: ArenaSnapshot) => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function pushFeed(item: Omit<FeedItem, 'id'>) {
	feed.unshift({ ...item, id: ++feedId });
	if (feed.length > FEED_SIZE) feed.length = FEED_SIZE;
}

export function clearFeed() {
	feed.length = 0;
}

export function publicState(s: StoredState, now: number) {
	const remainingMs = roundRemainingMs(s, now);
	const running = s.phase === 'ROUND_ACTIVE' || s.phase === 'BOSS_ACTIVE';
	// The self-paced run has no arena clock: every team runs its own.
	return {
		version: s.version,
		phase: s.phase,
		protocol: s.protocol,
		completed: s.completed,
		endsAt: running && remainingMs !== null ? now + remainingMs : null,
		remainingMs,
		durationMs: s.round?.durationMs ?? null,
		submissionsLocked: s.submissionsLocked,
		finalizedAt: s.finalizedAt
	};
}

async function build(): Promise<{ snapshot: ArenaSnapshot; scores: TeamScore[] }> {
	const db = store();
	const [state, cat, teams, attempts, submissions] = await Promise.all([
		db.getState(),
		catalog(),
		db.listTeams(),
		db.listAttempts(),
		db.countSubmissions()
	]);
	const now = Date.now();
	const scores = computeScores(teams, attempts, cat.challengeMap, cat.protocolMap);
	const board = buildBoard(state, scores);
	const mode = boardMode(state);
	const active = teams.filter((t) => !t.disabled && t.joinedAt !== null);
	const activeIds = new Set(active.map((t) => t.id));
	const counted = board.rows.filter((r) => activeIds.has(r.teamId));

	// Self-paced run: how many teams are in each protocol (last slot = waiting for the boss).
	const stages: number[] = [];
	if (isSelfPacedPhase(state.phase)) {
		stages.push(...Array(SELF_PACED.length + 1).fill(0));
		const byTeam = new Map<string, Map<string, Attempt>>();
		for (const a of attempts) {
			let m = byTeam.get(a.teamId);
			if (!m) byTeam.set(a.teamId, (m = new Map()));
			m.set(a.challengeId, a);
		}
		const clock = { now, pauseClock: pauseClockAt(state, now) };
		for (const t of active) {
			const r = currentRound(t.rounds ?? {}, cat.protocolMap, (id) => teamList(cat, t.id, id), byTeam.get(t.id) ?? new Map(), clock);
			stages[r.protocol ? SELF_PACED.indexOf(r.protocol) : SELF_PACED.length]++;
		}
	}
	const protocols: ProtocolMeta[] = cat.protocols.map((p) => ({
		id: p.id,
		index: p.index,
		code: p.code,
		name: p.name,
		title: p.title,
		tagline: p.tagline,
		durationSec: p.durationSec
	}));
	const snapshot: ArenaSnapshot = {
		seq: ++seq,
		serverNow: now,
		state: publicState(state, now),
		protocols,
		stats: {
			teams: teams.filter((t) => !t.disabled).length,
			activeTeams: active.length,
			submissions,
			avgXp: counted.length ? Math.round(counted.reduce((s, r) => s + r.xp, 0) / counted.length) : 0,
			stages
		},
		board,
		// During the boss fight the feed only reports boss XP, same rule as the board.
		feed: mode === 'final' ? [] : feed.filter((f) => mode !== 'boss' || f.protocol === 'override'),
		final: mode === 'final' ? state.finalResults : null
	};
	return { snapshot, scores };
}

async function publish(): Promise<void> {
	if (inflight) {
		again = true;
		return inflight;
	}
	inflight = (async () => {
		try {
			lastPublishAt = Date.now();
			const built = await build();
			latest = { ...built, builtAt: Date.now() };
			if (heartbeat) clearTimeout(heartbeat);
			heartbeat = isSelfPacedPhase(built.snapshot.state.phase) ? setTimeout(() => requestPublish(), HEARTBEAT_MS) : null;
			heartbeat?.unref?.();
			for (const fn of listeners) {
				try {
					fn(built.snapshot);
				} catch {
					/* a broken SSE client must not stop the broadcast */
				}
			}
			await store().publishSnapshot(built.snapshot);
		} catch (e) {
			console.error('[snapshot] publish failed', e);
		} finally {
			inflight = null;
			if (again) {
				again = false;
				requestPublish();
			}
		}
	})();
	return inflight;
}

export function requestPublish(opts: { immediate?: boolean } = {}) {
	if (opts.immediate) {
		if (timer) clearTimeout(timer);
		timer = null;
		void publish();
		return;
	}
	if (timer) return;
	const wait = Math.max(0, lastPublishAt + MIN_INTERVAL_MS - Date.now());
	timer = setTimeout(() => {
		timer = null;
		void publish();
	}, wait);
}

/** Latest snapshot with a fresh serverNow (for initial page loads and SSE handshakes). */
export async function currentSnapshot(maxAgeMs = 3000): Promise<ArenaSnapshot> {
	if (!latest || Date.now() - latest.builtAt > maxAgeMs) {
		const built = await build();
		latest = { ...built, builtAt: Date.now() };
	}
	const now = Date.now();
	const s = latest.snapshot;
	const state = s.state.endsAt !== null ? { ...s.state, remainingMs: Math.max(0, s.state.endsAt - now) } : s.state;
	return { ...s, serverNow: now, state };
}

/** Cached ranks from the most recent build; avoids a full-table scan per player request. */
export async function cachedRanks(): Promise<{ rows: ArenaSnapshot['board']['rows']; mode: ArenaSnapshot['board']['mode'] }> {
	const s = await currentSnapshot(5000);
	return s.board;
}

export async function freshScores(): Promise<TeamScore[]> {
	const built = await build();
	latest = { ...built, builtAt: Date.now() };
	return built.scores;
}
