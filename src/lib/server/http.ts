import { error, type RequestEvent } from '@sveltejs/kit';

export function requireTeamId(event: RequestEvent): string {
	if (!event.locals.teamId) error(401, 'No team session');
	return event.locals.teamId;
}

export function requireAdmin(event: RequestEvent): void {
	if (!event.locals.admin) error(401, 'Admin session required');
}

export async function body(event: RequestEvent): Promise<Record<string, any>> {
	try {
		const data = await event.request.json();
		return data && typeof data === 'object' ? data : {};
	} catch {
		error(400, 'Invalid JSON');
	}
}

export const noStore = { 'cache-control': 'no-store' };
