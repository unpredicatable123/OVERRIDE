import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import type { ArenaSnapshot } from '#lib/engine/views.ts';
import { clock } from './clock.svelte.ts';

/**
 * Live arena feed. Every screen renders from one snapshot object that the server
 * publishes after state changes. Transport: Supabase Realtime when configured,
 * otherwise server-sent events from this app.
 */
class Arena {
	snapshot = $state<ArenaSnapshot | null>(null);
	online = $state(false);
	private refs = 0;
	private teardown: (() => void) | null = null;

	get remainingMs(): number | null {
		const st = this.snapshot?.state;
		if (!st) return null;
		if (st.endsAt !== null) return Math.max(0, st.endsAt - clock.now);
		return st.remainingMs;
	}

	apply = (s: ArenaSnapshot) => {
		const cur = this.snapshot;
		// Ignore out-of-order deliveries (the initial fetch can race the realtime stream).
		if (cur && s.serverNow < cur.serverNow) return;
		clock.sync(s.serverNow);
		this.snapshot = s;
	};

	async refresh() {
		try {
			const res = await fetch('/api/snapshot', { cache: 'no-store' });
			if (res.ok) this.apply(await res.json());
		} catch {
			/* offline; the stream will catch up */
		}
	}

	/** Ref-counted: the first caller opens the connection, the last one closes it. */
	connect(): () => void {
		if (++this.refs === 1) this.teardown = this.open();
		return () => {
			if (--this.refs === 0) {
				this.teardown?.();
				this.teardown = null;
			}
		};
	}

	private open(): () => void {
		let disposed = false;
		let closeTransport = () => {};
		const onVisible = () => document.visibilityState === 'visible' && this.refresh();
		document.addEventListener('visibilitychange', onVisible);

		const useSse = () => {
			const es = new EventSource('/api/stream');
			es.onopen = () => (this.online = true);
			es.onerror = () => (this.online = false);
			es.onmessage = (e) => {
				try {
					this.apply(JSON.parse(e.data));
				} catch {
					/* ignore malformed frame */
				}
			};
			closeTransport = () => es.close();
		};

		if (PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY) {
			void this.refresh();
			// Loaded lazily so non-Supabase deployments never download the client.
			import('@supabase/supabase-js').then(({ createClient }) => {
				if (disposed) return;
				const sb = createClient(PUBLIC_SUPABASE_URL!, PUBLIC_SUPABASE_ANON_KEY!, {
					auth: { persistSession: false }
				});
				const channel = sb
					.channel('arena-snapshot')
					.on('postgres_changes', { event: '*', schema: 'public', table: 'arena_snapshot' }, (payload) => {
						const data = (payload.new as { data?: ArenaSnapshot })?.data;
						if (data) this.apply(data);
					})
					.subscribe((status) => {
						this.online = status === 'SUBSCRIBED';
						if (status === 'SUBSCRIBED') void this.refresh();
					});
				closeTransport = () => void sb.removeChannel(channel);
			});
		} else {
			useSse();
		}

		return () => {
			disposed = true;
			closeTransport();
			document.removeEventListener('visibilitychange', onVisible);
			this.online = false;
		};
	}
}

export const arena = new Arena();
