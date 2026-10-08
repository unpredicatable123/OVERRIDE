<script lang="ts">
	import Board from '#lib/components/Board.svelte';
	import Counter from '#lib/components/Counter.svelte';
	import Curtain from '#lib/components/Curtain.svelte';
	import Feed from '#lib/components/Feed.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import ProtocolTrack from '#lib/components/ProtocolTrack.svelte';
	import FinalReveal from '#lib/components/arena/FinalReveal.svelte';
	import { arena } from '#lib/client/arena.svelte.ts';
	import { clock, fmt, formatClock } from '#lib/client/clock.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';
	import { MEDALS, PROTOCOL_COLORS, setAccent, teamColor, type Accent } from '#lib/client/colors.ts';
	import { scene } from '#lib/client/scene.svelte.ts';
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import { REVEAL_HOLD_MS } from '#lib/engine/views.ts';

	$effect(() => arena.connect());
	$effect(() => clock.use(250));

	const snap = $derived(arena.snapshot);
	const st = $derived(snap?.state);
	const phase = $derived(st?.phase ?? 'EVENT_IDLE');
	const proto = $derived(snap?.protocols.find((p) => p.id === st?.protocol));
	const remaining = $derived(arena.remainingMs);
	const boss = $derived(snap?.board.mode === 'boss');
	const live = $derived(phase === 'ROUND_ACTIVE' || phase === 'BOSS_ACTIVE' || phase === 'ROUND_PAUSED');
	const selfPaced = $derived(phase === 'EVENT_LIVE' || phase === 'LIVE_PAUSED');
	// Self-paced run: one row per protocol with the number of teams in it, then the boss gate.
	const stages = $derived.by(() => {
		const counts = snap?.stats.stages ?? [];
		const rows = (snap?.protocols ?? []).filter((p) => p.id !== 'override').map((p, i) => ({ key: p.id, label: p.name, sub: p.title, colors: PROTOCOL_COLORS[p.id], n: counts[i] ?? 0 }));
		rows.push({ key: 'override', label: 'BOSS GATE', sub: 'Run complete', colors: PROTOCOL_COLORS.override, n: counts[rows.length] ?? 0 });
		return rows;
	});
	const stageMax = $derived(Math.max(1, ...stages.map((r) => r.n)));
	const hot = $derived(remaining !== null && remaining <= 30_000 && phase !== 'ROUND_PAUSED');
	let origin = $state('');
	$effect(() => {
		origin = location.host;
	});

	const accent = $derived.by((): Accent => {
		const m = snap?.board.mode;
		if (m === 'final') return 'final';
		if (m === 'boss') return 'override';
		const ph = snap?.state.phase;
		return snap?.state.protocol && ph !== 'EVENT_IDLE' && ph !== 'EVENT_LOBBY' ? snap.state.protocol : 'lobby';
	});
	// Each protocol re-tints the whole interface; the boss fight goes red, the finale gold.
	$effect(() => {
		setAccent(accent);
		scene.set(accent === 'override' ? 'storm' : accent === 'final' ? 'celebrate' : 'calm', live ? 0.4 : 0.75);
		sound.setMood(accent === 'override' ? 'boss' : 'calm');
		return () => setAccent(null);
	});

	// Reveal plays once when FINALIZE lands (or on load if it just happened). Replayable.
	let revealing = $state(false);
	let revealedFor: number | null = null;
	$effect(() => {
		const f = st?.finalizedAt ?? null;
		if (phase !== 'RESULTS_FINALIZED' || f === null || revealedFor === f || !snap?.final) return;
		revealedFor = f;
		if (clock.serverNow() - f < REVEAL_HOLD_MS) revealing = true;
	});

	let curtain = $state<{ title: string; sub?: string; tone?: 'phos' | 'bad' } | null>(null);
	let prev: string | null = null;
	$effect(() => {
		const ph = phase;
		if (prev === null) {
			prev = ph;
			return;
		}
		if (ph === prev) return;
		const from = prev;
		prev = ph;
		if (ph === 'EVENT_LIVE' && from === 'EVENT_LOBBY') {
			curtain = { title: 'SYSTEM ONLINE', sub: 'EVERY TEAM AT ITS OWN PACE' };
			sound.play('unlock');
		} else if (ph === 'BOSS_ACTIVE' && from !== 'ROUND_PAUSED') {
			curtain = { title: 'SYSTEM FAILURE', sub: 'BOSS FIGHT ENGAGED', tone: 'bad' };
			sound.play('boss');
		} else if (ph === 'ROUND_ACTIVE' && from !== 'ROUND_PAUSED' && proto) {
			curtain = { title: `ROUND ${String(proto.index + 1).padStart(2, '0')}`, sub: proto.title.toUpperCase() };
			sound.play('unlock');
		} else if (ph === 'ROUND_COMPLETED' || ph === 'BOSS_COMPLETED') sound.play('alarm');
	});

	let lastTick = -1;
	$effect(() => {
		if (phase !== 'ROUND_ACTIVE' && phase !== 'BOSS_ACTIVE') return;
		if (remaining === null) return;
		const s = Math.ceil(remaining / 1000);
		if (s === lastTick) return;
		lastTick = s;
		if (s > 0 && s <= 10) sound.play(s <= 3 ? 'tickHot' : 'tick');
	});
</script>

<svelte:head><title>{proto ? `${proto.name} // ARENA` : 'OVERRIDE // ARENA'}</title></svelte:head>

{#if curtain}<Curtain {...curtain} ondone={() => (curtain = null)} />{/if}
{#if revealing && snap?.final}
	<FinalReveal results={snap.final} protocols={snap.protocols} ondone={() => setTimeout(() => (revealing = false), 4000)} />
{/if}

{#if !sound.unlocked}
	<div class="label fixed top-3 left-1/2 z-[60] -translate-x-1/2 border border-line bg-panel px-3 py-1.5 anim-pulse">CLICK ANYWHERE TO ARM AUDIO</div>
{/if}

<main class="relative flex min-h-dvh flex-col overflow-hidden px-6 py-6 xl:px-12 xl:py-10">
	<div class="dots pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(circle_at_50%_40%,black,transparent_75%)]"></div>

	<header class="relative flex items-center justify-between gap-6">
		<Logo size="sm" />
		{#if snap}<ProtocolTrack protocols={snap.protocols} current={st?.protocol ?? null} completed={st?.completed ?? []} class="hidden lg:flex" />{/if}
		<span class="label {arena.online ? 'text-ok!' : 'text-bad!'}">● {arena.online ? 'LIVE' : 'RECONNECTING'}</span>
	</header>

	{#if !snap}
		<div class="flex flex-1 items-center justify-center"><p class="display text-5xl text-phos-dim anim-pulse">CONNECTING TO ARENA…</p></div>
	{:else if phase === 'EVENT_IDLE' || phase === 'EVENT_LOBBY'}
		<section class="relative flex flex-1 flex-col items-center justify-center text-center">
			<Logo size="xl" spaced />
			<p class="label mt-6 text-lg! tracking-[0.6em]!">LIVE ARENA STATUS</p>
			<p class="display mt-10 text-8xl text-ink glow"><Counter value={snap.stats.activeTeams} /> <span class="grad">{snap.stats.activeTeams === 1 ? 'TEAM' : 'TEAMS'} ACTIVE</span></p>
			<p class="mt-4 text-xl tracking-[0.35em] text-mute">{phase === 'EVENT_LOBBY' ? 'OPERATORS CONNECTING — STAND BY' : 'SYSTEM DORMANT'}</p>
			{#if origin}<p class="mt-12 text-2xl tracking-[0.2em] text-ink">JACK IN → <span class="iris font-black">{origin}/login</span></p>{/if}
		</section>
	{:else if selfPaced}
		<section class="relative grid flex-1 gap-10 pt-6 lg:grid-cols-[1.05fr_1fr] xl:gap-16">
			<div class="flex flex-col justify-center">
				<p class="label text-xl! tracking-[0.5em]!">SELF-PACED RUN</p>
				{#if phase === 'LIVE_PAUSED'}
					<p class="display anim-reveal mt-3 text-6xl text-phos xl:text-8xl">SYSTEM HALTED</p>
				{:else}
					<p class="display iris mt-3 text-5xl xl:text-7xl">CLEAR TO ADVANCE</p>
				{/if}
				<div class="mt-8 flex flex-col gap-3">
					{#each stages as r (r.key)}
						<div class="grid grid-cols-[11rem_1fr_4rem] items-center gap-4">
							<div>
								<div class="text-lg font-bold tracking-[0.2em] {r.key === 'override' ? 'text-bad' : 'text-ink'}">{r.label}</div>
								<div class="label">{r.sub}</div>
							</div>
							<div class="h-3 overflow-hidden rounded-full bg-white/5">
								<div
									class="h-full rounded-full transition-[width] duration-700"
									style:width="{(r.n / stageMax) * 100}%"
									style:background="linear-gradient(90deg, {r.colors[0]}, {r.colors[1]})"
								></div>
							</div>
							<div class="display text-right text-4xl text-ink"><Counter value={r.n} /></div>
						</div>
					{/each}
				</div>
				<div class="mt-8 flex gap-12">
					<div><div class="label text-base!">TEAMS ACTIVE</div><div class="display text-6xl text-ink"><Counter value={snap.stats.activeTeams} /></div></div>
					<div><div class="label text-base!">SUBMISSIONS</div><div class="display text-6xl text-ink"><Counter value={snap.stats.submissions} /></div></div>
					<div><div class="label text-base!">AVG XP</div><div class="display text-6xl text-phos"><Counter value={snap.stats.avgXp} /></div></div>
				</div>
				<div class="rule my-8"></div>
				<p class="label mb-3 text-base!">LIVE ACTION</p>
				<Feed items={snap.feed} limit={5} size="lg" />
			</div>
			<div class="flex flex-col justify-center">
				<p class="label mb-3 text-lg! tracking-[0.4em]! text-phos!">LIVE LEADERBOARD</p>
				<div class="border border-line bg-panel/60">
					<Board rows={snap.board.rows} limit={10} size="lg" unit="XP" />
				</div>
			</div>
		</section>
	{:else if phase === 'ROUND_READY' && proto}
		<section class="relative flex flex-1 flex-col items-center justify-center text-center">
			<p class="label text-xl! tracking-[0.6em]! {boss ? 'text-bad!' : ''}">{boss ? 'FINAL PROTOCOL' : 'NEXT PROTOCOL'}</p>
			<p class="display grad mt-4 text-[10rem] leading-none xl:text-[14rem]">
				{boss ? 'OVERRIDE' : `ROUND ${String(proto.index + 1).padStart(2, '0')}`}
			</p>
			<p class="mt-4 text-5xl font-bold tracking-[0.3em] text-ink">{proto.title.toUpperCase()}</p>
			<p class="mt-4 text-xl tracking-[0.2em] text-mute">{proto.tagline}</p>
			<p class="display mt-10 text-7xl text-ink">{formatClock(proto.durationSec * 1000)}</p>
			<p class="label mt-8 text-lg! anim-pulse">STANDBY</p>
		</section>
	{:else if live && proto}
		<section class="relative grid flex-1 gap-10 pt-6 lg:grid-cols-[1.05fr_1fr] xl:gap-16">
			<div class="flex flex-col justify-center">
				{#if boss}
					<p class="display grad text-7xl whitespace-nowrap tracking-[0.45em] xl:text-9xl">OVERRIDE</p>
					<p class="mt-2 text-3xl font-bold tracking-[0.5em] text-ink">BOSS FIGHT</p>
				{:else}
					<p class="label text-xl! tracking-[0.5em]!">ROUND {String(proto.index + 1).padStart(2, '0')} · {proto.name}</p>
					<p class="display iris mt-3 text-5xl xl:text-7xl">{proto.title}</p>
				{/if}
				<p class="display mt-6 text-[11rem] leading-none tabular-nums xl:text-[15rem] {hot ? 'text-bad glow anim-pulse' : phase === 'ROUND_PAUSED' ? 'text-mute' : 'grad'}">
					{formatClock(remaining)}
				</p>
				{#if phase === 'ROUND_PAUSED'}
					<p class="display anim-reveal text-6xl text-phos">SYSTEM HALTED</p>
				{:else if boss}
					<p class="text-2xl tracking-[0.4em] text-bad anim-pulse">THE SYSTEM IS FAILING</p>
				{/if}
				<div class="mt-8 flex gap-12">
					<div><div class="label text-base!">TEAMS ACTIVE</div><div class="display text-6xl text-ink"><Counter value={snap.stats.activeTeams} /></div></div>
					<div><div class="label text-base!">SUBMISSIONS</div><div class="display text-6xl text-ink"><Counter value={snap.stats.submissions} /></div></div>
					<div><div class="label text-base!">AVG {boss ? 'BOSS ' : ''}XP</div><div class="display text-6xl text-phos"><Counter value={snap.stats.avgXp} /></div></div>
				</div>
				<div class="rule my-8"></div>
				<p class="label mb-3 text-base!">LIVE ACTION</p>
				<Feed items={snap.feed} limit={5} size="lg" />
			</div>
			<div class="flex flex-col justify-center">
				<p class="label mb-3 text-lg! tracking-[0.4em]! {boss ? 'text-bad!' : 'text-phos!'}">{boss ? 'OVERRIDE // BOSS' : 'LIVE LEADERBOARD'}</p>
				<div class="border border-line bg-panel/60">
					<Board rows={snap.board.rows} limit={10} size="lg" unit={boss ? 'BOSS' : 'XP'} />
				</div>
			</div>
		</section>
	{:else if phase === 'ROUND_COMPLETED' || phase === 'BOSS_COMPLETED' || phase === 'RESULTS_LOCKED'}
		<section class="relative grid flex-1 items-center gap-12 pt-6 lg:grid-cols-[1fr_1.1fr]">
			<div>
				<p class="label text-xl! tracking-[0.5em]!">{proto?.name ?? ''} TERMINATED</p>
				<p class="display grad mt-3 text-9xl leading-none">{boss ? 'RESULTS LOCKED' : 'PROTOCOL COMPLETE'}</p>
				<p class="mt-6 text-2xl tracking-[0.25em] text-mute">{boss ? 'TOTAL XP IS CLASSIFIED UNTIL FINALIZATION' : 'GOING DEEPER INTO THE SYSTEM…'}</p>
			</div>
			<div>
				<p class="label mb-3 text-lg! tracking-[0.4em]! {boss ? 'text-bad!' : 'text-phos!'}">{boss ? 'OVERRIDE // BOSS' : 'STANDINGS'}</p>
				<div class="border border-line bg-panel/60"><Board rows={snap.board.rows} limit={10} size="lg" unit={boss ? 'BOSS' : 'XP'} /></div>
			</div>
		</section>
	{:else if (phase === 'RESULTS_FINALIZED' || phase === 'EVENT_COMPLETE') && snap.final}
		{@const f = snap.final}
		<section class="relative flex flex-1 flex-col items-center pt-6">
			<p class="label text-xl! tracking-[0.6em]!">{phase === 'EVENT_COMPLETE' ? 'THANK YOU, OPERATORS' : 'FINAL RESULTS'}</p>
			<div class="mt-8 grid w-full max-w-6xl grid-cols-3 items-end gap-6">
				{#each [f[1], f[0], f[2]] as r, i (i)}
					{#if r}
						{@const [m1, m2] = MEDALS[r.rank] ?? ['var(--phos)', 'var(--phos-2)']}
						<div class="podium flex flex-col items-center px-4 text-center {i === 1 ? 'py-10' : 'py-6'}" style:--m1={m1} style:--m2={m2}>
							<p class="medal display leading-none {i === 1 ? 'text-9xl' : 'text-7xl'}">#{String(r.rank).padStart(2, '0')}</p>
							<div class="mt-3 flex items-center gap-3">
								<TeamAvatar id={r.teamId} name={r.name} size={i === 1 ? 44 : 32} />
								<p class="font-black tracking-[0.2em] {i === 1 ? 'iris text-4xl' : 'text-2xl text-ink'}">{r.name}</p>
							</div>
							<p class="medal display mt-3 text-5xl">{fmt(r.total)} XP</p>
							{#if i === 1}<p class="mt-3 whitespace-nowrap text-sm font-bold tracking-[0.25em] text-ink xl:text-base">OVERRIDE CHAMPIONS</p>{/if}
						</div>
					{:else}<div></div>{/if}
				{/each}
			</div>
			<div class="mt-8 w-full max-w-6xl columns-1 gap-8 lg:columns-2">
				{#each f.slice(3, 23) as r (r.teamId)}
					<div class="flex break-inside-avoid items-center gap-4 border-b py-1.5 text-lg" style:border-color="color-mix(in srgb, {teamColor(r.teamId)} 25%, transparent)">
						<span class="display w-12 text-2xl text-faint">#{String(r.rank).padStart(2, '0')}</span>
						<TeamAvatar id={r.teamId} name={r.name} size={24} />
						<span class="flex-1 truncate font-bold tracking-wider">{r.name}</span>
						<span class="display text-2xl" style:color={teamColor(r.teamId)}>{fmt(r.total)}</span>
					</div>
				{/each}
			</div>
			<button class="label absolute right-0 bottom-0 opacity-30 hover:opacity-100" onclick={() => (revealing = true)}>↻ REPLAY REVEAL</button>
		</section>
	{/if}
</main>

<style>
	.podium {
		border: 2px solid transparent;
		background:
			linear-gradient(color-mix(in srgb, var(--panel) 85%, transparent), color-mix(in srgb, var(--panel) 85%, transparent)) padding-box,
			linear-gradient(160deg, var(--m1), transparent 45%, var(--m2)) border-box;
		box-shadow: 0 0 60px -20px var(--m1);
	}
	.medal {
		background: linear-gradient(180deg, var(--m1), var(--m2));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 18px color-mix(in srgb, var(--m1) 55%, transparent));
	}
</style>
