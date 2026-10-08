import { normalizeAnswer } from '#lib/engine/answers.ts';
import type { Challenge, ProtocolId } from '#lib/engine/types.ts';
import { addToCatalog, catalog, setKey, type Catalog } from '../catalog';
import { store } from '../store';
import { geminiEnabled, geminiJson } from './gemini';
import {
	BOSS_QUESTIONS,
	HANDSHAKE_WORDS,
	SCAN_CELLS,
	TECH_WORDS,
	assemble,
	decodeDrafts,
	escapeDrafts,
	overdriveDrafts,
	overrideDrafts,
	pick,
	scanDrafts,
	shuffle,
	type BossMaterial,
	type Draft,
	type Mcq,
	type Rng,
	type ScanClue,
	type ShortQuestion
} from './puzzles';

/**
 * Per-team question sets. Each team gets its own set for every generated protocol, created the
 * first time it is needed (and pre-warmed for the team's next round) and stored as challenges
 * owned by that team. Gemini supplies the material; if it is not configured or fails, the set is
 * randomized locally from the base content so a round never blocks on the API.
 *
 * TRACE is the exception: its case file is hand-written and shared by every team.
 */

export const GENERATED: readonly ProtocolId[] = ['scan', 'decode', 'escape', 'overdrive', 'override'];
export const isGenerated = (p: ProtocolId) => GENERATED.includes(p);

/** The challenges a team plays in a protocol; null while the team's set doesn't exist yet. */
export function teamList(cat: Catalog, teamId: string, protocol: ProtocolId): Challenge[] | null {
	if (!isGenerated(protocol)) return cat.live.get(protocol) ?? [];
	return cat.byTeam.get(setKey(teamId, protocol)) ?? null;
}

export const generationStats = { sets: 0, gemini: 0, fallbacks: 0, errors: 0 };
const inflight = new Map<string, Promise<Challenge[]>>();
export const generating = (teamId?: string) => (teamId ? [...inflight.keys()].some((k) => k.startsWith(`${teamId}\u0000`)) : inflight.size > 0);
export const pendingSets = () => inflight.size;

/** Returns the team's set for `protocol`, generating it once if needed. Concurrent callers share one run. */
export function ensureSet(teamId: string, protocol: ProtocolId): Promise<Challenge[]> {
	const key = setKey(teamId, protocol);
	const running = inflight.get(key);
	if (running) return running;
	const job = (async () => {
		const cat = await catalog();
		const have = teamList(cat, teamId, protocol);
		if (have) return have;
		const set = await generate(teamId, protocol, cat.live.get(protocol) ?? []);
		await store().upsertChallenges(set);
		await addToCatalog(set);
		generationStats.sets++;
		return set;
	})().finally(() => inflight.delete(key));
	inflight.set(key, job);
	return job;
}

/** Fire-and-forget generation, so a team's next round is ready before they reach it. */
export function prewarm(teamId: string, protocol: ProtocolId | null) {
	if (!protocol || !isGenerated(protocol)) return;
	ensureSet(teamId, protocol).catch((e) => {
		generationStats.errors++;
		console.error(`[generate] ${teamId}/${protocol} failed`, e);
	});
}

async function generate(teamId: string, protocol: ProtocolId, template: Challenge[]): Promise<Challenge[]> {
	const rng: Rng = Math.random;
	let drafts: Draft[] | null = null;
	if (geminiEnabled()) {
		try {
			drafts = await fromGemini(protocol, template, rng);
			generationStats.gemini++;
		} catch (e) {
			generationStats.fallbacks++;
			console.warn(`[generate] Gemini unavailable for ${teamId}/${protocol}, randomizing locally:`, e instanceof Error ? e.message : e);
		}
	}
	return assemble(teamId, protocol, template, drafts ?? local(protocol, template, rng), rng);
}

/* ───────────────────────────── local (no Gemini) ───────────────────────────── */

const scanFromTemplate = (t: Challenge[]): ScanClue[] => t.map((c) => ({ tag: c.tag, title: c.title, clue: c.prompt, answers: c.answers }));
const mcqFromTemplate = (t: Challenge[]): Mcq[] =>
	t.filter((c) => c.kind === 'choice' && c.answers[0]).map((c) => ({ question: c.prompt, options: c.options, answer: c.answers[0] }));
const overdriveCount = (t: Challenge[]) => t.length || 20;

function local(protocol: ProtocolId, template: Challenge[], rng: Rng): Draft[] {
	switch (protocol) {
		case 'scan':
			return scanDrafts(shuffle(rng, scanFromTemplate(template)));
		case 'overdrive':
			return overdriveDrafts(rng, shuffle(rng, mcqFromTemplate(template)).slice(0, overdriveCount(template)));
		case 'decode':
			return decodeDrafts(rng, []);
		case 'escape':
			return escapeDrafts(rng, []);
		case 'override':
			return overrideDrafts(rng, { handshake: pick(rng, HANDSHAKE_WORDS), cipher: pick(rng, TECH_WORDS.filter((w) => w.length >= 7)), question: pick(rng, BOSS_QUESTIONS) });
		default:
			throw new Error(`${protocol} is not generated`);
	}
}

/* ───────────────────────────── Gemini ───────────────────────────── */

const AUDIENCE = 'You write content for OVERRIDE, a live technical quiz game for college computer-science students at a tech fest.';

const FOCUS = [
	'programming languages', 'developer tools', 'tech companies', 'computing pioneers', 'web frameworks', 'databases',
	'networking', 'operating systems', 'cloud and DevOps', 'cybersecurity', 'AI and machine learning', 'open-source mascots and logos',
	'computer hardware', 'famous bugs and outages', 'version control', 'mobile platforms', 'algorithms and data structures', 'file formats'
];
const THEMES = ['orbital space station', 'deep-sea research lab', 'neon cyberpunk city', 'arctic data bunker', 'abandoned chip factory', 'underground hacker den', 'quantum research facility'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strList = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean) : []);
const leaks = (text: string, answers: string[]) => {
	const t = normalizeAnswer(text);
	return answers.some((a) => {
		const n = normalizeAnswer(a);
		return n.length >= 3 && t.includes(n);
	});
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

const stringArray = { type: 'array', items: { type: 'string' } };

async function fromGemini(protocol: ProtocolId, template: Challenge[], rng: Rng): Promise<Draft[]> {
	switch (protocol) {
		case 'scan': {
			const focus = shuffle(rng, FOCUS).slice(0, 5).join(', ');
			const examples = scanFromTemplate(template).slice(0, 3);
			const raw = await geminiJson(
				`${AUDIENCE}
Write ${SCAN_CELLS + 6} "identify me" clues for a tech bingo board. Lean towards these areas: ${focus}.
Rules:
- Each answer is one specific, well-known thing (language, tool, company, person, protocol, mascot, product…) a CS undergraduate can name.
- "clue": 1–2 sentences, at most 160 characters, describing it WITHOUT ever writing its name or an obvious part of it.
- "title": a cryptic 1–3 word caption that also does not contain the answer.
- "tag": one short uppercase category word such as LANG, TOOL, COMPANY, PERSON, PROTOCOL, MASCOT, TERM, DATABASE.
- "answers": the canonical name first, then common spellings / abbreviations (lowercase). 1–5 entries.
- All answers must be different. Mix easy and tricky clues.
Examples of the style: ${JSON.stringify(examples)}`,
				{
					type: 'object',
					properties: {
						clues: {
							type: 'array',
							items: {
								type: 'object',
								properties: { tag: { type: 'string' }, title: { type: 'string' }, clue: { type: 'string' }, answers: stringArray },
								required: ['tag', 'title', 'clue', 'answers']
							}
						}
					},
					required: ['clues']
				}
			);
			const seen = new Set<string>();
			const clues: ScanClue[] = [];
			const add = (c: ScanClue) => {
				const key = normalizeAnswer(c.answers[0] ?? '');
				if (!key || seen.has(key) || clues.length >= SCAN_CELLS) return;
				seen.add(key);
				clues.push(c);
			};
			for (const r of Array.isArray(obj(raw).clues) ? (obj(raw).clues as unknown[]) : []) {
				const o = obj(r);
				const c: ScanClue = { tag: str(o.tag, 12) || 'TECH', title: str(o.title, 40), clue: str(o.clue, 220), answers: strList(o.answers, 60).slice(0, 6) };
				if (!c.title || !c.clue || !c.answers.length || leaks(c.clue, c.answers) || leaks(c.title, c.answers)) continue;
				add(c);
			}
			if (clues.length < SCAN_CELLS / 2) throw new Error(`only ${clues.length} usable bingo clues`);
			for (const c of shuffle(rng, scanFromTemplate(template))) add(c);
			return scanDrafts(shuffle(rng, clues));
		}

		case 'overdrive': {
			const n = overdriveCount(template);
			const focus = shuffle(rng, FOCUS).slice(0, 6).join(', ');
			const raw = await geminiJson(
				`${AUDIENCE}
Write ${n + 5} rapid-fire multiple-choice questions. Players get 10 seconds each, so every question must be readable in about 3 seconds.
Cover a mix of: ${focus}, plus quick binary/hex arithmetic and acronym expansions.
Rules:
- "question": at most 110 characters.
- "options": exactly 4 short, distinct options (at most 45 characters each). Exactly one is correct; the others are plausible.
- "answer": copied exactly, character for character, from the correct option.
- Facts must be accurate and unambiguous. No "all of the above" / "none of the above".`,
				{
					type: 'object',
					properties: {
						questions: {
							type: 'array',
							items: {
								type: 'object',
								properties: { question: { type: 'string' }, options: stringArray, answer: { type: 'string' } },
								required: ['question', 'options', 'answer']
							}
						}
					},
					required: ['questions']
				}
			);
			const seen = new Set<string>();
			const out: Mcq[] = [];
			const add = (m: Mcq) => {
				const key = normalizeAnswer(m.question);
				if (seen.has(key) || out.length >= n) return;
				seen.add(key);
				out.push(m);
			};
			for (const r of Array.isArray(obj(raw).questions) ? (obj(raw).questions as unknown[]) : []) {
				const o = obj(r);
				const question = str(o.question, 200);
				const options = strList(o.options, 80);
				const answer = str(o.answer, 80);
				const distinct = new Set(options.map(normalizeAnswer)).size === 4;
				if (!question || options.length !== 4 || !distinct || options.filter((x) => x === answer).length !== 1) continue;
				add({ question, options, answer });
			}
			if (out.length < n / 2) throw new Error(`only ${out.length} usable questions`);
			for (const m of shuffle(rng, mcqFromTemplate(template))) add(m);
			return overdriveDrafts(rng, shuffle(rng, out));
		}

		case 'decode': {
			const raw = await geminiJson(
				`${AUDIENCE}
For a cipher-cracking round, list 14 different single English words from computing (e.g. kernel, socket, firewall, compiler).
Each word: lowercase letters a–z only, 3 to 10 letters, no spaces, hyphens or digits. Vary the topics and lengths; avoid the most obvious words.`,
				{ type: 'object', properties: { words: stringArray }, required: ['words'] }
			);
			return decodeDrafts(rng, strList(obj(raw).words, 20));
		}

		case 'escape': {
			const theme = pick(rng, THEMES);
			const raw = await geminiJson(
				`${AUDIENCE}
For an escape-room round set in a ${theme}, list 8 different vault access codewords.
Each codeword: one UPPERCASE word, letters A–Z only, 3 to 10 letters, evocative of the setting.`,
				{ type: 'object', properties: { codewords: stringArray }, required: ['codewords'] }
			);
			return escapeDrafts(rng, strList(obj(raw).codewords, 20));
		}

		case 'override': {
			const topic = pick(rng, ['algorithms and complexity', 'data structures', 'networking', 'databases and SQL', 'operating systems', 'security and cryptography', 'computer architecture']);
			const raw = await geminiJson(
				`${AUDIENCE}
This is the final boss fight. Produce:
- "handshake": one lowercase word naming a web/API technology or architectural style (like rest, graphql, grpc, oauth). Letters a–z only, 3–10 letters.
- "cipher": one lowercase computing word, letters a–z only, 7–14 letters (like cryptography, compiler, recursion).
- "question": a short-answer question about ${topic} that a strong CS student can answer in under a minute, phrased as the hostile core taunting the players. "prompt" at most 220 characters. "answers": every reasonable way to write the single correct answer (lowercase, 2–8 variants, each at most 30 characters). The answer must be a word, number or short phrase — never a sentence — and unambiguous.`,
				{
					type: 'object',
					properties: {
						handshake: { type: 'string' },
						cipher: { type: 'string' },
						question: { type: 'object', properties: { prompt: { type: 'string' }, answers: stringArray }, required: ['prompt', 'answers'] }
					},
					required: ['handshake', 'cipher', 'question']
				}
			);
			const o = obj(raw);
			const q = obj(o.question);
			const prompt = str(q.prompt, 300);
			const answers = strList(q.answers, 40).slice(0, 8);
			const question: ShortQuestion = prompt.length >= 15 && answers.length && !leaks(prompt, answers) ? { prompt, answers } : pick(rng, BOSS_QUESTIONS);
			const m: BossMaterial = { handshake: str(o.handshake, 20).toLowerCase() || pick(rng, HANDSHAKE_WORDS), cipher: str(o.cipher, 20).toLowerCase(), question };
			return overrideDrafts(rng, m);
		}

		default:
			throw new Error(`${protocol} is not generated`);
	}
}
