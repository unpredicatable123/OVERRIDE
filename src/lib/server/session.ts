import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { ADMIN_KEY, SESSION_SECRET } from '$app/env/private';

export const TEAM_COOKIE = 'ov_team';
export const ADMIN_COOKIE = 'ov_admin';
const MAX_AGE = 60 * 60 * 18; // one event day

const mac = (v: string) => createHmac('sha256', SESSION_SECRET).update(v).digest('base64url');

function safeEqual(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function sign(value: string): string {
	return `${value}.${mac(value)}`;
}

export function unsign(token: string | undefined): string | null {
	if (!token) return null;
	const i = token.lastIndexOf('.');
	if (i <= 0) return null;
	const value = token.slice(0, i);
	return safeEqual(token.slice(i + 1), mac(value)) ? value : null;
}

const opts = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: !dev, maxAge: MAX_AGE };

export function setTeamSession(cookies: Cookies, teamId: string) {
	cookies.set(TEAM_COOKIE, sign(`team:${teamId}`), opts);
}

export function setAdminSession(cookies: Cookies) {
	cookies.set(ADMIN_COOKIE, sign(`admin:${Date.now()}`), opts);
}

export function clearSessions(cookies: Cookies) {
	cookies.delete(TEAM_COOKIE, { path: '/' });
	cookies.delete(ADMIN_COOKIE, { path: '/' });
}

export function readTeam(cookies: Cookies): string | null {
	const v = unsign(cookies.get(TEAM_COOKIE));
	return v?.startsWith('team:') ? v.slice(5) : null;
}

export function readAdmin(cookies: Cookies): boolean {
	return unsign(cookies.get(ADMIN_COOKIE))?.startsWith('admin:') ?? false;
}

export function checkAdminKey(key: string): boolean {
	return safeEqual(mac(key), mac(ADMIN_KEY));
}

/**
 * Fixed-window counters for failed logins. Only failures count, so a whole campus behind one
 * NAT address can log in at once while brute-forcing a key is still throttled.
 */
const hits = new Map<string, { n: number; reset: number }>();
const FAIL_WINDOW_MS = 5 * 60_000;

export function tooManyFailures(key: string, limit: number): boolean {
	const h = hits.get(key);
	return h !== undefined && h.reset > Date.now() && h.n >= limit;
}

export function recordFailure(key: string) {
	const now = Date.now();
	const h = hits.get(key);
	if (!h || h.reset < now) {
		hits.set(key, { n: 1, reset: now + FAIL_WINDOW_MS });
		if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
	} else h.n++;
}
