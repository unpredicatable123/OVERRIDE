import { json } from '@sveltejs/kit';
import { openChallenge } from '#lib/server/game.ts';
import { body, requireTeamId } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const teamId = requireTeamId(event);
	const { challengeId } = await body(event);
	return json({ challenge: await openChallenge(teamId, String(challengeId ?? '')), serverNow: Date.now() });
};
