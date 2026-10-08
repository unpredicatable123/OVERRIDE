<script lang="ts">
	import { fmt } from '#lib/client/clock.svelte.ts';
	import { scene } from '#lib/client/scene.svelte.ts';
	import type { Verdict } from '#lib/client/team.svelte.ts';

	let { verdict }: { verdict: Verdict | null } = $props();

	let shown = $state<Verdict | null>(null);
	$effect(() => {
		if (!verdict) return;
		shown = verdict;
		// Correct answers surge the 3D field.
		if (verdict.result.outcome === 'accepted') scene.pulse(verdict.result.bonusXp ? 1 : 0.6);
		const t = setTimeout(() => (shown = null), verdict.result.outcome === 'accepted' ? 1900 : 1400);
		return () => clearTimeout(t);
	});
</script>

{#if shown}
	{@const r = shown.result}
	{@const ok = r.outcome === 'accepted'}
	<div class="pointer-events-none fixed inset-x-0 top-24 z-[80] flex justify-center px-4" role="status" aria-live="assertive">
		{#key shown.id}
			<div class="verdict relative overflow-hidden rounded-3xl px-8 py-5 text-center" class:ok>
				<div class="ring" aria-hidden="true"></div>
				<div class="relative flex items-center justify-center gap-2 text-sm font-semibold tracking-[0.2em]">
					<span class="badge">{ok ? '✓' : '✕'}</span>
					<span>{r.message.replace(/[✓✕]/g, '').trim()}</span>
				</div>
				{#if ok}
					<div class="display xp relative mt-2 text-6xl sm:text-7xl">+{fmt(r.xp + r.bonusXp)}<span class="ml-2 text-2xl">XP</span></div>
					<div class="relative mt-3 flex flex-wrap justify-center gap-1.5">
						<span class="chip" style:--c="var(--cyan)">Speed ×{r.speed.toFixed(2)}</span>
						<span class="chip" style:--c="var(--lime)">Accuracy ×{r.accuracy.toFixed(2)}</span>
						{#if r.bonusXp}<span class="chip" style:--c="var(--yellow)">Bingo +{r.bonusXp}</span>{/if}
					</div>
				{:else if r.outcome === 'denied'}
					<div class="relative mt-1.5 text-sm text-mute">{r.triesLeft} {r.triesLeft === 1 ? 'try' : 'tries'} left · the next correct answer is worth less</div>
				{:else}
					<div class="relative mt-1.5 text-sm text-mute">Node closed · 0 XP</div>
				{/if}
			</div>
		{/key}
	</div>
{/if}

<style>
	.verdict {
		--a: var(--bad);
		--b: var(--violet);
		color: var(--ink);
		background: rgb(10 12 23 / 0.78);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--a) 28%, transparent),
			0 30px 80px -30px rgb(0 0 0 / 0.9);
		backdrop-filter: blur(20px);
		animation: pop 600ms var(--ease) both;
	}
	.verdict.ok {
		--a: var(--ok);
		--b: var(--cyan);
	}
	.badge {
		display: inline-flex;
		width: 1.6rem;
		height: 1.6rem;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		color: var(--a);
		background: color-mix(in oklab, var(--a) 16%, transparent);
	}
	.xp {
		background: linear-gradient(180deg, #fff, var(--a));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.ring {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 140%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(circle, color-mix(in oklab, var(--a) 12%, transparent), transparent 60%);
		transform: translate(-50%, -50%) scale(0.2);
		animation: ripple 1200ms var(--ease) both;
	}
	@keyframes ripple {
		to {
			transform: translate(-50%, -50%) scale(1);
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate3d(0, -16px, 0) scale(0.94);
			filter: blur(8px);
		}
		to {
			opacity: 1;
			transform: none;
			filter: blur(0);
		}
	}
</style>
