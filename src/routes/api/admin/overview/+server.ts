import { json } from '@sveltejs/kit';
import { adminOverview } from '#lib/server/game.ts';
import { noStore, requireAdmin } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	return json(await adminOverview(), { headers: noStore });
};
