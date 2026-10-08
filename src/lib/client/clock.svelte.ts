/**
 * One shared, server-corrected clock for every countdown on screen.
 * A single interval drives all timers instead of one per component.
 */

let offset = 0;
const state = $state({ now: Date.now() });
let timer: ReturnType<typeof setInterval> | null = null;
let users = 0;

export const clock = {
	get now() {
		return state.now;
	},
	/** Feed in a server timestamp; we keep the smallest observed skew to avoid latency drift. */
	sync(serverNow: number) {
		const measured = serverNow - Date.now();
		offset = Math.abs(measured - offset) > 1500 ? measured : Math.round(offset * 0.7 + measured * 0.3);
		state.now = Date.now() + offset;
	},
	serverNow() {
		return Date.now() + offset;
	},
	/** Ref-counted ticker; call inside $effect and return the disposer. */
	use(intervalMs = 200): () => void {
		users++;
		if (!timer) timer = setInterval(() => (state.now = Date.now() + offset), intervalMs);
		return () => {
			users--;
			if (users <= 0 && timer) {
				clearInterval(timer);
				timer = null;
				users = 0;
			}
		};
	}
};

export function formatClock(ms: number | null): string {
	if (ms === null) return '--:--';
	const total = Math.max(0, Math.ceil(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const fmt = (n: number) => n.toLocaleString('en-US');
