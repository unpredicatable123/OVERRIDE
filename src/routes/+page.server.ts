import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ hasTeam: locals.teamId !== null });
