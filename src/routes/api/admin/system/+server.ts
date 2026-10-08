import { error, json } from '@sveltejs/kit';
import { restoreContent, wipeProtocol } from '#lib/server/game.ts';
import { body, requireAdmin } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const b = await body(event);
	switch (b.op) {
		case 'restore-content':
			await restoreContent();
			return json({ ok: true });
		case 'wipe-protocol':
			await wipeProtocol(String(b.protocol ?? ''));
			return json({ ok: true });
		default:
			error(400, 'Unknown operation');
	}
};
