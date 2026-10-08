<script lang="ts">
	import { fly } from 'svelte/transition';
	import Board from '#lib/components/Board.svelte';
	import Btn from '#lib/components/Btn.svelte';
	import Curtain from '#lib/components/Curtain.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Typewriter from '#lib/components/Typewriter.svelte';
	import FinalReveal from '#lib/components/arena/FinalReveal.svelte';
	import Hud from '#lib/components/play/Hud.svelte';
	import OverdriveRun from '#lib/components/play/OverdriveRun.svelte';
	import ScanGrid from '#lib/components/play/ScanGrid.svelte';
	import SequenceView from '#lib/components/play/SequenceView.svelte';
	import TraceCase from '#lib/components/play/TraceCase.svelte';
	import VerdictFlash from '#lib/components/play/VerdictFlash.svelte';
	import { clock, fmt, formatClock } from '#lib/client/clock.svelte.ts';
	import { setAccent } from '#lib/client/colors.ts';
	import { scene } from '#lib/client/scene.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';
	import { DemoGame } from '#lib/demo/demoGame.svelte.ts';
	import type { ProtocolId } from '#lib/engine/types.ts';

	const game = new DemoGame();
	const view = $derived(game.view);
	const boss = $derived(game.protocolId === 'override' && game.phase !== 'select');

	$effect(() => clock.use(250));

	// Mood: the field calms while you think, and darkens for the boss.
	$effect(() => {
		setAccent(boss ? 'override' : 'lobby');
		if (game.phase === 'live') scene.set(boss ? 'storm' : 'live', boss ? 0.6 : 0.4);
		else scene.set('calm', game.phase === 'select' ? 0.9 : 0.7);
		sound.setMood(boss ? 'boss' : 'calm');
	});
	$effect(() => () => setAccent(null));

	// The round ends when the clock runs out or every node is closed.
	$effect(() => {
		if (game.phase !== 'live') return;
		const over = (game.remainingMs ?? 1) <= 0 || game.cleared;
		if (!over) return;
		const t = setTimeout(() => {
			game.finish();
			sound.play('alarm');
		}, 1800);
		return () => clearTimeout(t);
	});

	let curtain = $state<{ title: string; sub: string; tone?: 'phos' | 'bad' } | null>(null);
	let revealing = $state(false);

	function begin() {
		const p = game.protocol!;
		curtain = boss ? { title: 'System failure', sub: 'Boss fight', tone: 'bad' } : { title: p.name, sub: p.title };
		sound.play(boss ? 'boss' : 'unlock');
		scene.pulse(boss ? 1.4 : 0.8);
		game.start();
	}

	function pick(id: ProtocolId) {
		sound.unlock();
		game.choose(id);
	}

	const nextProtocol = $derived.by(() => {
		const i = game.protocols.findIndex((p) => p.id === game.protocolId);
		return i >= 0 && i < game.protocols.length - 1 ? game.protocols[i + 1] : null;
	});
	const accepted = $derived(view?.challenges.filter((c) => c.status === 'solved').length ?? 0);
	const maxAvailable = $derived(view?.challenges.reduce((s, c) => s + c.maxXp, 0) ?? 0);
	const myRank = $derived(game.board.find((r) => r.teamId === 'DEMO')?.rank ?? null);
</script>

<svelte:head><title>Demo · OVERRIDE</title></svelte:head>

{#if curtain}<Curtain {...curtain} ondone={() => (curtain = null)} />{/if}
{#if revealing}
	<FinalReveal results={game.finalResults} protocols={game.protocols} ondone={() => setTimeout(() => (revealing = false), 3000)} />
{/if}

{#if game.phase === 'select'}
	<header class="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6">
		<a href="/" aria-label="Home"><Logo size="sm" /></a>
		<a href="/login" class="text-sm text-mute transition-colors hover:text-ink">Join the real arena →</a>
	</header>
{:else}
	<Hud {view} remainingMs={game.remainingMs} durationMs={game.durationMs} paused={false} online badge="Demo" />
{/if}
<VerdictFlash verdict={game.verdict} />
{#if game.notice}
	<div transition:fly={{ y: 10, duration: 300 }} class="fixed inset-x-0 bottom-20 z-[85] mx-auto w-fit rounded-full bg-panel px-4 py-2 text-sm text-ink shadow-lg ring-1 ring-white/10" role="alert">{game.notice}</div>
{/if}

<main class="mx-auto max-w-7xl px-4 pt-6 pb-28 sm:px-6">
	{#if game.phase === 'select'}
		<!-- PICK A PROTOCOL -->
		<section class="mx-auto max-w-6xl">
			<div class="anim-rise py-10 text-center sm:py-14">
				<p class="label mb-4 tracking-[0.35em]!">Demo arena</p>
				<h1 class="display iris text-5xl sm:text-7xl">Try every protocol.</h1>
				<p class="mx-auto mt-5 max-w-xl text-mute">
					No team, no sign-up. Pick any round, play it against the clock, and see how you rank against seven simulated teams.
					Demo puzzles are separate from the real event.
				</p>
			</div>

			<div class="grid gap-6 lg:grid-cols-[1fr_340px]">
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each game.protocols as p, i (p.id)}
						{@const best = game.best[p.id]}
						<button class="card anim-rise text-left" style:animation-delay="{120 + i * 70}ms" class:boss={p.id === 'override'} onclick={() => pick(p.id)}>
							<Frame tilt class="h-full">
								<div class="flex h-full min-h-40 flex-col">
									<div class="flex items-center justify-between">
										<span class="font-mono text-xs text-mute">{p.code}</span>
										{#if best > 0}<span class="chip">Best {fmt(best)} XP</span>{/if}
									</div>
									<p class="display mt-5 text-2xl text-ink">{p.name}</p>
									<p class="mt-1 text-sm text-mute">{p.title}</p>
									<p class="mt-auto pt-6 text-xs text-faint">{p.tagline}</p>
									<span class="go mt-4 text-sm text-ink">Play · {formatClock(p.durationSec * 1000)} →</span>
								</div>
							</Frame>
						</button>
					{/each}
				</div>

				<aside class="flex flex-col gap-4">
					<Frame label="Standings" pad={false}>
						<Board rows={game.board} limit={8} highlight="DEMO" />
					</Frame>
					<div class="flex flex-wrap gap-2">
						<Btn variant="ghost" onclick={() => (revealing = true)}>Preview the final reveal</Btn>
						{#if game.total > 0}<Btn variant="ghost" onclick={() => game.reset()}>Reset</Btn>{/if}
					</div>
				</aside>
			</div>
		</section>
	{:else if game.phase === 'ready' && view.protocol}
		<!-- BRIEFING -->
		<section class="mx-auto max-w-2xl py-10 text-center sm:py-16">
			<p class="label anim-rise tracking-[0.35em]!">{boss ? 'Final protocol' : `Protocol ${view.protocol.code}`}</p>
			<h1 class="display iris anim-reveal mt-4 text-6xl sm:text-8xl">{view.protocol.name}</h1>
			<p class="anim-rise mt-3 text-mute" style="animation-delay: 200ms">{view.protocol.title} — {view.protocol.tagline}</p>
			<p class="mx-auto mt-8 min-h-20 max-w-xl leading-relaxed text-ink/85"><Typewriter text={view.protocol.story} speed={16} /></p>
			<div class="anim-rise mt-8 grid grid-cols-3 gap-2" style="animation-delay: 400ms">
				<div class="tile py-4"><div class="label">Duration</div><div class="display mt-1 text-2xl">{formatClock(view.protocol.durationSec * 1000)}</div></div>
				<div class="tile py-4"><div class="label">Nodes</div><div class="display mt-1 text-2xl">{view.challenges.length}</div></div>
				<div class="tile py-4"><div class="label">Max XP</div><div class="display mt-1 text-2xl">{fmt(maxAvailable)}</div></div>
			</div>
			<div class="anim-rise mt-10 flex justify-center gap-3" style="animation-delay: 550ms">
				<Btn size="lg" onclick={begin}>Begin</Btn>
				<Btn size="lg" variant="ghost" onclick={() => game.back()}>Back</Btn>
			</div>
		</section>
	{:else if game.phase === 'live' && view.protocol}
		<!-- LIVE -->
		<div class="anim-rise">
			{#if view.protocol.id === 'scan'}
				<ScanGrid {view} {game} />
			{:else if view.protocol.id === 'trace'}
				<TraceCase {view} {game} />
			{:else if view.protocol.id === 'overdrive'}
				<OverdriveRun {view} {game} />
			{:else}
				<SequenceView
					{view}
					{game}
					variant={view.protocol.id === 'escape' ? 'escape' : view.protocol.id === 'override' ? 'override' : 'decode'}
					roundRatio={game.remainingMs !== null && game.durationMs ? game.remainingMs / game.durationMs : 1}
				/>
			{/if}
		</div>
		<div class="mt-8 flex justify-center">
			<Btn variant="ghost" size="sm" onclick={() => game.finish()}>End protocol</Btn>
		</div>
	{:else if game.phase === 'done' && view.protocol}
		<!-- DEBRIEF -->
		<section class="mx-auto grid max-w-5xl items-start gap-6 py-8 lg:grid-cols-[1fr_360px]">
			<div class="anim-rise">
				<p class="label tracking-[0.35em]!">{view.protocol.name} complete</p>
				<h1 class="display iris mt-4 text-5xl sm:text-6xl">{fmt(game.runXp)} XP</h1>
				<div class="mt-8 grid grid-cols-3 gap-2">
					<div class="tile py-4 text-center"><div class="label">Accepted</div><div class="display mt-1 text-2xl">{accepted}/{view.challenges.length}</div></div>
					<div class="tile py-4 text-center"><div class="label">Rank</div><div class="display mt-1 text-2xl">#{myRank}</div></div>
					<div class="tile py-4 text-center"><div class="label">Total</div><div class="display mt-1 text-2xl">{fmt(game.total)}</div></div>
				</div>
				<div class="mt-8 flex flex-wrap gap-3">
					{#if nextProtocol}<Btn onclick={() => pick(nextProtocol.id)}>Next · {nextProtocol.name}</Btn>{/if}
					<Btn variant="ghost" onclick={() => pick(view.protocol!.id)}>Play again</Btn>
					<Btn variant="ghost" onclick={() => game.back()}>All protocols</Btn>
				</div>
			</div>
			<Frame label={boss ? 'Boss standings' : 'Standings'} pad={false} class="anim-rise">
				<Board rows={game.board} limit={8} highlight="DEMO" unit={boss ? 'Boss' : 'XP'} />
			</Frame>
		</section>
	{/if}
</main>

<style>
	.card {
		display: block;
		border-radius: 22px;
	}
	.card :global(.frame) {
		height: 100%;
	}
	.go {
		opacity: 0.55;
		transition:
			opacity 300ms var(--ease),
			transform 300ms var(--ease);
	}
	.card:hover .go {
		opacity: 1;
		transform: translate3d(3px, 0, 0);
	}
	.card.boss :global(.frame) {
		--a: #c97b7f;
	}
</style>
