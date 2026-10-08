<script lang="ts">
	let { size = 'lg', spaced = false, class: cls = '' }: { size?: 'sm' | 'md' | 'lg' | 'xl'; spaced?: boolean; class?: string } = $props();
	const letters = 'OVERRIDE'.split('');
</script>

<!-- Wordmark: a faceted emblem + letter-staggered gradient type. -->
<span class="logo {cls}" class:spaced data-size={size} aria-label="OVERRIDE">
	<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
		<defs>
			<linearGradient id="lg-mark" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="var(--phos)" />
				<stop offset="1" stop-color="var(--phos-2)" />
			</linearGradient>
		</defs>
		<path d="M20 2 36 11v18L20 38 4 29V11Z" fill="none" stroke="url(#lg-mark)" stroke-width="2.4" />
		<path d="M20 11 28 15.5v9L20 29l-8-4.5v-9Z" fill="url(#lg-mark)" />
	</svg>
	<span class="word" aria-hidden="true">
		{#each letters as l, i (i)}<span class="ch" style:--i={i}>{l}</span>{/each}
	</span>
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.32em;
		font-family: var(--font-display);
		font-weight: 600;
		letter-spacing: 0.1em;
		white-space: nowrap;
		line-height: 1;
	}
	.mark {
		width: 0.95em;
		height: 0.95em;
		animation: spin-in 1.4s var(--ease) both;
	}
	.word {
		color: var(--ink);
	}
	.ch {
		display: inline-block;
		animation: letter 1s var(--ease) both;
		animation-delay: calc(var(--i) * 55ms);
	}
	.spaced {
		letter-spacing: 0.4em;
	}
	.logo[data-size='sm'] {
		font-size: 1.15rem;
	}
	.logo[data-size='md'] {
		font-size: clamp(1.9rem, 7vw, 2.7rem);
	}
	.logo[data-size='lg'] {
		font-size: clamp(3rem, 12vw, 6.6rem);
	}
	.logo[data-size='xl'] {
		font-size: clamp(4rem, 11vw, 10rem);
	}
	@keyframes letter {
		from {
			opacity: 0;
			transform: translate3d(0, 0.35em, 0) rotateX(60deg);
			filter: blur(8px);
		}
		to {
			opacity: 1;
			transform: none;
			filter: blur(0);
		}
	}
	@keyframes spin-in {
		from {
			opacity: 0;
			transform: rotate(-90deg) scale(0.6);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
