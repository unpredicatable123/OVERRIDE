<script lang="ts">
	import Btn from '#lib/components/Btn.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import { clock, fmt } from '#lib/client/clock.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';
	import type { GameClient } from '#lib/client/team.svelte.ts';
	import type { TeamStateView } from '#lib/engine/views.ts';
	import ChallengeConsole from './ChallengeConsole.svelte';

	let { view, game }: { view: TeamStateView; game: GameClient } = $props();

	const qs = $derived(view.challenges);
	const current = $derived(qs.find((q) => q.status === 'ready' || q.status === 'open') ?? null);
	const index = $derived(current ? qs.indexOf(current) : qs.length);
	const solved = $derived(qs.filter((q) => q.status === 'solved').length);
	const xp = $derived(qs.reduce((s, q) => s + q.xp, 0));
	/** Consecutive accepted answers counting back from the latest closed question. */
	const streak = $derived.by(() => {
		let n = 0;
		for (let i = index - 1; i >= 0; i--) {
			if (qs[i].status === 'solved') n++;
			else break;
		}
		return n;
	});
	const started = $derived(qs.some((q) => q.status !== 'ready' && q.status !== 'locked'));

	const secondsLeft = $derived(current?.deadlineAt != null ? Math.max(0, Math.ceil((current.deadlineAt - clock.now) / 1000)) : null);

	// Countdown ticks; when the fuse burns out, ask the server for the next question.
	let lastSecond: number | null = null;
	$effect(() => {
		const s = secondsLeft;
		if (s === null || s === lastSecond) return;
		lastSecond = s;
		if (s > 0 && s <= 3) sound.play('tickHot');
		else if (s > 0) sound.play('tick');
		if (s === 0) {
			const t = setTimeout(() => game.refresh(), 1700);
			return () => clearTimeout(t);
		}
	});

	// After the first INITIALIZE, each next question opens automatically after a short beat.
	let opening: string | null = null;
	$effect(() => {
		const q = current;
		if (!q || q.status !== 'ready' || !started || opening === q.id) return;
		opening = q.id;
		const t = setTimeout(() => game.open(q.id), 900);
		return () => clearTimeout(t);
	});
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-4">
	<div class="grid grid-cols-3 gap-2">
		<div class="tile px-3 py-3 text-center">
			<div class="label">Question</div>
			<div class="display mt-1 text-2xl text-ink">{Math.min(index + 1, qs.length)}<span class="text-faint"> / {qs.length}</span></div>
		</div>
		<div class="tile px-3 py-3 text-center">
			<div class="label">Streak</div>
			<div class="display mt-1 text-2xl {streak >= 3 ? 'grad' : 'text-ink'}">×{streak}</div>
		</div>
		<div class="tile px-3 py-3 text-center">
			<div class="label">Stack XP</div>
			<div class="display grad mt-1 text-2xl">{fmt(xp)}</div>
		</div>
	</div>

	{#if current}
		{#if current.status === 'open' && secondsLeft !== null}
			{@const frac = current.timeLimitSec ? Math.max(0, (current.deadlineAt! - clock.now) / (current.timeLimitSec * 1000)) : 0}
			<!-- Countdown ring: the arc drains smoothly, the number pops each second. -->
			<div class="relative mx-auto h-40 w-40 sm:h-48 sm:w-48">
				<svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90">
					<defs>
						<linearGradient id="od-ring" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color={secondsLeft <= 3 ? 'var(--bad)' : 'var(--phos)'} />
							<stop offset="1" stop-color="var(--phos-2)" />
						</linearGradient>
					</defs>
					<circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.07)" stroke-width="5" />
					<circle cx="50" cy="50" r="44" fill="none" stroke="url(#od-ring)" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - frac * 100} style="filter: drop-shadow(0 0 6px var(--phos))" />
				</svg>
				<div class="absolute inset-0 flex items-center justify-center">
					{#key secondsLeft}
						<span class="tick display text-6xl sm:text-7xl {secondsLeft <= 3 ? 'text-bad' : 'text-ink'}">{secondsLeft}</span>
					{/key}
				</div>
			</div>
		{/if}
		<Frame tone={secondsLeft !== null && secondsLeft <= 3 ? 'bad' : 'hot'}>
			{#if !started}
				<div class="flex flex-col items-center gap-5 py-6 text-center">
					<p class="display iris text-5xl">Overdrive</p>
					<p class="max-w-md text-sm text-mute">
						{qs.length} questions. {current.timeLimitSec}s each. One shot per question. Keys
						<span class="text-ink">1–4</span> answer instantly. Questions chain automatically.
					</p>
					<Btn size="lg" onclick={() => game.open(current.id)}>Start the stack</Btn>
				</div>
			{:else if current.status === 'ready'}
				<p class="display py-10 text-center text-3xl text-mute anim-pulse">Next question…</p>
			{:else}
				{#key current.id}<ChallengeConsole challenge={current} {game} heading={false} bigOptions hotkeys />{/key}
			{/if}
		</Frame>
	{:else}
		<Frame tone="ok">
			<div class="py-8 text-center">
				<p class="display iris text-5xl">Stack complete</p>
				<p class="mt-3 text-sm text-mute">{solved}/{qs.length} accepted · {fmt(xp)} XP</p>
			</div>
		</Frame>
	{/if}
</div>

<style>
	.tick {
		animation: tick-pop 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes tick-pop {
		from {
			transform: scale(1.25);
			opacity: 0.3;
			filter: blur(6px);
		}
		to {
			transform: none;
			opacity: 1;
		}
	}
</style>
