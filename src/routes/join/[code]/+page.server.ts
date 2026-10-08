import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { invitePreview, joinTeam } from '#lib/server/game.ts';
import { recordFailure, setTeamSession, tooManyFailures } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
	code: params.code.toUpperCase(),
	invite: await invitePreview(params.code)
});

export const actions: Actions = {
	default: async ({ params, request, cookies, getClientAddress }) => {
		const ipKey = `join:${getClientAddress()}`;
		if (tooManyFailures(ipKey, 20)) return fail(429, { message: 'Too many attempts. Wait a few minutes.' });
		const form = await request.formData();
		try {
			const team = await joinTeam(params.code, form.get('name'));
			setTeamSession(cookies, team.id);
		} catch (e) {
			if (isHttpError(e)) {
				recordFailure(ipKey);
				return fail(e.status, { message: e.body.message });
			}
			throw e;
		}
		redirect(303, '/play');
	}
};
