import { error, json } from '@sveltejs/kit';
import { createTeam, seedDemoTeams, teamOp } from '#lib/server/game.ts';
import { body, requireAdmin } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const b = await body(event);
	switch (b.op) {
		case 'create':
			return json({ team: await createTeam({ name: b.name, players: b.players ?? [] }) });
		case 'seed':
			return json({ created: await seedDemoTeams() });
		case 'disable':
		case 'enable':
		case 'reset':
		case 'rekey':
		case 'rename':
		case 'delete':
			await teamOp(b.op, String(b.teamId ?? ''), b);
			return json({ ok: true });
		default:
			error(400, 'Unknown operation');
	}
};
