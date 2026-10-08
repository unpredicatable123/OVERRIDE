<script lang="ts">
	/** Cinematic phase transition: the scene dims, a title resolves out of blur, then everything lifts. */
	let { title, sub, tone = 'phos', ondone }: { title: string; sub?: string; tone?: 'phos' | 'bad'; ondone?: () => void } = $props();

	$effect(() => {
		const t = setTimeout(() => ondone?.(), 2300);
		return () => clearTimeout(t);
	});
</script>

<div class="curtain fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 px-6" data-tone={tone} role="presentation">
	<div class="beam" aria-hidden="true"></div>
	<p class="label relative tracking-[0.5em]! text-phos-hi! anim-rise">{sub ?? ''}</p>
	<p class="title display relative text-center text-6xl sm:text-8xl">{title}</p>
	<div class="line relative" aria-hidden="true"></div>
</div>

<style>
	.curtain {
		background: radial-gradient(ellipse at center, color-mix(in oklab, var(--void) 70%, transparent), var(--void) 75%);
		backdrop-filter: blur(16px);
		animation: veil 2300ms var(--ease) both;
	}
	.title {
		background: linear-gradient(100deg, var(--ink), var(--phos-hi), var(--phos-2), var(--ink));
		background-size: 220% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		animation:
			reveal 1100ms var(--ease) 150ms both,
			sheen 4s linear infinite;
	}
	.line {
		height: 1px;
		width: min(520px, 70vw);
		background: linear-gradient(90deg, transparent, var(--phos), var(--phos-2), transparent);
		transform-origin: center;
		animation: grow 1200ms var(--ease) 250ms both;
	}
	.beam {
		position: absolute;
		width: 70vmax;
		height: 70vmax;
		border-radius: 50%;
		background: radial-gradient(circle, color-mix(in oklab, var(--phos) 28%, transparent), transparent 60%);
		animation: bloom 2300ms var(--ease) both;
	}
	@keyframes veil {
		0% {
			opacity: 0;
		}
		15%,
		78% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}
	@keyframes bloom {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
		50% {
			opacity: 1;
		}
		to {
			transform: scale(1.2);
			opacity: 0.6;
		}
	}
</style>
