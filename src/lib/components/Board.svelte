<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import Counter from './Counter.svelte';
	import TeamAvatar from './TeamAvatar.svelte';
	import { MEDALS, teamColor } from '#lib/client/colors.ts';
	import type { BoardRow } from '#lib/engine/leaderboard.ts';

	let {
		rows,
		limit = 10,
		size = 'md',
		highlight = null,
		unit = 'XP'
	}: { rows: BoardRow[]; limit?: number; size?: 'md' | 'lg'; highlight?: string | null; unit?: string } = $props();

	const shown = $derived(rows.slice(0, limit));
	const top = $derived(Math.max(1, shown[0]?.xp ?? 1));
</script>

<ol class="board flex flex-col gap-1.5 p-2" data-size={size}>
	{#each shown as r, i (r.teamId)}
		{@const medal = r.xp > 0 ? MEDALS[r.rank] : undefined}
		<li
			animate:flip={{ duration: 700, easing: (t) => 1 - Math.pow(1 - t, 4) }}
			in:fly={{ y: 14, duration: 500, delay: i * 30 }}
			class="row relative grid items-center overflow-hidden"
			class:me={r.teamId === highlight}
			class:medal={!!medal}
			style:--t={teamColor(r.teamId)}
			style:--m1={medal?.[0]}
			style:--m2={medal?.[1]}
		>
			<span class="bar absolute inset-y-0 left-0" style:transform="scaleX({r.xp / top})"></span>
			<span class="rank display relative">{r.rank}</span>
			<span class="relative flex min-w-0 items-center gap-3">
				<TeamAvatar id={r.teamId} name={r.name} size={size === 'lg' ? 40 : 28} />
				<span class="name truncate font-semibold text-ink">{r.name}</span>
			</span>
			<span class="xp display relative text-right"><Counter value={r.xp} /><span class="unit"> {unit}</span></span>
		</li>
	{:else}
		<li class="label py-8 text-center">No teams ranked yet</li>
	{/each}
</ol>

<style>
	.row {
		grid-template-columns: 2.4rem 1fr auto;
		gap: 0.8rem;
		padding: 0.55rem 0.9rem;
		border-radius: 14px;
		background: rgb(255 255 255 / 0.025);
		transition: background-color 400ms var(--ease);
	}
	.row:hover {
		background: rgb(255 255 255 / 0.05);
	}
	.bar {
		width: 100%;
		transform-origin: left;
		background: linear-gradient(90deg, color-mix(in oklab, var(--t) 16%, transparent), transparent);
		transition: transform 900ms var(--ease);
	}
	.rank {
		font-size: 1.25rem;
		color: var(--faint);
		text-align: center;
	}
	.medal .rank {
		background: linear-gradient(180deg, var(--m1), var(--m2));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.medal {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--m1) 30%, transparent);
	}
	.name {
		font-size: 0.92rem;
		letter-spacing: 0.02em;
	}
	.xp {
		font-size: 1.35rem;
		color: color-mix(in oklab, var(--t) 55%, white);
	}
	.unit {
		font-size: 0.65rem;
		font-family: var(--font-sans);
		letter-spacing: 0.12em;
		color: var(--mute);
	}
	.me {
		box-shadow: inset 0 0 0 1px var(--phos);
		background: var(--wash);
	}
	.board[data-size='lg'] .row {
		grid-template-columns: 3.4rem 1fr auto;
		padding: 0.8rem 1.2rem;
	}
	.board[data-size='lg'] .rank {
		font-size: clamp(1.6rem, 2.2vw, 2.4rem);
	}
	.board[data-size='lg'] .name {
		font-size: clamp(1.05rem, 1.4vw, 1.5rem);
	}
	.board[data-size='lg'] .xp {
		font-size: clamp(1.8rem, 2.4vw, 2.7rem);
	}
</style>
