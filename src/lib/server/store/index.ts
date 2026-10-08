import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import { DATA_FILE, SUPABASE_SERVICE_ROLE_KEY } from '$app/env/private';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { Store } from './types';

let instance: Store | null = null;

/** Supabase when configured, otherwise the persistent in-memory store. */
export function store(): Store {
	if (instance) return instance;
	if (PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
		instance = new SupabaseStore(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	} else {
		const mem = new MemoryStore(DATA_FILE);
		const flush = () => {
			try {
				mem.flush();
			} catch {
				/* best effort on shutdown */
			}
		};
		process.once('SIGINT', () => (flush(), process.exit(0)));
		process.once('SIGTERM', () => (flush(), process.exit(0)));
		instance = mem;
	}
	return instance;
}

export type { Store, StoredState } from './types';
