/** Answer matching: forgiving on formatting, strict on content. */

export function normalizeAnswer(raw: string): string {
	return raw
		.normalize('NFKC')
		.toLowerCase()
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/[.!?]+$/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Drops separators so "Node.js", "node js" and "nodejs" compare equal. */
function compact(normalized: string): string {
	return normalized.replace(/[\s._\-/]+/g, '');
}

export function matchesAnswer(submitted: string, accepted: readonly string[]): boolean {
	const n = normalizeAnswer(submitted);
	if (!n) return false;
	const c = compact(n);
	return accepted.some((a) => {
		const an = normalizeAnswer(a);
		return an === n || (c.length > 0 && compact(an) === c);
	});
}
