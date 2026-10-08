<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { sound } from '#lib/client/sound.svelte.ts';

	let {
		variant = 'primary',
		size = 'md',
		block = false,
		busy = false,
		class: cls = '',
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: 'primary' | 'ghost' | 'danger' | 'ok';
		size?: 'sm' | 'md' | 'lg';
		block?: boolean;
		busy?: boolean;
		children: Snippet;
	} = $props();
</script>

<button
	{...rest}
	class="btn {cls}"
	class:w-full={block}
	data-variant={variant}
	data-size={size}
	data-busy={busy || undefined}
	disabled={rest.disabled || busy}
	onpointerdown={() => sound.play('click')}
>
	<span class="inner">{@render children()}</span>
	{#if variant === 'primary' || variant === 'ok'}<span class="arrow" aria-hidden="true">→</span>{/if}
</button>

<style>
	.btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.55em;
		border-radius: 999px;
		font-weight: 500;
		letter-spacing: 0.01em;
		color: #0a0a0c;
		background: #ededef;
		padding: 0.72rem 1.3rem;
		font-size: 0.875rem;
		user-select: none;
		touch-action: manipulation;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.8),
			0 1px 2px rgb(0 0 0 / 0.4);
		transition:
			background-color 250ms var(--ease),
			transform 250ms var(--ease),
			box-shadow 250ms var(--ease),
			opacity 200ms;
	}
	.btn:hover:not(:disabled) {
		background: #ffffff;
		box-shadow:
			inset 0 1px 0 #fff,
			0 8px 24px -10px rgb(255 255 255 / 0.25);
	}
	.btn:active:not(:disabled) {
		transform: scale(0.98);
		transition-duration: 80ms;
	}
	.btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.arrow {
		opacity: 0.6;
		transition: transform 300ms var(--ease);
	}
	.btn:hover:not(:disabled) .arrow {
		transform: translate3d(2px, 0, 0);
	}
	.btn[data-size='sm'] {
		padding: 0.4rem 0.8rem;
		font-size: 0.75rem;
	}
	.btn[data-size='lg'] {
		padding: 0.95rem 1.8rem;
		font-size: 0.95rem;
	}
	.btn[data-variant='ghost'],
	.btn[data-variant='danger'] {
		color: var(--ink);
		background: rgb(255 255 255 / 0.04);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
	}
	.btn[data-variant='ghost']:hover:not(:disabled) {
		background: rgb(255 255 255 / 0.08);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
	}
	.btn[data-variant='danger'] {
		color: var(--bad);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 30%, transparent);
	}
	.btn[data-variant='danger']:hover:not(:disabled) {
		background: color-mix(in oklab, var(--bad) 10%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 45%, transparent);
	}
	.btn[data-variant='ok'] {
		background: var(--ok);
	}
	.btn[data-busy] .inner {
		animation: breathe 1s ease-in-out infinite;
	}
</style>
