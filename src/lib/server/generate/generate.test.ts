import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Challenge, ProtocolId } from '#lib/engine/types.ts';
import { CHALLENGES } from '../seed/content';

const h = vi.hoisted(() => ({ gemini: vi.fn(), saved: [] as Challenge[] }));

vi.mock('./gemini', () => ({ geminiEnabled: () => true, geminiJson: h.gemini }));
vi.mock('../store', () => ({ store: () => ({ upsertChallenges: async (rows: Challenge[]) => void h.saved.push(...rows) }) }));
vi.mock('../catalog', () => {
	const live = new Map<ProtocolId, Challenge[]>();
	for (const c of CHALLENGES) live.set(c.protocol, [...(live.get(c.protocol) ?? []), c]);
	const cat = { live, byTeam: new Map() };
	return { setKey: (t: string, p: string) => `${t}\u0000${p}`, addToCatalog: async () => {}, catalog: async () => cat };
});

const { ensureSet, generationStats } = await import('./index');

let team = 0;
const nextTeam = () => `OV-${String(++team).padStart(3, '0')}`;

beforeEach(() => {
	h.gemini.mockReset();
	h.saved.length = 0;
});

describe('Gemini sets', () => {
	it('drops clues that leak or repeat their answer and tops the board up from base content', async () => {
		const clues = Array.from({ length: 12 }, (_, i) => ({ tag: 'TOOL', title: `Riddle ${i}`, clue: `Mystery clue number ${i}.`, answers: [`thing${i}`] }));
		clues.push({ tag: 'LANG', title: 'Leaky', clue: 'Python is a snake-named language.', answers: ['python'] });
		clues.push({ tag: 'LANG', title: 'Again', clue: 'Same answer as before.', answers: ['THING3'] });
		h.gemini.mockResolvedValue({ clues });

		const set = await ensureSet(nextTeam(), 'scan');
		expect(set).toHaveLength(16);
		const answers = set.map((c) => c.answers[0].toLowerCase());
		expect(new Set(answers).size).toBe(16);
		expect(set.some((c) => c.title === 'Leaky' || c.title === 'Again')).toBe(false);
		expect(set.filter((c) => c.title.startsWith('Riddle'))).toHaveLength(12);
		expect(set.every((c) => c.teamId === `OV-${String(team).padStart(3, '0')}` && c.protocol === 'scan')).toBe(true);
		expect(h.saved).toHaveLength(16);
	});

	it('only keeps multiple choice whose answer is exactly one of four distinct options', async () => {
		const good = Array.from({ length: 15 }, (_, i) => ({ question: `Q${i}?`, options: ['a', 'b', 'c', `d${i}`], answer: 'b' }));
		h.gemini.mockResolvedValue({
			questions: [
				...good,
				{ question: 'Missing answer?', options: ['a', 'b', 'c', 'd'], answer: 'e' },
				{ question: 'Three options?', options: ['a', 'b', 'c'], answer: 'a' },
				{ question: 'Duplicate options?', options: ['a', 'A', 'c', 'd'], answer: 'c' }
			]
		});

		const set = await ensureSet(nextTeam(), 'overdrive');
		const base = CHALLENGES.filter((c) => c.protocol === 'overdrive');
		expect(set).toHaveLength(base.length);
		expect(set.every((c) => c.kind === 'choice' && c.maxAttempts === 1 && c.options.length === 4 && c.options.includes(c.answers[0]))).toBe(true);
		expect(set.some((c) => c.prompt.includes('Missing') || c.prompt.includes('Three') || c.prompt.includes('Duplicate'))).toBe(false);
		expect(set.filter((c) => /^Q\d+\?$/.test(c.prompt))).toHaveLength(15);
	});

	it('falls back to local randomization when Gemini fails, so a round never blocks', async () => {
		h.gemini.mockRejectedValue(new Error('Gemini 503'));
		const before = generationStats.fallbacks;
		const set = await ensureSet(nextTeam(), 'decode');
		expect(set).toHaveLength(5);
		expect(generationStats.fallbacks).toBe(before + 1);
	});

	it('uses a Gemini boss question but replaces one that gives its answer away', async () => {
		h.gemini.mockResolvedValue({ handshake: 'graphql', cipher: 'compiler', question: { prompt: 'The answer is mutex. What locks a critical section?', answers: ['mutex'] } });
		const set = await ensureSet(nextTeam(), 'override');
		expect(set[0].answers).toEqual(['graphql']);
		expect(set[3].answers).toEqual(['compiler']);
		expect(set[1].prompt).not.toContain('mutex');
	});

	it('shares one generation between concurrent requests for the same set', async () => {
		h.gemini.mockResolvedValue({ words: ['kernel', 'socket', 'firewall', 'stack', 'compiler'] });
		const id = nextTeam();
		const [a, b] = await Promise.all([ensureSet(id, 'decode'), ensureSet(id, 'decode')]);
		expect(a).toBe(b);
		expect(h.gemini).toHaveBeenCalledTimes(1);
	});
});
