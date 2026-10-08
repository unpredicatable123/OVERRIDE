import { error, json } from '@sveltejs/kit';
import { deleteChallenge, listChallengesAdmin, updateProtocol, upsertChallenge } from '#lib/server/game.ts';
import { body, noStore, requireAdmin } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	// ?generated=1 also returns every team's generated set (used by the simulator).
	return json(await listChallengesAdmin({ generated: event.url.searchParams.has('generated') }), { headers: noStore });
};

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const b = await body(event);
	switch (b.op) {
		case 'upsert':
			return json({ challenge: await upsertChallenge(b.challenge ?? {}) });
		case 'delete':
			await deleteChallenge(String(b.id ?? ''));
			return json({ ok: true });
		case 'protocol':
			await updateProtocol(String(b.id ?? ''), { durationSec: b.durationSec, lineBonus: b.lineBonus });
			return json({ ok: true });
		default:
			error(400, 'Unknown operation');
	}
};
