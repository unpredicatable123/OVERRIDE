import { json } from '@sveltejs/kit';
import { submitAnswer } from '#lib/server/game.ts';
import { body, requireTeamId } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const teamId = requireTeamId(event);
	const { challengeId, answer } = await body(event);
	return json(await submitAnswer(teamId, String(challengeId ?? ''), String(answer ?? '')));
};
