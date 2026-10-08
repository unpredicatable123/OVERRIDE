import { json } from '@sveltejs/kit';
import { adminAction, type AdminActionInput } from '#lib/server/game.ts';
import { body, requireAdmin } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const input = (await body(event)) as AdminActionInput;
	const state = await adminAction(input);
	return json({ phase: state.phase, version: state.version });
};
