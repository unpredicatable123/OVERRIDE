<script lang="ts">
	import Btn from '#lib/components/Btn.svelte';
	import Curtain from '#lib/components/Curtain.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import ProtocolTrack from '#lib/components/ProtocolTrack.svelte';
	import Typewriter from '#lib/components/Typewriter.svelte';
	import Hud from '#lib/components/play/Hud.svelte';
	import OverdriveRun from '#lib/components/play/OverdriveRun.svelte';
	import ScanGrid from '#lib/components/play/ScanGrid.svelte';
	import SequenceView from '#lib/components/play/SequenceView.svelte';
	import TraceCase from '#lib/components/play/TraceCase.svelte';
	import VerdictFlash from '#lib/components/play/VerdictFlash.svelte';
	import { arena } from '#lib/client/arena.svelte.ts';
	import { clock, fmt, formatClock } from '#lib/client/clock.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';
	import { TeamGame } from '#lib/client/team.svelte.ts';
	import { DIFFICULTY_COLORS, setAccent, type Accent } from '#lib/client/colors.ts';
	import { scene } from '#lib/client/scene.svelte.ts';
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import InviteCard from '#lib/components/InviteCard.svelte';
	import type { Difficulty } from '#lib/engine/types.ts';
	import { DIFFICULTY_MULTIPLIER } from '#lib/engine/scoring.ts';
	import { REVEAL_HOLD_MS } from '#lib/engine/views.ts';

	const game = new TeamGame();

	$effect(() => arena.connect());
	$effect(() => clock.use());
	$effect(() => {
		void game.refresh();
		// Safety net in case a realtime hint is missed (phones sleeping, flaky Wi-Fi).
		const poll = setInterval(() => document.visibilityState === 'visible' && game.refresh(), 20_000);
		return () => {
			clearInterval(poll);
			game.dispose();
		};
	});

	const snap = $derived(arena.snapshot);
	const view = $derived(game.view);
	const phase = $derived(snap?.state.phase ?? 'EVENT_IDLE');
	// Self-paced run: this team's own round and clock. null while the admin drives the rounds.
	const sp = $derived(view?.selfPaced ?? null);
	const remaining = $derived(sp ? (sp.endsAt !== null ? Math.max(0, sp.endsAt - clock.now) : sp.remainingMs) : arena.remainingMs);
	const durationMs = $derived(sp ? sp.durationMs : (snap?.state.durationMs ?? null));
	const paused = $derived(phase === 'ROUND_PAUSED' || phase === 'LIVE_PAUSED');
	const live = $derived(phase === 'ROUND_ACTIVE' || phase === 'BOSS_ACTIVE' || (phase === 'EVENT_LIVE' && sp?.status === 'live'));
	const clockShown = $derived(sp ? sp.status === 'live' : live || paused);
	const currentId = $derived(sp ? (view?.protocol?.id ?? null) : (snap?.state.protocol ?? null));
	const timedOut = $derived(live && remaining !== null && remaining <= 0);
	const boss = $derived(snap?.board.mode === 'boss');
	const myRow = $derived(snap?.board.rows.find((r) => r.teamId === view?.team.id));
	const hudView = $derived(view ? { ...view, rank: myRow?.rank ?? view.rank, teamsRanked: snap?.board.rows.length ?? view.teamsRanked } : null);

	// Phase changes on the server → refetch the team projection.
	$effect(() => {
		const v = snap?.state.version;
		if (v !== undefined && view && v !== view.stateVersion) void game.refresh();
	});
	// Teammate activity shows up as an XP change on the board → resync.
	let lastRowXp: number | null = null;
	$effect(() => {
		const xp = myRow?.xp ?? null;
		if (xp === lastRowXp) return;
		const changed = lastRowXp !== null;
		lastRowXp = xp;
		if (changed && view && xp !== view.xp) game.scheduleRefresh(500);
	});

	const accent = $derived.by((): Accent => {
		const m = snap?.board.mode;
		if (m === 'final') return 'final';
		if (m === 'boss') return 'override';
		const ph = snap?.state.phase;
		return currentId && ph !== 'EVENT_IDLE' && ph !== 'EVENT_LOBBY' ? currentId : 'lobby';
	});
	// Each protocol re-tints the whole interface; the boss fight goes red, the finale gold.
	$effect(() => {
		setAccent(accent);
		if (live) scene.set(accent === 'override' ? 'storm' : 'live', accent === 'override' ? 0.55 : 0.35);
		else scene.set(accent === 'final' ? 'celebrate' : 'calm', 0.8);
		sound.setMood(accent === 'override' ? 'boss' : 'calm');
		return () => setAccent(null);
	});

	// Cinematic phase transitions.
	let curtain = $state<{ title: string; sub?: string; tone?: 'phos' | 'bad' } | null>(null);
	let prevPhase: string | null = null;
	$effect(() => {
		const ph = phase;
		const p = snap?.protocols.find((x) => x.id === snap?.state.protocol);
		if (prevPhase === null) {
			prevPhase = ph;
			return;
		}
		if (ph === prevPhase) return;
		const from = prevPhase;
		prevPhase = ph;
		if (ph === 'EVENT_LIVE' && from === 'EVENT_LOBBY') {
			curtain = { title: 'SYSTEM ONLINE', sub: 'CLEAR A PROTOCOL TO UNLOCK THE NEXT' };
			sound.play('unlock');
		} else if (ph === 'LIVE_PAUSED') sound.play('glitch');
		else if (ph === 'BOSS_ACTIVE' && from !== 'ROUND_PAUSED') {
			curtain = { title: 'SYSTEM FAILURE', sub: 'OVERRIDE PROTOCOL ENGAGED', tone: 'bad' };
			sound.play('boss');
		} else if (ph === 'ROUND_ACTIVE' && from !== 'ROUND_PAUSED' && p) {
			curtain = { title: `${p.code} // ${p.name}`, sub: 'PROTOCOL INITIALIZED' };
			sound.play('unlock');
		} else if (ph === 'ROUND_PAUSED') sound.play('glitch');
		else if (ph === 'ROUND_COMPLETED' || ph === 'BOSS_COMPLETED') sound.play('alarm');
		else if (ph === 'RESULTS_FINALIZED') sound.play('reveal');
	});

	// Self-paced: the team's own round starting / finishing.
	let prevRound: string | null = null;
	let prevDone = 0;
	$effect(() => {
		if (!sp || !view) {
			prevRound = null;
			return;
		}
		const key = `${view.protocol?.id ?? 'gate'}:${sp.status}`;
		const done = sp.completed.length;
		if (prevRound !== null && key !== prevRound) {
			if (sp.status === 'live' && view.protocol) {
				curtain = { title: `${view.protocol.code} // ${view.protocol.name}`, sub: 'PROTOCOL INITIALIZED' };
				sound.play('unlock');
			} else if (done > prevDone) sound.play('alarm');
		}
		prevRound = key;
		prevDone = done;
	});
	// When the team's own clock runs out, the server has already moved them on: resync once.
	let expiredAt: number | null = null;
	$effect(() => {
		if (sp?.status !== 'live' || sp.endsAt === null || remaining === null || remaining > 0 || expiredAt === sp.endsAt) return;
		expiredAt = sp.endsAt;
		setTimeout(() => game.refresh(), 400);
	});

	// Final-seconds countdown ticks.
	let lastTick = -1;
	$effect(() => {
		if (!live || remaining === null) return;
		const s = Math.ceil(remaining / 1000);
		if (s === lastTick) return;
		lastTick = s;
		if (s > 0 && s <= 10) sound.play(s <= 3 ? 'tickHot' : 'tick');
	});

	const finalHeld = $derived(
		phase === 'RESULTS_FINALIZED' && snap?.state.finalizedAt != null && clock.now < snap.state.finalizedAt + REVEAL_HOLD_MS
	);
	const myFinal = $derived(snap?.final?.find((r) => r.teamId === view?.team.id) ?? null);
	const roundRatio = $derived(remaining !== null && durationMs ? remaining / durationMs : 1);
	const nameOf = (id: string) => snap?.protocols.find((p) => p.id === id);
	const maxAvailable = $derived(view?.challenges.reduce((s, c) => s + c.maxXp, 0) ?? 0);
</script>

<svelte:head><title>{view?.protocol ? `${view.protocol.name} // OVERRIDE` : 'OVERRIDE'}</title></svelte:head>

{#if curtain}
	<Curtain {...curtain} ondone={() => (curtain = null)} />
{/if}

{#if game.error}
	<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
		<Frame label="CONNECTION REFUSED" tone="bad">
			<p class="mb-5 text-bad">{game.error}</p>
			<form method="POST" action="/logout"><Btn type="submit" variant="ghost">RE-AUTHENTICATE</Btn></form>
		</Frame>
	</main>
{:else if !view || !hudView}
	<main class="flex min-h-dvh items-center justify-center">
		<p class="display text-3xl text-phos-dim anim-pulse">ESTABLISHING LINK…</p>
	</main>
{:else}
	<Hud view={hudView} remainingMs={clockShown ? remaining : null} durationMs={clockShown ? durationMs : null} {paused} online={arena.online} />
	<VerdictFlash verdict={game.verdict} />

	{#if game.notice}
		<div class="anim-rise fixed inset-x-0 bottom-16 z-[85] mx-auto w-fit max-w-[90vw] border border-bad/50 bg-panel px-4 py-2 text-sm text-bad" role="alert">
			{game.notice}
		</div>
	{/if}

	<main class="mx-auto max-w-7xl px-3 pt-4 pb-24 sm:px-6 sm:pt-6">
		{#if snap}
			<ProtocolTrack protocols={snap.protocols} current={currentId} completed={sp ? sp.completed : snap.state.completed} class="mb-5" />
		{/if}

		{#if phase === 'EVENT_IDLE' || phase === 'EVENT_LOBBY'}
			<!-- LOBBY -->
			<div class="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
				<Frame label="OPERATORS CONNECTED" tone="hot">
					<div class="flex items-center gap-5">
						<TeamAvatar id={view.team.id} name={view.team.name} size={64} />
						<div class="min-w-0">
							<div class="label">TEAM ID · {view.team.id}</div>
							<div class="iris truncate text-3xl font-black tracking-[0.12em] sm:text-4xl">{view.team.name}</div>
						</div>
					</div>
					<div class="mt-6 grid grid-cols-2 gap-3">
						{#each view.team.players as name, i (i)}
							<div class="seat p-3" class:empty={!name} style:--c={i === 0 ? 'var(--cyan)' : 'var(--magenta)'}>
								<div class="label">PLAYER 0{i + 1}</div>
								<div class="mt-0.5 truncate text-lg font-bold {name ? 'text-ink' : 'text-faint anim-pulse'}">{name || 'AWAITING…'}</div>
							</div>
						{/each}
					</div>
					{#if view.invite}
						<div class="rule my-6"></div>
						<p class="mb-4 text-center font-black tracking-[0.2em] text-ink">RECRUIT PLAYER 02</p>
						<InviteCard code={view.invite} teamName={view.team.name} compact />
					{/if}
					<p class="mt-6 text-sm text-mute">
						STATUS › <span class="text-phos"><Typewriter text="AWAITING FIRST PROTOCOL. STAND BY." speed={35} caret /></span>
					</p>
				</Frame>
				<Frame label="RULES OF ENGAGEMENT" accent="var(--yellow)">
					<p class="mb-4 text-sm leading-relaxed text-ink/90">
						Every team competes against <span class="font-bold text-ink">everyone</span> in the arena.
					</p>
					<p class="mb-5 text-center text-lg font-black tracking-[0.12em]">
						<span class="text-ink">SPEED</span> + <span class="text-ink">ACCURACY</span> + <span class="text-ink">DIFFICULTY</span> = <span class="text-ink">XP</span>
					</p>
					<ul class="space-y-2 text-sm text-ink/85">
						<li><span class="text-mute">—</span> Faster correct answers earn more XP — never below 40%.</li>
						<li><span class="text-bad">✕</span> Wrong answers earn nothing. Multiple choice is one shot.</li>
						<li><span class="text-ink">↻</span> Typed answers allow retries, but every miss lowers the reward.</li>
						<li><span class="text-ink">⇄</span> Both teammates share progress live.</li>
						<li><span class="text-ink">→</span> Clear a protocol — or run out its clock — and the next one opens. Every team gets its own questions.</li>
					</ul>
					<div class="mt-5 grid grid-cols-4 gap-1.5 text-center">
						{#each Object.entries(DIFFICULTY_MULTIPLIER) as [d, m] (d)}
							<div class="chip flex-col py-2!" style:--c={DIFFICULTY_COLORS[d as Difficulty]}>
								<span>{d}</span>
								<span class="display text-2xl tracking-normal">×{m}</span>
							</div>
						{/each}
					</div>
					<p class="label mt-5"><span class="text-ink">●</span> {snap?.stats.activeTeams ?? 0} {snap?.stats.activeTeams === 1 ? 'TEAM' : 'TEAMS'} IN THE ARENA</p>
				</Frame>
			</div>
			<form method="POST" action="/logout" class="mt-6"><Btn type="submit" variant="ghost" size="sm">DISCONNECT</Btn></form>
		{:else if view.generating && view.protocol}
			<!-- QUESTION SET BEING GENERATED -->
			<div class="mx-auto max-w-2xl py-16 text-center">
				<p class="label mb-3">{view.protocol.code} // {view.protocol.name}</p>
				<h1 class="display text-5xl text-phos glow anim-pulse sm:text-7xl">COMPILING YOUR PROTOCOL…</h1>
				<p class="mt-5 text-sm text-mute">Every team gets its own questions. Yours are being generated right now — no clock is running.</p>
			</div>
		{:else if sp?.status === 'waiting'}
			<!-- SELF-PACED RUN CLEARED -->
			<div class="mx-auto max-w-2xl py-10 text-center">
				<p class="label mb-3">ALL PROTOCOLS TERMINATED</p>
				<h1 class="display text-6xl text-phos glow sm:text-8xl">RUN COMPLETE</h1>
				<Frame label="YOUR RUN" class="mt-8 text-left">
					<table class="w-full text-sm">
						<tbody>
							{#each sp.completed as id (id)}
								<tr class="border-b border-line/60">
									<td class="py-2 text-mute">{nameOf(id)?.title ?? id}</td>
									<td class="py-2 text-right tabular-nums">{fmt(view.rounds[id] ?? 0)}</td>
								</tr>
							{/each}
							<tr>
								<td class="pt-3 font-bold tracking-[0.2em] text-phos">XP</td>
								<td class="display pt-3 text-right text-4xl text-phos">{fmt(view.xp)}</td>
							</tr>
						</tbody>
					</table>
				</Frame>
				<p class="label mt-10 anim-pulse">THE CORE IS WAKING UP — AWAITING THE OVERRIDE BOSS FIGHT</p>
			</div>
		{:else if (phase === 'ROUND_READY' || sp?.status === 'ready') && view.protocol}
			<!-- BRIEFING -->
			{@const prev = sp?.completed.at(-1)}
			{#if prev}
				<div class="anim-rise mx-auto mb-2 flex max-w-3xl flex-wrap items-center justify-between gap-3 border border-line bg-panel/60 px-4 py-3">
					<span class="label">{nameOf(prev)?.code} · {nameOf(prev)?.name} COMPLETE</span>
					<span class="display text-3xl text-phos">+{fmt(view.rounds[prev] ?? 0)} XP</span>
				</div>
			{/if}
			<div class="mx-auto max-w-3xl py-6 sm:py-12">
				<p class="label mb-3 text-phos!">INCOMING PROTOCOL</p>
				<h1 class="display grad text-8xl sm:text-[10rem]">{view.protocol.code}</h1>
				<h2 class="mt-2 text-2xl font-bold tracking-[0.25em] text-ink sm:text-4xl">{view.protocol.name}</h2>
				<p class="mt-1 text-sm tracking-[0.2em] text-mute uppercase">{view.protocol.title} — {view.protocol.tagline}</p>
				<div class="rule my-7"></div>
				<p class="min-h-24 text-base leading-relaxed text-ink/90 sm:text-lg"><Typewriter text={view.protocol.story} speed={18} audible /></p>
				<div class="mt-8 grid grid-cols-3 border border-line text-center">
					<div class="border-r border-line py-3"><div class="label">DURATION</div><div class="display text-3xl text-ink">{formatClock(view.protocol.durationSec * 1000)}</div></div>
					<div class="border-r border-line py-3"><div class="label">NODES</div><div class="display text-3xl text-ink">{view.challenges.length}</div></div>
					<div class="py-3"><div class="label">MAX XP</div><div class="display grad text-3xl">{fmt(maxAvailable)}</div></div>
				</div>
				{#if sp}
					<div class="mt-8 flex flex-col items-center gap-3">
						<Btn size="lg" onclick={() => game.startRound(view.protocol!.id)} busy={game.starting} disabled={paused}>
							▶ INITIALIZE {view.protocol.name}
						</Btn>
						<p class="label {paused ? 'text-bad!' : ''}">{paused ? 'ARENA PAUSED BY THE ADMIN' : 'YOUR CLOCK STARTS WHEN EITHER OF YOU INITIALIZES'}</p>
					</div>
				{:else}
					<p class="label mt-8 text-center anim-pulse">STANDBY — AWAITING INITIALIZATION</p>
				{/if}
			</div>
		{:else if (live || paused) && view.protocol}
			<!-- LIVE PROTOCOL -->
			{#if timedOut}
				<div class="mb-4 border border-bad/50 bg-bad/5 px-4 py-2.5 text-center text-sm font-bold tracking-[0.3em] text-bad">PROTOCOL TIMEOUT — SUBMISSIONS CLOSED</div>
			{:else if snap?.state.submissionsLocked}
				<div class="mb-4 border border-bad/50 bg-bad/5 px-4 py-2.5 text-center text-sm font-bold tracking-[0.3em] text-bad">SUBMISSIONS LOCKED BY ADMIN</div>
			{/if}
			<div class="relative">
				{#if paused}
					<div class="absolute inset-0 z-10 flex min-h-80 items-start justify-center bg-void/80 pt-24 backdrop-blur-sm">
						<div class="text-center">
							<p class="display anim-reveal text-6xl text-phos glow sm:text-8xl">SYSTEM HALTED</p>
							<p class="label mt-3">THE ADMIN HAS PAUSED THE PROTOCOL · THE CLOCK IS FROZEN</p>
						</div>
					</div>
				{/if}
				<div class={paused ? 'pointer-events-none opacity-30 blur-[2px]' : ''}>
					{#if view.protocol.id === 'scan'}
						<ScanGrid {view} {game} />
					{:else if view.protocol.id === 'trace'}
						<TraceCase {view} {game} />
					{:else if view.protocol.id === 'overdrive'}
						<OverdriveRun {view} {game} />
					{:else}
						<SequenceView {view} {game} variant={view.protocol.id === 'escape' ? 'escape' : view.protocol.id === 'override' ? 'override' : 'decode'} {roundRatio} />
					{/if}
				</div>
			</div>
		{:else if phase === 'ROUND_COMPLETED' && view.protocol}
			<!-- PROTOCOL DEBRIEF -->
			{@const pid = view.protocol.id}
			{@const solved = view.challenges.filter((c) => c.status === 'solved').length}
			<div class="mx-auto max-w-2xl py-10 text-center">
				<p class="label mb-3">PROTOCOL {view.protocol.code} TERMINATED</p>
				<h1 class="display text-6xl text-phos glow sm:text-8xl">PROTOCOL COMPLETE</h1>
				<div class="mt-10 grid grid-cols-3 border border-line">
					<div class="border-r border-line py-4"><div class="label">PROTOCOL XP</div><div class="display text-4xl text-phos">{fmt(view.rounds[pid] ?? 0)}</div></div>
					<div class="border-r border-line py-4"><div class="label">ACCEPTED</div><div class="display text-4xl text-ink">{solved}/{view.challenges.length}</div></div>
					<div class="py-4"><div class="label">RANK</div><div class="display text-4xl text-ink">{hudView.rank ? `#${hudView.rank}` : '--'}</div></div>
				</div>
				<p class="label mt-10 anim-pulse">GOING DEEPER INTO THE SYSTEM — AWAITING NEXT PROTOCOL</p>
			</div>
		{:else if phase === 'BOSS_COMPLETED' || phase === 'RESULTS_LOCKED'}
			<!-- POST-BOSS SUSPENSE -->
			<div class="mx-auto max-w-2xl py-12 text-center">
				<p class="label mb-3 text-bad!">OVERRIDE TERMINATED</p>
				<h1 class="display text-6xl text-phos glow sm:text-8xl">RESULTS LOCKED</h1>
				<div class="mx-auto mt-10 w-fit border border-line px-10 py-5">
					<div class="label">YOUR BOSS XP</div>
					<div class="display text-6xl text-phos">{fmt(view.xp)}</div>
				</div>
				<p class="mt-8 text-sm text-mute">Your total XP is classified until the final aggregation.</p>
				<p class="label mt-3 anim-pulse">EYES ON THE ARENA DISPLAY</p>
			</div>
		{:else if phase === 'RESULTS_FINALIZED' || phase === 'EVENT_COMPLETE'}
			<!-- FINAL STANDING -->
			{#if finalHeld}
				<div class="mx-auto max-w-2xl py-16 text-center">
					<p class="display text-6xl text-phos glow anim-pulse sm:text-8xl">AGGREGATING…</p>
					<p class="label mt-5">THE FINAL REVEAL IS LIVE ON THE ARENA DISPLAY. LOOK UP.</p>
				</div>
			{:else if myFinal && snap}
				<div class="mx-auto max-w-2xl py-8">
					<div class="text-center">
						<p class="label mb-2">FINAL RANKING</p>
						<p class="display text-9xl text-phos glow">#{String(myFinal.rank).padStart(2, '0')}</p>
						<p class="mt-1 text-xl font-bold tracking-[0.2em]">{myFinal.name}</p>
						{#if myFinal.rank === 1}<p class="mt-3 text-lg text-phos glow">OVERRIDE CHAMPIONS</p>{/if}
					</div>
					<Frame label="XP BREAKDOWN" class="mt-8">
						<table class="w-full text-sm">
							<tbody>
								{#each snap.protocols as p (p.id)}
									<tr class="border-b border-line/60">
										<td class="py-2 text-mute">{p.title}</td>
										<td class="py-2 text-right tabular-nums">{fmt(myFinal.rounds[p.id])}</td>
									</tr>
								{/each}
								<tr>
									<td class="pt-3 font-bold tracking-[0.2em] text-phos">FINAL XP</td>
									<td class="display pt-3 text-right text-4xl text-phos">{fmt(myFinal.total)}</td>
								</tr>
							</tbody>
						</table>
					</Frame>
				</div>
			{:else}
				<p class="py-16 text-center text-mute">Final results are in. See the arena display.</p>
			{/if}
		{/if}
	</main>
{/if}

<style>
	.seat {
		border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
		background: linear-gradient(135deg, color-mix(in srgb, var(--c) 16%, transparent), transparent);
		box-shadow: 0 0 22px -12px var(--c);
	}
	.seat.empty {
		border-style: dashed;
		background: transparent;
	}
</style>
