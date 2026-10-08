<!--
	Base backdrop under the 3D scene: deep space gradient + two slow light fields in the accent
	pair. Works on its own when WebGL is unavailable.
-->
<div class="backdrop" aria-hidden="true">
	<div class="glow a"></div>
	<div class="glow b"></div>
	<div class="vignette"></div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
		background: radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--raise) 70%, var(--void)), var(--void) 70%);
		contain: strict;
	}
	.glow {
		position: absolute;
		width: 80vmax;
		height: 80vmax;
		border-radius: 50%;
		opacity: 0.07;
		will-change: transform;
	}
	.a {
		top: -45vmax;
		left: -25vmax;
		background: radial-gradient(circle, var(--phos), transparent 60%);
		animation: drift-a 30s ease-in-out infinite alternate;
	}
	.b {
		bottom: -50vmax;
		right: -30vmax;
		background: radial-gradient(circle, var(--phos-2), transparent 60%);
		animation: drift-b 36s ease-in-out infinite alternate;
	}
	.vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55));
	}
	@keyframes drift-a {
		to {
			transform: translate3d(14vmax, 10vmax, 0) scale(1.1);
		}
	}
	@keyframes drift-b {
		to {
			transform: translate3d(-16vmax, -12vmax, 0) scale(0.92);
		}
	}
</style>
