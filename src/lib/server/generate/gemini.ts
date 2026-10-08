import { GEMINI_API_KEY, GEMINI_MODEL } from '$app/env/private';

/**
 * Minimal Gemini client: one structured-output call that returns parsed JSON.
 * Calls are queued behind a small concurrency limit and retried on rate limits / 5xx, so a
 * whole arena entering a round at once doesn't trip the API quota.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const CONCURRENCY = 4;
const ATTEMPTS = 3;
const TIMEOUT_MS = 45_000;

export const geminiEnabled = () => Boolean(GEMINI_API_KEY);
export const geminiModel = () => GEMINI_MODEL;

let running = 0;
const queue: Array<() => void> = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
	if (running >= CONCURRENCY) await new Promise<void>((r) => queue.push(r));
	running++;
	try {
		return await fn();
	} finally {
		running--;
		queue.shift()?.();
	}
}

class GeminiError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean
	) {
		super(message);
	}
}

async function call(prompt: string, schema: object): Promise<unknown> {
	const res = await fetch(`${ENDPOINT}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY! },
		body: JSON.stringify({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 1 }
		}),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 300);
		throw new GeminiError(`Gemini ${res.status}: ${detail}`, res.status === 429 || res.status >= 500);
	}
	const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
	const text = (data.candidates?.[0]?.content?.parts ?? [])
		.filter((p) => !p.thought)
		.map((p) => p.text ?? '')
		.join('');
	if (!text) throw new GeminiError('Gemini returned no content', true);
	try {
		return JSON.parse(text);
	} catch {
		throw new GeminiError('Gemini returned invalid JSON', true);
	}
}

/** Returns Gemini's JSON answer for `prompt`, shaped by `schema` (JSON Schema). Throws when unavailable. */
export async function geminiJson(prompt: string, schema: object): Promise<unknown> {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	return slot(async () => {
		for (let i = 1; ; i++) {
			try {
				return await call(prompt, schema);
			} catch (e) {
				const retryable = e instanceof GeminiError ? e.retryable : e instanceof Error && e.name === 'TimeoutError';
				if (!retryable || i >= ATTEMPTS) throw e;
				await new Promise((r) => setTimeout(r, 1500 * 2 ** (i - 1) + Math.random() * 1000));
			}
		}
	});
}
