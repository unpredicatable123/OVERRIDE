<script lang="ts">
	import '../app.css';
	import Aurora from '#lib/components/Aurora.svelte';
	import Scene3D from '#lib/components/Scene3D.svelte';
	import SoundControl from '#lib/components/SoundControl.svelte';
	import { sound } from '#lib/client/sound.svelte.ts';

	let { children } = $props();

	$effect(() => {
		sound.init();
		// Browsers only allow audio after a gesture: the first tap or key anywhere unlocks it.
		const unlock = () => sound.unlock();
		window.addEventListener('pointerdown', unlock, { once: true });
		window.addEventListener('keydown', unlock, { once: true });
		return () => {
			window.removeEventListener('pointerdown', unlock);
			window.removeEventListener('keydown', unlock);
		};
	});
</script>

<Aurora />
<Scene3D />
{@render children()}
<SoundControl />
