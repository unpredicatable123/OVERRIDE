<script lang="ts">
	import { fmt } from '#lib/client/clock.svelte.ts';

	let { value, duration = 700, class: cls = '' }: { value: number; duration?: number; class?: string } = $props();

	let shown = $state(0);
	let first = true;

	$effect(() => {
		const target = value;
		if (first) {
			first = false;
			shown = target;
			return;
		}
		const from = shown;
		if (from === target) return;
		const start = performance.now();
		let raf = 0;
		const frame = (t: number) => {
			const p = Math.min(1, (t - start) / duration);
			const eased = 1 - Math.pow(1 - p, 3);
			shown = Math.round(from + (target - from) * eased);
			if (p < 1) raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<span class="tabular-nums {cls}">{fmt(shown)}</span>
