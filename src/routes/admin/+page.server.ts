import { fail, redirect } from '@sveltejs/kit';
import { checkAdminKey, clearSessions, recordFailure, setAdminSession, tooManyFailures } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ authed: locals.admin });

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress }) => {
		const ipKey = `admin:${getClientAddress()}`;
		if (tooManyFailures(ipKey, 10)) return fail(429, { message: 'Too many failed attempts' });
		const key = String((await request.formData()).get('key') ?? '');
		if (!checkAdminKey(key)) {
			recordFailure(ipKey);
			return fail(401, { message: 'ACCESS DENIED ✕' });
		}
		setAdminSession(cookies);
		redirect(303, '/admin');
	},
	logout: async ({ cookies }) => {
		clearSessions(cookies);
		redirect(303, '/admin');
	}
};
