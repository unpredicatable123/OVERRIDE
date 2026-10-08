/**
 * OVERRIDE event simulator — load test + integrity check against a running server.
 *
 *   npm run simulate -- --base http://localhost:5173 --teams 42 --full
 *
 * Flags:
 *   --base URL        server to hit (default http://localhost:5173)
 *   --key KEY         admin key (default $ADMIN_KEY or override-admin)
 *   --teams N         bot teams to run (default 42; demo teams are seeded if needed)
 *   --protocols a,b   protocols to play (default: scan)
 *   --full            play all six protocols, then FINALIZE and verify the aggregation
 *   --self-paced      START_LIVE: every team plays SCAN → OVERDRIVE on its own clock, then the boss
 *   --pace X          think-time multiplier (default 0.15 → fast; 1 ≈ human speed)
 *   --reset           RESET the event first (wipes progress, keeps teams)
 */
type Json = Record<string, any>;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const BASE = opt('base', 'http://localhost:5173').replace(/\/$/, '');
const KEY = opt('key', process.env.ADMIN_KEY || 'override-admin');
const TEAMS = Number(opt('teams', '42'));
const PACE = Number(opt('pace', '0.15'));
const ALL = ['scan', 'decode', 'trace', 'escape', 'overdrive', 'override'];
const SELF_PACED = flag('self-paced');
const PROTOCOLS = SELF_PACED ? ['override'] : flag('full') ? ALL : opt('protocols', 'scan').split(',');

// Every team plays its own generated set, so answers come from the admin API (and are refetched
// whenever a bot meets a challenge it hasn't seen yet).
const answers = new Map<string, Json>();
let answersLoad: Promise<void> | null = null;
async function definition(id: string): Promise<Json | undefined> {
	if (!answers.has(id)) {
		answersLoad ??= admin
			.req('/api/admin/challenges?generated=1')
			.then((r) => {
				for (const c of r.body.challenges as Json[]) answers.set(c.id, c);
			})
			.finally(() => (answersLoad = null));
		await answersLoad;
	}
	return answers.get(id);
}
const latencies = new Map<string, number[]>();
let errors = 0;
const errorSamples = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

class Client {
	private jar = new Map<string, string>();
	constructor(public label: string) {}

	private cookie() {
		return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
	}

	async req(path: string, init: { method?: string; json?: unknown; form?: Record<string, string> } = {}): Promise<{ status: number; body: Json }> {
		const headers: Record<string, string> = { origin: BASE, cookie: this.cookie() };
		let body: string | undefined;
		if (init.json !== undefined) {
			headers['content-type'] = 'application/json';
			body = JSON.stringify(init.json);
		} else if (init.form) {
			headers['content-type'] = 'application/x-www-form-urlencoded';
			body = new URLSearchParams(init.form).toString();
		}
		const t0 = performance.now();
		const res = await fetch(BASE + path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, redirect: 'manual' });
		const dt = performance.now() - t0;
		const key = path.split('?')[0];
		(latencies.get(key) ?? latencies.set(key, []).get(key)!).push(dt);
		for (const c of res.headers.getSetCookie()) {
			const [pair] = c.split(';');
			const i = pair.indexOf('=');
			this.jar.set(pair.slice(0, i), pair.slice(i + 1));
		}
		const text = await res.text();
		let parsed: Json = {};
		try {
			parsed = JSON.parse(text);
		} catch {
			/* html / redirect */
		}
		if (res.status >= 500) {
			errors++;
			const k = `${res.status} ${key}`;
			errorSamples.set(k, (errorSamples.get(k) ?? 0) + 1);
		}
		return { status: res.status, body: parsed };
	}
}

const admin = new Client('admin');
async function act(type: string, extra: Json = {}) {
	const r = await admin.req('/api/admin/action', { json: { type, ...extra } });
	if (r.status !== 200) throw new Error(`${type}: ${r.body.message}`);
	return r.body;
}
async function snapshot(): Promise<Json> {
	return (await admin.req('/api/snapshot')).body;
}
function assert(cond: unknown, msg: string) {
	if (!cond) {
		console.error(`\n✕ INTEGRITY FAILURE: ${msg}`);
		process.exit(1);
	}
	console.log(`  ✓ ${msg}`);
}

/** Opens (if needed) and answers one challenge. Returns false when there was nothing to play. */
async function playOne(c: Client, v: Json, skill: number): Promise<boolean> {
	const protocol = v.protocol?.id;
	const open = (v.challenges as Json[]).filter((x) => x.status === 'ready' || x.status === 'open');
	if (!open.length) return false;
	// Bots wander a bit on free/grid protocols so teammates collide realistically.
	const ch = protocol === 'scan' || protocol === 'trace' ? open[Math.floor(Math.random() * Math.min(3, open.length))] : open[0];
	if (ch.status === 'ready') {
		const o = await c.req('/api/team/open', { json: { challengeId: ch.id } });
		if (o.status !== 200) {
			await sleep(200);
			return true;
		}
	}
	const def = await definition(ch.id);
	if (!def) throw new Error(`Unknown challenge ${ch.id}`);
	const limit = (def.timeLimitSec ?? 20) * 1000;
	await sleep(rand(0.1, 0.9) * limit * PACE * (1.6 - skill));
	const correct = Math.random() < skill;
	const answer = correct ? def.answers[0] : def.kind === 'choice' ? def.options.find((o: string) => !def.answers.includes(o))! : 'definitely-wrong';
	await c.req('/api/team/submit', { json: { challengeId: ch.id, answer } });
	await sleep(400); // submit cooldown
	return true;
}

/** One bot = one player. Two bots share a team to exercise concurrent teammates. */
async function bot(c: Client, skill: number, deadline: number) {
	while (Date.now() < deadline) {
		const { status, body: v } = await c.req('/api/team/state');
		if (status !== 200) return;
		if (!['ROUND_ACTIVE', 'BOSS_ACTIVE'].includes((await snapshot()).state.phase)) return;
		if (v.generating) {
			await sleep(500);
			continue;
		}
		if (!(await playOne(c, v, skill))) return;
	}
}

/** Self-paced bot: initializes each protocol as it opens and plays until the team reaches the boss gate. */
async function selfPacedBot(c: Client, skill: number, deadline: number) {
	while (Date.now() < deadline) {
		const { status, body: v } = await c.req('/api/team/state');
		if (status !== 200 || !v.selfPaced || v.selfPaced.status === 'waiting') return;
		if (v.generating) {
			await sleep(500);
		} else if (v.selfPaced.status === 'ready') {
			await c.req('/api/team/round', { json: { protocol: v.protocol.id } });
			await sleep(rand(100, 600));
		} else if (!(await playOne(c, v, skill))) {
			await sleep(300); // round finished; the next state fetch shows the next protocol
		}
	}
}

function pct(xs: number[], p: number) {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}

async function main() {
	console.log(`\n▶ OVERRIDE SIMULATION → ${BASE}  teams=${TEAMS}  protocols=${PROTOCOLS.join(' → ')}  pace=${PACE}\n`);
	const login = await admin.req('/admin?/login', { form: { key: KEY } });
	if (![200, 303].includes(login.status)) throw new Error(`Admin login failed (${login.status})`);

	if (flag('reset')) await act('RESET').catch(() => {});
	let ov = (await admin.req('/api/admin/overview')).body;
	if (ov.teams.filter((t: Json) => !t.disabled).length < TEAMS) {
		await admin.req('/api/admin/teams', { json: { op: 'seed' } });
		ov = (await admin.req('/api/admin/overview')).body;
	}
	const teams = (ov.teams as Json[]).filter((t) => !t.disabled).slice(0, TEAMS);

	// Two players per team, each with their own session.
	const players: { c: Client; team: Json; skill: number }[] = [];
	for (const t of teams) {
		const skill = rand(0.55, 0.97);
		for (const p of t.players) {
			const c = new Client(`${t.id}/${p}`);
			const r = await c.req('/login?/login', { form: { teamId: t.id, accessKey: t.accessKey } });
			if (![200, 303].includes(r.status)) throw new Error(`Login failed for ${t.id}`);
			players.push({ c, team: t, skill });
		}
	}
	console.log(`  ${players.length} players logged in across ${teams.length} teams`);

	if ((await snapshot()).state.phase === 'EVENT_IDLE') await act('OPEN_LOBBY');

	if (SELF_PACED) {
		await act('START_LIVE');
		const t0 = Date.now();
		await Promise.all(players.map((p) => selfPacedBot(p.c, p.skill, t0 + 1000 * 60 * 15)));
		await sleep(6000); // rounds that end on a team's own clock reach the arena on the next heartbeat
		const snap = await snapshot();
		console.log(`\n■ SELF-PACED RUN done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${snap.stats.submissions} submissions total`);
		console.log(`   teams per stage: ${JSON.stringify(snap.stats.stages)}`);
		assert(snap.stats.stages.at(-1) === snap.stats.activeTeams, 'every active team reached the boss gate');
		const ovr = (await admin.req('/api/admin/overview')).body;
		const teamSets = new Map<string, Set<string>>();
		for (const c of (await admin.req('/api/admin/challenges?generated=1')).body.challenges as Json[]) {
			if (!c.teamId || c.protocol !== 'scan') continue;
			(teamSets.get(c.teamId) ?? teamSets.set(c.teamId, new Set()).get(c.teamId)!).add(c.prompt);
		}
		assert(teamSets.size >= teams.length, `every team got its own SCAN set (${teamSets.size} sets, ${ovr.generation.fallbacks} local fallbacks)`);
		for (const r of snap.board.rows.slice(0, 5)) console.log(`   #${String(r.rank).padStart(2, '0')}  ${r.name.padEnd(18)} ${r.xp} XP`);
	}

	for (const protocol of PROTOCOLS) {
		await act('PREPARE_ROUND', { protocol });
		await act('START_ROUND');
		const t0 = Date.now();
		const cap = t0 + 1000 * 60 * 3; // never let a simulated round run longer than 3 minutes
		await Promise.all(players.map((p) => bot(p.c, p.skill, cap)));
		const snap = await snapshot();
		console.log(`\n■ ${protocol.toUpperCase()} done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${snap.stats.submissions} submissions total`);
		if (protocol === 'override') {
			assert(snap.board.mode === 'boss', 'board is in BOSS mode during the boss fight');
			const ovr = (await admin.req('/api/admin/overview')).body;
			const bossOnly = (ovr.teams as Json[]).every((t) => Object.keys(t.rounds).every((k) => k === 'override'));
			assert(bossOnly, 'admin team rows expose only boss XP during the boss fight');
			assert(snap.final === null, 'no final results leak before FINALIZE');
		}
		await act('END_ROUND');
		for (const r of snap.board.rows.slice(0, 5)) console.log(`   #${String(r.rank).padStart(2, '0')}  ${r.name.padEnd(18)} ${r.xp} ${snap.board.mode === 'boss' ? 'BOSS XP' : 'XP'}`);
	}

	if (flag('full') || SELF_PACED) {
		await act('FINALIZE');
		await sleep(300);
		const snap = await snapshot();
		console.log('\n■ FINALIZE');
		assert(snap.board.mode === 'final' && Array.isArray(snap.final), 'final results published after FINALIZE');
		const sumsOk = (snap.final as Json[]).every((r) => r.total === Object.values(r.rounds as Record<string, number>).reduce((a, b) => a + b, 0));
		assert(sumsOk, 'FINAL XP = sum of all six protocol XP for every team');
		const sorted = (snap.final as Json[]).every((r, i, a) => i === 0 || a[i - 1].total >= r.total);
		assert(sorted, 'final ranking is ordered by FINAL XP descending');
		for (const r of (snap.final as Json[]).slice(0, 3)) console.log(`   #${r.rank}  ${r.name.padEnd(18)} ${r.total} XP`);
	}

	console.log('\n■ LATENCY (ms)            n      p50     p95     p99');
	for (const [k, xs] of [...latencies].sort()) {
		console.log(`  ${k.padEnd(22)} ${String(xs.length).padStart(6)} ${pct(xs, 50).toFixed(0).padStart(8)} ${pct(xs, 95).toFixed(0).padStart(7)} ${pct(xs, 99).toFixed(0).padStart(7)}`);
	}
	console.log(`\n  server errors (5xx): ${errors}`);
	for (const [k, n] of errorSamples) console.log(`   ${k} ×${n}`);
	process.exit(errors ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
