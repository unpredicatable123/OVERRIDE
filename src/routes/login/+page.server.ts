import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { EVENT_JOIN_CODE } from '$app/env/private';
import { createTeam, loginTeam } from '#lib/server/game.ts';
import { recordFailure, setTeamSession, tooManyFailures } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.teamId) redirect(303, '/play');
	return { codeRequired: Boolean(EVENT_JOIN_CODE) };
};

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const teamId = String(form.get('teamId') ?? '').trim().toUpperCase();
		const key = String(form.get('accessKey') ?? '');
		const ipKey = `login:${getClientAddress()}`;
		const teamKey = `login:${teamId}`;
		if (tooManyFailures(ipKey, 40) || tooManyFailures(teamKey, 8)) {
			return fail(429, { mode: 'login', message: 'Too many failed attempts. Wait a few minutes.', teamId });
		}
		const team = await loginTeam(teamId, key);
		if (!team) {
			recordFailure(ipKey);
			recordFailure(teamKey);
			return fail(401, { mode: 'login', message: 'ACCESS DENIED ✕ — unknown team ID or key', teamId });
		}
		setTeamSession(cookies, team.id);
		redirect(303, '/play');
	},

	register: async ({ request, cookies, getClientAddress }) => {
		const ipKey = `register:${getClientAddress()}`;
		if (tooManyFailures(ipKey, 15)) return fail(429, { mode: 'register', message: 'Too many failed attempts. Wait a few minutes.' });
		const form = await request.formData();
		// The event code is an optional gate: when EVENT_JOIN_CODE is unset, registration is open.
		if (EVENT_JOIN_CODE && String(form.get('joinCode') ?? '').trim().toUpperCase() !== EVENT_JOIN_CODE.trim().toUpperCase()) {
			recordFailure(ipKey);
			return fail(403, { mode: 'register', message: 'Invalid event code' });
		}
		try {
			const team = await createTeam({ name: form.get('name'), players: [form.get('p1'), ''], pending: true });
			await loginTeam(team.id, team.accessKey);
			setTeamSession(cookies, team.id);
			return {
				mode: 'registered',
				team: { id: team.id, name: team.name, accessKey: team.accessKey, captain: team.players[0], invite: team.inviteCode }
			};
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { mode: 'register', message: e.body.message });
			throw e;
		}
	}
};
