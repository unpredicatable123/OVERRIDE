export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: body === undefined ? 'GET' : 'POST',
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		cache: 'no-store'
	});
	if (!res.ok) {
		let message = `Request failed (${res.status})`;
		try {
			message = (await res.json()).message ?? message;
		} catch {
			/* non-JSON error */
		}
		throw new ApiError(res.status, message);
	}
	return res.json() as Promise<T>;
}
