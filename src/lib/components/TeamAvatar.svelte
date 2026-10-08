<script lang="ts">
	import { teamHue } from '#lib/client/colors.ts';

	/** Gradient orb with a monogram — stable per team id, coloured by the team's hue. */
	let { id, name = '', size = 32, class: cls = '' }: { id: string; name?: string; size?: number; class?: string } = $props();

	const hue = $derived(teamHue(id));
	const mono = $derived(
		(name || id.replace(/^OV-0*/, ''))
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join('')
			.toUpperCase()
	);
</script>

<span
	class="avatar shrink-0 {cls}"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.max(9, size * 0.36)}px"
	style:--h={hue}
	aria-hidden="true">{mono}</span
>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 28%;
		font-family: var(--font-mono);
		font-weight: 500;
		letter-spacing: 0;
		color: hsl(var(--h) 18% 86%);
		background: linear-gradient(160deg, hsl(var(--h) 10% 24%), hsl(var(--h) 8% 13%));
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.1),
			inset 0 0 0 1px rgb(255 255 255 / 0.06);
	}
</style>
