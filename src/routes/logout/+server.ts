import { redirect } from '@sveltejs/kit';
import { clearSessions } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	clearSessions(cookies);
	redirect(303, '/');
};
