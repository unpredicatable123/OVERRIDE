import type { Difficulty, ProtocolId } from '#lib/engine/types.ts';

/** Protocols share one quiet palette; only the boss stands apart. */
const NEUTRAL: [string, string] = ['var(--phos)', 'var(--phos-2)'];
export const PROTOCOL_COLORS: Record<ProtocolId, [string, string]> = {
	scan: NEUTRAL,
	decode: NEUTRAL,
	trace: NEUTRAL,
	escape: NEUTRAL,
	overdrive: NEUTRAL,
	override: ['#c97b7f', '#e9d6d7']
};

export type Accent = ProtocolId | 'lobby' | 'final';

/** Sets the global accent (drives --phos / --phos-2 and every derived token). */
export function setAccent(accent: Accent | null) {
	document.documentElement.dataset.accent = accent ?? 'lobby';
}

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
	easy: 'var(--mute)',
	medium: 'var(--mute)',
	hard: 'var(--yellow)',
	boss: 'var(--red)'
};

/** Tags and answer options render in neutral tones; colour is reserved for meaning. */
export function tagColor(_tag: string, _fallbackIndex = 0): string {
	return 'var(--mute)';
}

export function cycleColor(_i: number): string {
	return 'var(--phos)';
}

/** Stable per-team hue derived from the team id. */
export function teamHue(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
	return Math.abs(h) % 360;
}

/** A barely-there per-team tint so rows stay distinguishable without turning into confetti. */
export function teamColor(id: string, l = 74): string {
	return `hsl(${teamHue(id)} 14% ${l}%)`;
}

/** Brushed metals rather than trophies. */
export const MEDALS: Record<number, [string, string]> = {
	1: ['#efe4c6', '#b8a576'],
	2: ['#eef0f4', '#9da3ad'],
	3: ['#e7cdbb', '#a8826b']
};
