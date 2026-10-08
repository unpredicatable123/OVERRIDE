<script lang="ts">
	import Frame from '#lib/components/Frame.svelte';
	import { fmt } from '#lib/client/clock.svelte.ts';
	import { tagColor } from '#lib/client/colors.ts';
	import type { GameClient } from '#lib/client/team.svelte.ts';
	import { BINGO_SIZE } from '#lib/engine/scoring.ts';
	import type { ChallengeView, TeamStateView } from '#lib/engine/views.ts';
	import ChallengeConsole from './ChallengeConsole.svelte';

	let { view, game }: { view: TeamStateView; game: GameClient } = $props();

	let selected = $state<string | null>(null);
	const cells = $derived(view.challenges);
	const active = $derived(cells.find((c) => c.id === selected) ?? null);
	const solved = $derived(new Set(cells.filter((c) => c.status === 'solved').map((c) => c.order)));

	/** Cells that sit on a completed row / column / diagonal glow brighter. */
	const lineCells = $derived.by(() => {
		const out = new Set<number>();
		const N = BINGO_SIZE;
		const lines: number[][] = [];
		for (let i = 0; i < N; i++) {
			lines.push([...Array(N).keys()].map((j) => i * N + j));
			lines.push([...Array(N).keys()].map((j) => j * N + i));
		}
		lines.push([...Array(N).keys()].map((i) => i * N + i));
		lines.push([...Array(N).keys()].map((i) => i * N + (N - 1 - i)));
		for (const l of lines) if (l.every((c) => solved.has(c))) l.forEach((c) => out.add(c));
		return out;
	});

	async function pick(c: ChallengeView) {
		selected = c.id;
		if (c.status === 'ready') await game.open(c.id);
	}

	$effect(() => {
		// Auto-close the sheet shortly after a correct answer so the grid stays the focus.
		if (active?.status === 'solved') {
			const t = setTimeout(() => (selected = null), 1100);
			return () => clearTimeout(t);
		}
	});
</script>

<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
	<Frame label="Signature grid">
		{#snippet meta()}
			<span>Lines <span class="text-ink">{view.bingoLines}</span> · +{view.protocol?.lineBonus} XP each</span>
		{/snippet}
		<div class="grid grid-cols-4 gap-2 sm:gap-3" style="perspective: 900px">
			{#each cells as c, i (c.id)}
				{@const done = c.status === 'solved'}
				{@const dead = c.status === 'failed'}
				<button
					class="cell relative flex aspect-square flex-col justify-between rounded-xl p-2 text-left sm:aspect-[4/3] sm:rounded-2xl sm:p-3.5 xl:aspect-[16/10]"
					class:done
					class:dead
					class:line={lineCells.has(c.order)}
					class:sel={selected === c.id}
					style:--c={tagColor(c.tag, c.order)}
					style:animation-delay="{i * 35}ms"
					onclick={() => pick(c)}
					aria-label="{c.tag} — {c.title}"
				>
					<span class="tag text-[0.5rem] font-semibold tracking-[0.14em] sm:text-[0.62rem]">{c.tag}</span>
					<span class="font-display text-[0.66rem] leading-tight font-semibold text-ink sm:text-[0.95rem]">{c.title}</span>
					<span class="num display text-right text-xs sm:text-xl">
						{done ? `+${c.xp}` : dead ? '✕' : String(c.order + 1).padStart(2, '0')}
					</span>
				</button>
			{/each}
		</div>
	</Frame>

	<div class="lg:sticky lg:top-28 lg:self-start">
		{#if active}
			<Frame label="Identify signature" tone="hot">
				{#snippet meta()}<button class="transition-colors hover:text-ink" onclick={() => (selected = null)}>Close ×</button>{/snippet}
				{#key active.id}<ChallengeConsole challenge={active} {game} />{/key}
			</Frame>
		{:else}
			<Frame label="Scanner" tone="dim">
				<p class="text-sm leading-relaxed text-mute">
					Tap a signature to identify it. Each correct ID is worth <span class="text-ink">{fmt(cells[0]?.maxXp ?? 0)} XP</span>.
					Complete a row, column or diagonal for <span class="text-ink">+{view.protocol?.lineBonus} XP</span> per line.
				</p>
				<div class="mt-5 flex items-center gap-3">
					<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
						<div class="h-full rounded-full transition-[width] duration-700" style:width="{(solved.size / Math.max(1, cells.length)) * 100}%" style:background="var(--grad)"></div>
					</div>
					<span class="text-xs text-mute">{solved.size}/{cells.length}</span>
				</div>
			</Frame>
		{/if}
	</div>
</div>

<style>
	.cell {
		background: linear-gradient(160deg, color-mix(in oklab, var(--c) 10%, rgb(255 255 255 / 0.03)), rgb(255 255 255 / 0.015));
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07);
		animation: tile-in 700ms var(--ease) both;
		transition:
			transform 450ms var(--ease),
			box-shadow 450ms var(--ease),
			background 450ms var(--ease);
	}
	.cell:hover {
		transform: translate3d(0, -4px, 0) rotateX(6deg);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--c) 55%, transparent),
			0 18px 34px -18px var(--c);
	}
	.tag {
		color: color-mix(in oklab, var(--c) 80%, white);
	}
	.num {
		color: var(--faint);
	}
	.cell.done {
		background: linear-gradient(150deg, color-mix(in oklab, var(--c) 42%, transparent), color-mix(in oklab, var(--c) 10%, transparent));
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--c) 60%, transparent),
			0 14px 30px -18px var(--c);
	}
	.cell.done .num {
		color: white;
	}
	.cell.dead {
		opacity: 0.45;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 40%, transparent);
	}
	.cell.line {
		box-shadow:
			inset 0 0 0 1.5px var(--yellow),
			0 0 34px -10px var(--yellow);
	}
	.cell.sel {
		box-shadow:
			inset 0 0 0 2px var(--c),
			0 18px 40px -16px var(--c);
	}
	.cell:active {
		transform: scale(0.97);
	}
	@keyframes tile-in {
		from {
			opacity: 0;
			transform: translate3d(0, 18px, 0) rotateX(-25deg);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
