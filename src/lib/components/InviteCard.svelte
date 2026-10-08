<script lang="ts">
	import { encode } from 'uqr';
	import { sound } from '#lib/client/sound.svelte.ts';

	let { code, teamName, compact = false }: { code: string; teamName: string; compact?: boolean } = $props();

	let origin = $state('');
	$effect(() => {
		origin = location.origin;
	});
	const link = $derived(origin ? `${origin}/join/${code}` : '');
	const qr = $derived(link ? encode(link, { ecc: 'M', border: 0 }) : null);
	let copied = $state(false);
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			sound.play('accept');
			setTimeout(() => (copied = false), 1800);
		} catch {
			/* clipboard blocked: the link is still selectable */
		}
	}

	async function share() {
		try {
			await navigator.share({ title: 'OVERRIDE', text: `Join ${teamName} in the OVERRIDE arena`, url: link });
		} catch {
			/* user cancelled */
		}
	}
</script>

<div class="invite flex flex-col items-center gap-4 {compact ? 'sm:flex-row sm:items-center' : ''}">
	{#if qr}
		<!-- High-contrast modules on a light tile so every phone camera reads it; colour lives in the gradient. -->
		<div class="tile shrink-0 p-3">
			<svg viewBox="0 0 {qr.size} {qr.size}" class="block {compact ? 'h-36 w-36' : 'h-52 w-52 sm:h-60 sm:w-60'}" shape-rendering="crispEdges" role="img" aria-label="QR code invite for {teamName}">
				<defs>
					<linearGradient id="qr-{code}" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stop-color="#16161a" />
						<stop offset="0.5" stop-color="#202026" />
						<stop offset="1" stop-color="#2e2e36" />
					</linearGradient>
				</defs>
				<path
					fill="url(#qr-{code})"
					d={qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('')}
				/>
			</svg>
		</div>
	{/if}
	<div class="flex w-full min-w-0 flex-col gap-2.5">
		<p class="label text-center {compact ? 'sm:text-left' : ''}">Scan or share with your teammate</p>
		<button class="field truncate text-left font-mono text-xs text-mute!" onclick={copy} title="Copy invite link">{link || '…'}</button>
		<div class="flex gap-2">
			<button class="act flex-1" onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
			{#if canShare}<button class="act flex-1" onclick={share}>Share</button>{/if}
		</div>
	</div>
</div>

<style>
	.tile {
		border-radius: 18px;
		background: #f2f2f4;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.1),
			0 30px 60px -30px rgb(0 0 0 / 0.9);
	}
	.act {
		padding: 0.6rem 0.8rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--ink);
		background: rgb(255 255 255 / 0.05);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
		transition: background-color 250ms var(--ease);
	}
	.act:hover {
		background: rgb(255 255 255 / 0.1);
	}
</style>
