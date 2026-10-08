<script lang="ts">
	import { goto } from '$app/navigation';
	import Btn from '#lib/components/Btn.svelte';
	import Galaxy from '#lib/components/Galaxy.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { scene } from '#lib/client/scene.svelte.ts';
	import { setAccent } from '#lib/client/colors.ts';
	import { sound } from '#lib/client/sound.svelte.ts';

	let { data } = $props();

	// A quiet boot line that resolves step by step — the story, told in one breath.
	const STATUS = ['Initializing core', 'Network connected', 'Security check failed', 'Access level unknown'];
	let step = $state(0);
	let ready = $state(false);

	$effect(() => {
		setAccent('lobby');
		// The starfield replaces the 3D field on the entry page.
		scene.set('calm', 0);
		const timers = STATUS.map((_, i) => setTimeout(() => (step = i + 1), 500 + i * 650));
		timers.push(setTimeout(() => (ready = true), 900));
		return () => timers.forEach(clearTimeout);
	});

	function enter() {
		sound.unlock();
		sound.play('boot');
		scene.pulse(1);
		goto(data.hasTeam ? '/play' : '/login');
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Enter' && enter()} />

<!-- Starfield background (React Bits Galaxy, ported to Svelte) -->
<div class="fixed inset-0 -z-[1] bg-void" aria-hidden="true">
	<Galaxy
		density={1.1}
		glowIntensity={0.35}
		saturation={0}
		hueShift={140}
		twinkleIntensity={0.4}
		rotationSpeed={0.04}
		starSpeed={0.3}
		repulsionStrength={1.5}
	/>
	<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_50%,rgb(8_8_10/0.75),transparent_75%)]"></div>
	<div class="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-void to-transparent"></div>
</div>

<main class="relative flex min-h-dvh flex-col items-center justify-center px-6 py-20 text-center">
	<p class="label anim-rise mb-8 tracking-[0.4em]!" style="animation-delay: 100ms">Technical game arena</p>

	<Logo size="lg" />

	<div class="mt-10 max-w-xl space-y-2">
		<p class="anim-reveal text-lg text-ink/90 sm:text-xl" style="animation-delay: 700ms">The system has been locked.</p>
		<p class="anim-reveal text-lg text-mute sm:text-xl" style="animation-delay: 1300ms">Only those who can think beyond it can override it.</p>
	</div>

	{#if ready}
		<div class="anim-rise mt-12 flex flex-wrap items-center justify-center gap-3" style="animation-delay: 1500ms">
			<Btn size="lg" onclick={enter}>Enter the arena</Btn>
			<Btn size="lg" variant="ghost" onclick={() => goto('/demo')}>Try the demo</Btn>
		</div>
	{/if}

	<!-- One-line boot status -->
	<div class="mt-14 flex h-5 items-center gap-2.5 font-mono text-xs text-mute" aria-live="polite">
		<span class="dot" class:warn={step >= 3}></span>
		{#key step}
			<span class="anim-rise">{step === 0 ? 'Standing by' : STATUS[step - 1]}{step < STATUS.length ? '…' : ''}</span>
		{/key}
	</div>

	<nav class="absolute bottom-6 flex gap-6 text-xs text-mute">
		<a href="/arena" class="transition-colors hover:text-ink">Arena display</a>
		<span class="text-faint">·</span>
		<a href="/admin" class="transition-colors hover:text-ink">Admin</a>
	</nav>
</main>

<style>
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ok);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--ok) 18%, transparent);
		transition: background-color 600ms var(--ease);
	}
	.dot.warn {
		background: var(--yellow);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--yellow) 18%, transparent);
		animation: breathe 2s ease-in-out infinite;
	}
</style>
