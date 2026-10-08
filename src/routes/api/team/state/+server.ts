import { json } from '@sveltejs/kit';
import { teamState } from '#lib/server/game.ts';
import { noStore, requireTeamId } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => json(await teamState(requireTeamId(event)), { headers: noStore });
