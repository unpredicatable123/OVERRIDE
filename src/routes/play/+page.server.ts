import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.teamId) redirect(303, '/login');
	return { teamId: locals.teamId };
};
