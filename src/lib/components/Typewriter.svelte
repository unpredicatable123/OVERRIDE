<script lang="ts">
	import { sound } from '#lib/client/sound.svelte.ts';

	let {
		text,
		speed = 22,
		delay = 0,
		caret = false,
		audible = false,
		class: cls = '',
		ondone
	}: {
		text: string;
		speed?: number;
		delay?: number;
		caret?: boolean;
		audible?: boolean;
		class?: string;
		ondone?: () => void;
	} = $props();

	let count = $state(0);
	const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		const full = text;
		count = 0;
		if (reduced || speed <= 0) {
			count = full.length;
			ondone?.();
			return;
		}
		let timer: ReturnType<typeof setTimeout>;
		const step = () => {
			// Type a few characters per frame for long strings so it never drags.
			count = Math.min(full.length, count + (full.length > 160 ? 3 : 1));
			if (audible && full[count - 1] !== ' ') sound.play('type');
			if (count < full.length) timer = setTimeout(step, speed);
			else ondone?.();
		};
		timer = setTimeout(step, delay);
		return () => clearTimeout(timer);
	});
</script>

<span class={cls} class:caret={caret && count < text.length}>{text.slice(0, count)}</span>
