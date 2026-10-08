<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		meta,
		tone = 'base',
		accent,
		pad = true,
		tilt = false,
		class: cls = '',
		children
	}: {
		label?: string;
		meta?: Snippet;
		tone?: 'base' | 'hot' | 'ok' | 'bad' | 'dim';
		/** Override the accent colour (e.g. a tag colour). */
		accent?: string;
		pad?: boolean;
		/** Subtle 3D tilt toward the pointer (hero cards only). */
		tilt?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	let el = $state<HTMLElement | null>(null);
	function onMove(e: PointerEvent) {
		if (!tilt || !el || e.pointerType !== 'mouse') return;
		const r = el.getBoundingClientRect();
		const x = (e.clientX - r.left) / r.width - 0.5;
		const y = (e.clientY - r.top) / r.height - 0.5;
		el.style.setProperty('--rx', `${-y * 2.5}deg`);
		el.style.setProperty('--ry', `${x * 3.5}deg`);
		el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
		el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
	}
	function onLeave() {
		el?.style.setProperty('--rx', '0deg');
		el?.style.setProperty('--ry', '0deg');
	}
</script>

<!-- Frosted glass panel with a hairline gradient rim. Pointer handlers only drive the decorative tilt. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<section bind:this={el} class="frame {cls}" class:tilt data-tone={tone} style:--a={accent} onpointermove={onMove} onpointerleave={onLeave}>
	{#if label || meta}
		<header class="flex items-center justify-between gap-3 px-5 pt-4 pb-0">
			{#if label}
				<span class="flex items-center gap-2.5 text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
					<i class="dot"></i><span class="title">{label}</span>
				</span>
			{/if}
			{#if meta}<div class="label">{@render meta()}</div>{/if}
		</header>
	{/if}
	<div class={pad ? 'p-4 sm:p-5' : 'pt-2'}>
		{@render children()}
	</div>
</section>

<style>
	.frame {
		--a: var(--phos);
		--b: var(--phos-2);
		position: relative;
		border-radius: 22px;
		background:
			radial-gradient(90% 70% at var(--mx, 50%) var(--my, 0%), rgb(255 255 255 / 0.035), transparent 60%),
			var(--glass);
		border: 1px solid transparent;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.06),
			0 24px 60px -30px rgb(0 0 0 / 0.8);
		backdrop-filter: blur(18px) saturate(140%);
		-webkit-backdrop-filter: blur(18px) saturate(140%);
		transition:
			transform 500ms var(--ease),
			box-shadow 500ms var(--ease),
			border-color 500ms var(--ease);
	}
	/* Hairline gradient rim. */
	.frame::before {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		padding: 1px;
		background: linear-gradient(180deg, rgb(255 255 255 / 0.14), rgb(255 255 255 / 0.02) 40%, rgb(255 255 255 / 0.05));
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		opacity: 0.6;
		transition: opacity 500ms var(--ease);
	}
	.tilt {
		transform: perspective(1200px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
		will-change: transform;
	}
	.tilt:hover::before {
		opacity: 1;
	}
	.frame[data-tone='hot'] {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.08),
			0 40px 100px -40px rgb(0 0 0 / 0.95),
			0 0 0 1px color-mix(in oklab, var(--a) 14%, transparent);
	}
	.frame[data-tone='hot']::before {
		opacity: 1;
	}
	.frame[data-tone='ok'] {
		--a: var(--ok);
		--b: var(--cyan);
	}
	.frame[data-tone='bad'] {
		--a: var(--bad);
		--b: var(--violet);
	}
	.frame[data-tone='dim']::before {
		opacity: 0.2;
	}
	.title {
		color: var(--mute);
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--a);
		opacity: 0.8;
	}
	@media (max-width: 760px) {
		/* Phones: skip live blur over the animated scene to save GPU time. */
		.frame {
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
			background:
				color-mix(in oklab, var(--panel) 94%, transparent);
		}
	}
</style>
