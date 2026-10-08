<script lang="ts">
	let {
		value,
		segments: _segments = 24,
		tone = 'phos',
		class: cls = ''
	}: { value: number; segments?: number; tone?: 'phos' | 'ok' | 'bad'; class?: string } = $props();

	const v = $derived(Math.min(1, Math.max(0, value)));
</script>

<!-- Smooth progress rail with a glowing gradient fill and a bright leading edge. -->
<div class="rail {cls}" data-tone={tone} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
	<div class="fill" style:transform="scaleX({v})"></div>
</div>

<style>
	.rail {
		--a: var(--phos);
		--b: var(--phos-2);
		position: relative;
		height: 6px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.07);
		overflow: hidden;
	}
	.rail[data-tone='ok'] {
		--a: var(--ok);
		--b: var(--cyan);
	}
	.rail[data-tone='bad'] {
		--a: var(--bad);
		--b: var(--violet);
	}
	.fill {
		position: absolute;
		inset: 0;
		transform-origin: left;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--a), var(--b));
		box-shadow: 0 0 16px var(--a);
		transition: transform 450ms var(--ease);
	}
</style>
