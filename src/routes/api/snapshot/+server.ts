import { json } from '@sveltejs/kit';
import { currentSnapshot } from '#lib/server/snapshot.ts';
import { noStore } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await currentSnapshot(), { headers: noStore });
