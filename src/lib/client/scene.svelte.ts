/**
 * Shared control surface for the background 3D scene. Pages set the mood; gameplay moments
 * (a correct answer, a boss activation) send pulses that briefly energise the field.
 */
import { untrack } from 'svelte';

export type SceneMood = 'calm' | 'live' | 'storm' | 'celebrate';

class SceneControl {
	mood = $state<SceneMood>('calm');
	/** 0 = hidden, 1 = full. Gameplay screens dim the scene so it never competes with content. */
	presence = $state(1);
	/** Monotonic counter; the renderer reacts to each increment. */
	pulses = $state(0);
	pulseStrength = 1;

	set(mood: SceneMood, presence = 1) {
		untrack(() => {
			this.mood = mood;
			this.presence = presence;
		});
	}

	/** Safe to call from inside effects: the increment is untracked, so callers don't subscribe to it. */
	pulse(strength = 1) {
		this.pulseStrength = strength;
		untrack(() => this.pulses++);
	}
}

export const scene = new SceneControl();
