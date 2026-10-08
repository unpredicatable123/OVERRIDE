import type { Handle } from '@sveltejs/kit/hooks';
import { readAdmin, readTeam } from '#lib/server/session.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.teamId = readTeam(event.cookies);
	event.locals.admin = readAdmin(event.cookies);
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
