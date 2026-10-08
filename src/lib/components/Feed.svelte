<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import TeamAvatar from './TeamAvatar.svelte';
	import { PROTOCOL_COLORS } from '#lib/client/colors.ts';
	import type { FeedItem } from '#lib/engine/views.ts';

	let { items, limit = 8, size = 'md' }: { items: FeedItem[]; limit?: number; size?: 'md' | 'lg' } = $props();

	const icon: Record<FeedItem['kind'], string> = { solve: '◆', bingo: '▦', escape: '★' };
</script>

<ul class="flex flex-col gap-1.5 {size === 'lg' ? 'text-base xl:text-lg' : 'text-sm'}">
	{#each items.slice(0, limit) as f (f.id)}
		{@const [a, b] = PROTOCOL_COLORS[f.protocol]}
		<li
			animate:flip={{ duration: 500 }}
			in:fly={{ x: -24, duration: 600, easing: (t) => 1 - Math.pow(1 - t, 4) }}
			class="item flex items-center gap-3 rounded-xl px-3 py-2"
			class:big={f.kind !== 'solve'}
			style:--a={a}
			style:--b={b}
		>
			<TeamAvatar id={f.teamId} name={f.team} size={size === 'lg' ? 30 : 22} />
			<span class="truncate font-semibold text-ink">{f.team}</span>
			<span class="truncate text-mute"><span style:color="var(--a)">{icon[f.kind]}</span> {f.kind === 'escape' ? f.label : f.label}</span>
			<span class="xp display ml-auto shrink-0 {size === 'lg' ? 'text-2xl' : 'text-base'}">+{f.xp}</span>
		</li>
	{:else}
		<li class="label py-3">Awaiting activity…</li>
	{/each}
</ul>

<style>
	.item {
		background: rgb(255 255 255 / 0.03);
	}
	.item.big {
		background: linear-gradient(100deg, color-mix(in oklab, var(--a) 16%, transparent), color-mix(in oklab, var(--b) 6%, transparent));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--a) 25%, transparent);
	}
	.xp {
		background: linear-gradient(90deg, var(--a), var(--b));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
</style>
