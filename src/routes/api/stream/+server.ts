import { currentSnapshot, subscribe } from '#lib/server/snapshot.ts';
import type { RequestHandler } from './$types';

/** Server-sent events fallback for realtime when Supabase is not configured. */
export const GET: RequestHandler = async ({ request }) => {
	const encoder = new TextEncoder();
	let cleanup = () => {};
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			const unsubscribe = subscribe((s) => send(`data: ${JSON.stringify(s)}\n\n`));
			const heartbeat = setInterval(() => send(': hb\n\n'), 20_000);
			cleanup = () => {
				clearInterval(heartbeat);
				unsubscribe();
			};
			request.signal.addEventListener('abort', () => {
				cleanup();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			});
			send(`retry: 2000\ndata: ${JSON.stringify(await currentSnapshot())}\n\n`);
		},
		cancel() {
			cleanup();
		}
	});
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
