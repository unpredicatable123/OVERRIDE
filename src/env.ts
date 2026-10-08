import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => (v ? v : undefined);

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		schema: optional,
		description: 'Supabase project URL. Leave empty to run with the built-in in-memory store.'
	},
	PUBLIC_SUPABASE_ANON_KEY: {
		public: true,
		schema: optional,
		description: 'Supabase anon key, used by browsers only to subscribe to the public arena snapshot.'
	},
	SUPABASE_SERVICE_ROLE_KEY: {
		schema: optional,
		description: 'Supabase service-role key. Server only — all game writes go through it.'
	},
	ADMIN_KEY: {
		schema: (v) => v || 'override-admin',
		description: 'Passphrase for the admin console.'
	},
	SESSION_SECRET: {
		schema: (v) => v || 'override-dev-secret-change-me',
		description: 'HMAC secret for team/admin session cookies.'
	},
	EVENT_JOIN_CODE: {
		schema: optional,
		description: 'If set, teams can self-register at /login using this code.'
	},
	GEMINI_API_KEY: {
		schema: optional,
		description: 'Google Gemini API key. When set, every team gets its own generated question set. Server only.'
	},
	GEMINI_MODEL: {
		schema: (v) => v || 'gemini-3.8-flash',
		description: 'Gemini model used to generate questions.'
	},
	DATA_FILE: {
		schema: (v) => v || '.data/arena.json',
		description: 'Persistence file for the in-memory store.'
	}
});
