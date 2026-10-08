<script lang="ts">
	import Counter from '#lib/components/Counter.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import { formatClock } from '#lib/client/clock.svelte.ts';
	import type { TeamStateView } from '#lib/engine/views.ts';

	let {
		view,
		remainingMs,
		durationMs,
		paused,
		online,
		badge
	}: { view: TeamStateView; remainingMs: number | null; durationMs: number | null; paused: boolean; online: boolean; badge?: string } = $props();

	const p = $derived(view.protocol);
	const hot = $derived(remainingMs !== null && remainingMs <= 60_000 && !paused);
	const ratio = $derived(remainingMs !== null && durationMs ? remainingMs / durationMs : 0);
</script>

<!-- Floating glass HUD: identity · protocol · clock · XP · rank. -->
<header class="sticky top-0 z-50 px-2 pt-2 sm:px-4 sm:pt-3">
	<div class="hud mx-auto max-w-7xl overflow-hidden rounded-2xl">
		<div class="flex items-center gap-3 px-3 py-2.5 sm:gap-6 sm:px-5">
			<a href="/" class="hidden md:block" aria-label="Home"><Logo size="sm" /></a>
			<span class="hidden h-8 w-px bg-white/10 md:block"></span>

			<TeamAvatar id={view.team.id} name={view.team.name} size={36} class="hidden sm:inline-flex" />
			<div class="min-w-0 flex-1">
				<div class="label flex items-center gap-2 truncate">
					<span class="h-1.5 w-1.5 rounded-full {online ? 'bg-ok' : 'bg-bad anim-pulse'}" title={online ? 'Live' : 'Reconnecting'}></span>
					{#if badge}<span class="chip py-0! text-[0.55rem]!">{badge}</span>{/if}
					{#if view.mode === 'final'}Arena{:else if p}Protocol {p.code}{:else}Lobby{/if}
				</div>
				<div class="grad truncate font-display text-sm font-semibold sm:text-base">
					{view.mode === 'final' ? 'Final results' : p ? `${p.name} · ${p.title}` : view.team.name}
				</div>
			</div>

			<div class="text-center">
				<div class="label">{paused ? 'Paused' : 'Time'}</div>
				<div class="display text-[1.7rem] sm:text-[2.1rem] {hot ? 'text-bad anim-pulse' : paused ? 'text-mute' : 'text-ink'}">
					{formatClock(remainingMs)}
				</div>
			</div>

			<div class="text-right">
				<div class="label">{view.xpLabel}</div>
				<div class="display grad text-[1.7rem] sm:text-[2.1rem]"><Counter value={view.xp} /></div>
			</div>

			<div class="hidden text-right sm:block">
				<div class="label">Rank</div>
				<div class="display text-[1.7rem] text-ink sm:text-[2.1rem]">
					{view.rank && view.xp > 0 ? `#${view.rank}` : '—'}<span class="text-sm text-faint"> /{view.teamsRanked}</span>
				</div>
			</div>
		</div>
		{#if durationMs}
			<div class="h-[3px] bg-white/5">
				<div class="h-full origin-left transition-transform duration-500 ease-linear" style:background="var(--grad)" style:box-shadow="0 0 14px var(--glow)" style:transform="scaleX({ratio})"></div>
			</div>
		{/if}
	</div>
</header>

<style>
	.hud {
		background: rgb(10 12 23 / 0.66);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.08),
			0 18px 50px -24px rgb(0 0 0 / 0.9);
		backdrop-filter: blur(20px) saturate(150%);
		-webkit-backdrop-filter: blur(20px) saturate(150%);
	}
</style>
