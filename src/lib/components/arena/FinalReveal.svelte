<script lang="ts">
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { MEDALS } from '#lib/client/colors.ts';
	import { fmt } from '#lib/client/clock.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';
	import type { FinalResult } from '#lib/engine/leaderboard.ts';
	import type { ProtocolMeta } from '#lib/engine/views.ts';

	let { results, protocols, ondone }: { results: FinalResult[]; protocols: ProtocolMeta[]; ondone?: () => void } = $props();

	type Stage = 'calc' | 'ready' | 'p3' | 'p2' | 'drum' | 'p1' | 'done';
	let stage = $state<Stage>('calc');
	let lines = $state<string[]>([]);
	let bars = $state({ round: 0, boss: 0 });
	let shownXp = $state(0);
	let root = $state<HTMLElement | null>(null);

	const podium = $derived(results.slice(0, 3));
	const card = $derived(stage === 'p3' ? podium[2] : stage === 'p2' ? podium[1] : stage === 'p1' || stage === 'done' ? podium[0] : null);

	$effect(() => {
		let cancelled = false;
		let tl: { kill: () => void } | null = null;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));

		(async () => {
			const { gsap } = await import('gsap');
			if (cancelled) return;
			const counter = { v: 0 };

			const rollTo = (xp: number, seconds: number) => {
				counter.v = 0;
				tl = gsap.to(counter, { v: xp, duration: seconds, ease: 'power3.out', onUpdate: () => (shownXp = Math.round(counter.v)) });
			};
			const enter = (selector: string, opts: object) => {
				if (root) gsap.fromTo(root.querySelectorAll(selector), opts, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.9, ease: 'expo.out' });
			};

			// 1 — CALCULATING
			sound.play('reveal');
			lines = ['CALCULATING...'];
			await wait(900);
			lines = [...lines, 'ROUND XP'];
			tl = gsap.to(bars, { round: 1, duration: 1.4, ease: 'power2.inOut' });
			await wait(1500);
			lines = [...lines, 'BOSS XP'];
			tl = gsap.to(bars, { boss: 1, duration: 1.4, ease: 'power2.inOut' });
			await wait(1500);
			for (const l of ['AGGREGATING...', 'RANKING TEAMS...', 'VERIFYING...']) {
				if (cancelled) return;
				lines = [...lines, l];
				sound.play('glitch');
				await wait(750);
			}
			stage = 'ready';
			sound.play('unlock');
			await wait(1800);

			// 2 — #3 and #2
			for (const s of ['p3', 'p2'] as const) {
				if (cancelled) return;
				const r = s === 'p3' ? podium[2] : podium[1];
				if (!r) continue;
				stage = s;
				sound.play('drum');
				await wait(30);
				enter('.reveal-card', { opacity: 0, y: 40, scale: 0.92, filter: 'blur(12px)' });
				rollTo(r.total, 1.6);
				await wait(1700);
				sound.play('xp');
				await wait(s === 'p3' ? 2600 : 3200);
			}

			// 3 — drumroll, then the champion
			if (cancelled) return;
			stage = 'drum';
			for (let i = 0; i < 14; i++) {
				timers.push(setTimeout(() => sound.play('drum'), i * (220 - i * 10)));
			}
			await wait(3000);
			if (cancelled || !podium[0]) return;
			stage = 'p1';
			sound.play('winner');
			await wait(30);
			enter('.reveal-card', { opacity: 0, y: 0, scale: 1.4, filter: 'blur(24px)' });
			rollTo(podium[0].total, 2.2);
			await wait(7000);
			if (cancelled) return;
			stage = 'done';
			ondone?.();
		})();

		return () => {
			cancelled = true;
			timers.forEach(clearTimeout);
			tl?.kill();
		};
	});
</script>

<div bind:this={root} class="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-void px-6">
	{#if stage === 'calc'}
		<div class="w-full max-w-3xl space-y-4 text-2xl xl:text-3xl">
			{#each lines as l, i (i)}
				<div class="anim-rise">
					<p class={l.endsWith('XP') ? 'label text-xl!' : 'display iris text-6xl'}>{l}</p>
					{#if l === 'ROUND XP'}<div class="mt-2 h-5 bg-line"><div class="h-full origin-left" style:background="linear-gradient(90deg, var(--cyan), var(--lime), var(--yellow))" style:box-shadow="0 0 24px var(--cyan)" style:transform="scaleX({bars.round})"></div></div>{/if}
					{#if l === 'BOSS XP'}<div class="mt-2 h-5 bg-line"><div class="h-full origin-left" style:background="linear-gradient(90deg, var(--red), var(--magenta), var(--violet))" style:box-shadow="0 0 24px var(--magenta)" style:transform="scaleX({bars.boss})"></div></div>{/if}
				</div>
			{/each}
		</div>
	{:else if stage === 'ready'}
		<p class="display anim-reveal iris text-center text-7xl xl:text-9xl">FINAL RESULTS READY</p>
	{:else if stage === 'drum'}
		<div class="text-center">
			<p class="label mb-6 text-2xl! tracking-[0.6em]!">AND THE TEAM THAT OVERRODE THE SYSTEM IS</p>
			<p class="display iris text-9xl anim-pulse">. . .</p>
		</div>
	{:else if card}
		{@const champion = stage === 'p1' || stage === 'done'}
		<div class="reveal-card flex flex-col items-center text-center opacity-0">
			<p class="display {champion ? 'text-[12rem] xl:text-[16rem]' : 'text-[9rem] xl:text-[12rem]'} leading-none" style:background="linear-gradient(180deg, {MEDALS[card.rank]?.[0] ?? 'var(--phos)'}, {MEDALS[card.rank]?.[1] ?? 'var(--phos-2)'})" style:-webkit-background-clip="text" style:background-clip="text" style:color="transparent" style:filter="drop-shadow(0 10px 40px rgb(0 0 0 / 0.6))">#{String(card.rank).padStart(2, '0')}</p>
			<div class="mt-2 flex items-center gap-6"><TeamAvatar id={card.teamId} name={card.name} size={champion ? 88 : 64} /><p class="display tracking-[0.04em] {champion ? 'iris text-6xl xl:text-8xl' : 'text-ink text-5xl xl:text-7xl'}">{card.name}</p></div>
			<p class="mt-3 text-xl tracking-[0.3em] text-mute">{card.players.join(' · ')}</p>
			<p class="display grad mt-6 text-7xl xl:text-8xl">{fmt(shownXp)} XP</p>
			{#if champion}
				<p class="anim-scan iris mt-8 text-3xl font-black tracking-[0.4em] xl:text-4xl">OVERRIDE CHAMPIONS</p>
				<div class="mt-8 flex gap-6 text-sm text-mute">
					{#each protocols as p (p.id)}
						<div class="text-center"><div class="label">{p.name}</div><div class="display text-3xl text-ink">{fmt(card.rounds[p.id])}</div></div>
					{/each}
				</div>
			{/if}
		</div>
		{#if champion}
			<div class="burst pointer-events-none absolute inset-0" aria-hidden="true">
				{#each { length: 28 } as _, i (i)}
					<i style:--a="{(i / 28) * 360}deg" style:--d="{(i % 4) * 90}ms"></i>
				{/each}
			</div>
			<div class="absolute bottom-10"><Logo size="md" spaced /></div>
		{/if}
	{/if}
</div>

<style>
	.burst i {
		position: absolute;
		left: 50%;
		top: 42%;
		width: 10px;
		height: 10px;
		background: var(--c, var(--phos));
		box-shadow: 0 0 14px var(--c, var(--glow));
		animation: shoot 1600ms cubic-bezier(0.1, 0.7, 0.3, 1) var(--d) both;
	}
	.burst i:nth-child(6n + 1) { --c: var(--cyan); }
	.burst i:nth-child(6n + 2) { --c: var(--magenta); }
	.burst i:nth-child(6n + 3) { --c: var(--yellow); }
	.burst i:nth-child(6n + 4) { --c: var(--lime); }
	.burst i:nth-child(6n + 5) { --c: var(--orange); }
	.burst i:nth-child(6n) { --c: var(--violet); }
	@keyframes shoot {
		from {
			transform: rotate(var(--a)) translate3d(0, 0, 0) scale(1);
			opacity: 1;
		}
		to {
			transform: rotate(var(--a)) translate3d(46vmin, 0, 0) scale(0.3);
			opacity: 0;
		}
	}
</style>
