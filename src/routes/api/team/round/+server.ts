import { json } from '@sveltejs/kit';
import { startRound } from '#lib/server/game.ts';
import { body, requireTeamId } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

/** Self-paced run: the team initializes the protocol that just opened for it. */
export const POST: RequestHandler = async (event) => {
	const teamId = requireTeamId(event);
	const { protocol } = await body(event);
	await startRound(teamId, String(protocol ?? ''));
	return json({ ok: true, serverNow: Date.now() });
};
