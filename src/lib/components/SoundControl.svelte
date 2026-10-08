<script lang="ts">
	import { fly } from 'svelte/transition';
	import { sound } from '#lib/client/sound.svelte.ts';

	let open = $state(false);
</script>

<div class="fixed right-3 bottom-3 z-[90] flex flex-col items-end gap-2 sm:right-5 sm:bottom-5">
	{#if open}
		<div transition:fly={{ y: 10, duration: 350 }} class="pop w-60 rounded-2xl p-4">
			<div class="label mb-2 flex justify-between"><span>Volume</span><span class="text-ink">{Math.round(sound.volume * 100)}</span></div>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={sound.volume}
				oninput={(e) => sound.setVolume(Number(e.currentTarget.value))}
				class="w-full accent-[var(--phos)]"
				aria-label="Volume"
			/>
			<label class="label mt-4 flex cursor-pointer items-center justify-between">
				<span>Ambient pad</span>
				<input type="checkbox" checked={sound.ambient} onchange={(e) => sound.setAmbient(e.currentTarget.checked)} class="accent-[var(--phos)]" />
			</label>
		</div>
	{/if}
	<div class="pill flex items-center rounded-full">
		<button
			class="flex items-center gap-2 py-2 pr-2 pl-3.5 text-xs font-medium text-mute transition-colors hover:text-ink"
			onclick={() => sound.setEnabled(!sound.enabled)}
			aria-label={sound.enabled ? 'Turn sound off' : 'Turn sound on'}
		>
			<span class="bars" class:on={sound.enabled} aria-hidden="true"><i></i><i></i><i></i></span>
			<span class="hidden sm:inline">{sound.enabled ? 'Sound on' : 'Sound off'}</span>
		</button>
		<button class="px-3 py-2 text-mute transition-colors hover:text-ink" onclick={() => (open = !open)} aria-label="Sound settings" aria-expanded={open}>
			{open ? '×' : '⋯'}
		</button>
	</div>
</div>

<style>
	.pill,
	.pop {
		background: rgb(14 17 34 / 0.7);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.08),
			0 12px 30px -12px rgb(0 0 0 / 0.7);
		backdrop-filter: blur(14px);
	}
	.bars {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
		height: 12px;
	}
	.bars i {
		width: 2px;
		height: 3px;
		border-radius: 2px;
		background: currentColor;
	}
	.bars.on i {
		background: var(--phos);
		animation: eq 1.1s ease-in-out infinite;
	}
	.bars.on i:nth-child(2) {
		animation-delay: -0.4s;
	}
	.bars.on i:nth-child(3) {
		animation-delay: -0.7s;
	}
	@keyframes eq {
		0%,
		100% {
			height: 3px;
		}
		50% {
			height: 12px;
		}
	}
</style>
