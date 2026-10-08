import { BINGO_SIZE } from '#lib/engine/scoring.ts';
import type { Block, Challenge, ProtocolId } from '#lib/engine/types.ts';

/**
 * Builds one team's question set for a protocol. Pure: randomness comes in as `rng`.
 *
 * Gemini only supplies *material* — trivia clues, multiple-choice questions, words. Anything
 * with a computed answer (ciphers, encodings, code output, kill-codes) is produced here, so an
 * accepted answer can never disagree with its puzzle. Scoring fields (XP, difficulty, time
 * limit, attempts) are copied from the admin-editable base challenges at the same position.
 */

export type Rng = () => number;

export const int = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
	const a = [...xs];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
const chars = (rng: Rng, alphabet: string, n: number) => Array.from({ length: n }, () => pick(rng, [...alphabet])).join('');

/* ───────────────────────────── encoders ───────────────────────────── */

export const toBinary = (w: string) => [...w].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
export const toHexBytes = (w: string) => [...w].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(' ');
export const toDecimal = (w: string) => [...w].map((c) => c.charCodeAt(0)).join(' ');
export const toBase64 = (w: string) => btoa(w);
export const caesar = (w: string, k: number) =>
	w.toUpperCase().replace(/[A-Z]/g, (c) => String.fromCharCode(((((c.charCodeAt(0) - 65 + k) % 26) + 26) % 26) + 65));
export const rot13 = (w: string) => caesar(w, 13);

const MORSE: Record<string, string> = {
	A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
	N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..'
};
export const toMorse = (w: string) => [...w.toUpperCase()].map((c) => MORSE[c]).join('  ');

export function prefixToMask(prefix: number): string {
	const bits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	return [24, 16, 8, 0].map((s) => (bits >>> s) & 255).join('.');
}

/* ───────────────────────────── word pools (fallback + topping up Gemini) ───────────────────────────── */

export const TECH_WORDS = [
	'kernel', 'socket', 'cache', 'router', 'packet', 'buffer', 'thread', 'python', 'docker', 'server', 'binary', 'cipher', 'vector',
	'lambda', 'tensor', 'matrix', 'syntax', 'bitmap', 'daemon', 'proxy', 'token', 'queue', 'stack', 'array', 'graph', 'linux',
	'shell', 'debug', 'pixel', 'cloud', 'quantum', 'compiler', 'firewall', 'protocol', 'database', 'function', 'variable',
	'iterator', 'pointer', 'register', 'firmware', 'malware', 'network', 'gateway', 'browser', 'android', 'monitor', 'storage',
	'hashmap', 'webhook', 'backend', 'frontend', 'bytecode', 'sandbox', 'overflow', 'recursion', 'encrypt', 'checksum', 'heap',
	'mutex', 'regex', 'parser', 'script', 'module', 'object', 'cookie', 'domain', 'switch', 'bandwidth', 'latency'
];
export const CODEWORDS = ['ALPHA', 'BRAVO', 'CIPHER', 'DELTA', 'ECHO', 'FOXTROT', 'GHOST', 'HELIX', 'ION', 'JOLT', 'KILO', 'LUMEN', 'NOVA', 'ORBIT', 'PULSE', 'QUARK', 'RAVEN', 'SIGMA', 'TITAN', 'VECTOR', 'ZENITH'];
export const HANDSHAKE_WORDS = ['rest', 'graphql', 'grpc', 'soap', 'webhook', 'oauth', 'json', 'websocket', 'http', 'mqtt'];

export interface ShortQuestion {
	prompt: string;
	answers: string[];
}
export const BOSS_QUESTIONS: ShortQuestion[] = [
	{ prompt: 'The core hides its key in a sorted array of one billion entries. What is the time complexity of binary search over it?', answers: ['o(log n)', 'log n', 'o(logn)', 'logn', 'o(log(n))', 'log(n)'] },
	{ prompt: 'The core walks its network level by level. Which data structure drives a breadth-first search?', answers: ['queue', 'a queue', 'fifo queue'] },
	{ prompt: 'How many bits long is an IPv4 address?', answers: ['32', '32 bits', 'thirty two'] },
	{ prompt: 'The core undoes every move you make. Which data structure powers an undo history?', answers: ['stack', 'a stack', 'lifo stack'] },
	{ prompt: 'The core encrypts with one key and decrypts with another. What is this kind of cryptography called?', answers: ['asymmetric', 'asymmetric encryption', 'public key', 'public-key', 'public key cryptography', 'asymmetric cryptography'] },
	{ prompt: 'Which SQL keyword removes duplicate rows from a result set?', answers: ['distinct', 'select distinct'] }
];

const PORTS: Array<[string, string]> = [
	['HTTPS', '443'], ['HTTP', '80'], ['SSH', '22'], ['FTP', '21'], ['SMTP', '25'], ['DNS', '53'], ['TELNET', '23'],
	['IMAP', '143'], ['POP3', '110'], ['RDP', '3389'], ['MYSQL', '3306'], ['REDIS', '6379'], ['LDAP', '389']
];

/** Picks a distinct word of the given length range, preferring `preferred` (Gemini's) over the fallback pool. */
function takeWord(rng: Rng, preferred: string[], used: Set<string>, min: number, max: number): string {
	const ok = (w: string) => /^[a-z]+$/.test(w) && w.length >= min && w.length <= max && !used.has(w);
	const fromPreferred = preferred.map((w) => w.toLowerCase().trim()).filter(ok);
	const w = fromPreferred.length ? pick(rng, fromPreferred) : pick(rng, TECH_WORDS.filter(ok));
	used.add(w);
	return w;
}

/* ───────────────────────────── assembly ───────────────────────────── */

export type Draft = Partial<Challenge> & Pick<Challenge, 'title' | 'prompt' | 'answers'>;

const SCORING_FIELDS = ['baseXp', 'difficulty', 'timeLimitSec', 'hardTimeout', 'maxAttempts'] as const;

export function assemble(teamId: string, protocol: ProtocolId, template: Challenge[], drafts: Draft[], rng: Rng): Challenge[] {
	const nonce = chars(rng, 'abcdefghijkmnpqrstuvwxyz23456789', 4);
	return drafts.map((d, i) => {
		const t = template[i] ?? template[template.length - 1];
		const scoring = t ? Object.fromEntries(SCORING_FIELDS.map((f) => [f, t[f]])) : {};
		const c: Challenge = {
			id: `g-${teamId.toLowerCase()}-${protocol}-${nonce}-${String(i + 1).padStart(2, '0')}`,
			protocol,
			order: i,
			tag: '',
			kind: 'text',
			blocks: [],
			options: [],
			baseXp: 100,
			difficulty: 'medium',
			timeLimitSec: null,
			hardTimeout: false,
			maxAttempts: 3,
			reveal: null,
			hint: null,
			active: true,
			...d,
			...scoring,
			teamId
		};
		// A one-shot multiple-choice node must stay one-shot even if the template slot was typed.
		if (c.kind === 'choice' && d.maxAttempts !== undefined) c.maxAttempts = d.maxAttempts;
		return c;
	});
}

/* ───────────────────────────── SCAN — tech bingo ───────────────────────────── */

export interface ScanClue {
	tag: string;
	title: string;
	clue: string;
	answers: string[];
}
export const SCAN_CELLS = BINGO_SIZE * BINGO_SIZE;

export function scanDrafts(clues: ScanClue[]): Draft[] {
	return clues.slice(0, SCAN_CELLS).map((c) => ({ tag: c.tag.toUpperCase().slice(0, 12), title: c.title, prompt: c.clue, answers: c.answers, kind: 'text' }));
}

/* ───────────────────────────── OVERDRIVE — rapid-fire MCQ ───────────────────────────── */

export interface Mcq {
	question: string;
	options: string[];
	answer: string;
}

export function overdriveDrafts(rng: Rng, mcqs: Mcq[]): Draft[] {
	// Titles are visible before a timed node opens, so they never carry the question.
	return mcqs.map((m) => ({ title: 'RAPID FIRE', prompt: m.question, kind: 'choice', options: shuffle(rng, m.options), answers: [m.answer], maxAttempts: 1 }));
}

/* ───────────────────────────── DECODE — chained ciphers ───────────────────────────── */

export function decodeDrafts(rng: Rng, words: string[]): Draft[] {
	const used = new Set<string>();
	const w1 = takeWord(rng, words, used, 4, 7);
	const w2 = takeWord(rng, words, used, 5, 10);
	const w3 = takeWord(rng, words, used, 3, 6);
	const w5 = takeWord(rng, words, used, 5, 10);
	const shift = int(rng, 3, 12);
	const caesarText = caesar(w2, shift);
	const [proto, port] = pick(rng, PORTS);
	return [
		{
			tag: 'BINARY',
			title: 'Layer 01 — Binary',
			prompt: 'An 8-bit ASCII transmission was intercepted. Decode it.',
			blocks: [{ type: 'code', label: 'TRANSMISSION 01', text: toBinary(w1.toUpperCase()) }],
			answers: [w1],
			reveal: `KEY GENERATED → SHIFT = ${shift}. Layer 02 is a Caesar cipher. Shift every letter back by ${shift}.`
		},
		{
			tag: 'CAESAR',
			title: 'Layer 02 — Caesar',
			prompt: 'Apply the key from Layer 01. What is the hidden word?',
			blocks: [{ type: 'code', label: 'TRANSMISSION 02', text: caesarText }],
			answers: [w2],
			hint: `${caesarText[0]} − ${shift} = ${w2[0].toUpperCase()}`,
			reveal: 'KEY GENERATED → The next layer is not text. It beeps. ·−'
		},
		{
			tag: 'MORSE',
			title: 'Layer 03 — Morse',
			prompt: 'A pulse train is leaking from the server room. Decode it into a single word.',
			blocks: [{ type: 'code', label: 'PULSE', text: toMorse(w3) }],
			answers: [w3],
			reveal: 'KEY GENERATED → Raw bytes ahead. Base 16. Then think in ports.'
		},
		{
			tag: 'HEX',
			title: 'Layer 04 — Hex',
			prompt: 'Decode the hex bytes to ASCII to reveal a protocol. Your answer is that protocol’s default port.',
			blocks: [{ type: 'code', label: 'BYTES', text: toHexBytes(proto) }],
			answers: [port],
			reveal: `KEY GENERATED → Port ${port} opened. Final transmission incoming in decimal ASCII.`
		},
		{
			tag: 'ASCII',
			title: 'Layer 05 — Final Code',
			prompt: 'Final transmission. Decimal ASCII. Decode the final code word.',
			blocks: [{ type: 'code', label: 'FINAL STREAM', text: toDecimal(w5.toUpperCase()) }],
			answers: [w5],
			reveal: 'FINAL CODE ACCEPTED → The system knows your name now.'
		}
	];
}

/* ───────────────────────────── ESCAPE — six locks ───────────────────────────── */

/** A small program and its output, computed here rather than trusted from anywhere else. */
export function logicPuzzle(rng: Rng): { code: string; output: number } {
	for (let tries = 0; tries < 200; tries++) {
		if (rng() < 0.5) {
			const s = int(rng, 0, 6);
			const n = int(rng, 5, 9);
			const m = pick(rng, [2, 3]);
			const d = int(rng, 1, 2);
			let x = s;
			for (let i = 1; i <= n; i++) x = i % m === 0 ? x + i : x - d;
			if (x >= 1 && x <= 99) {
				return { code: `x = ${s}\nfor i in range(1, ${n + 1}):\n    if i % ${m} == 0:\n        x += i\n    else:\n        x -= ${d}\nprint(x)`, output: x };
			}
		} else {
			const start = int(rng, 6, 40);
			let n = start;
			let steps = 0;
			while (n !== 1) {
				n = n % 2 === 0 ? n / 2 : 3 * n + 1;
				steps++;
			}
			if (steps >= 1 && steps <= 99) {
				return { code: `n = ${start}\nsteps = 0\nwhile n != 1:\n    n = n // 2 if n % 2 == 0 else 3 * n + 1\n    steps += 1\nprint(steps)`, output: steps };
			}
		}
	}
	return { code: 'x = 0\nfor i in range(1, 6):\n    if i % 2 == 0:\n        x += i\n    else:\n        x -= 1\nprint(x)', output: 3 };
}

const HEX = '0123456789abcdef';
const CRYPT64 = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function hashPuzzle(rng: Rng): { lines: string[]; answers: string[]; note: string | null } {
	const kinds = [
		{ answers: ['bcrypt'], note: null, make: () => `$2b$12$${chars(rng, CRYPT64, 53)}` },
		{ answers: ['argon2id', 'argon2'], note: null, make: () => `$argon2id$v=19$m=65536,t=3,p=4$${chars(rng, B64, 22)}$${chars(rng, B64, 43)}` },
		{ answers: ['sha512crypt', 'sha-512', 'sha512', 'sha-512 crypt', 'sha512-crypt'], note: null, make: () => `$6$${chars(rng, CRYPT64, 16)}$${chars(rng, CRYPT64, 86)}` },
		{ answers: ['md5'], note: 'Unsalted digests. Count the bits.', make: () => chars(rng, HEX, 32) },
		{ answers: ['sha1', 'sha-1'], note: 'Unsalted digests. Count the bits.', make: () => chars(rng, HEX, 40) },
		{ answers: ['sha256', 'sha-256'], note: 'Unsalted digests. Count the bits.', make: () => chars(rng, HEX, 64) }
	];
	const k = pick(rng, kinds);
	return { lines: [k.make(), k.make()], answers: k.answers, note: k.note };
}

export function escapeDrafts(rng: Rng, codewords: string[]): Draft[] {
	const prefix = int(rng, 16, 30);

	const pool = shuffle(rng, [...new Set([...codewords.map((w) => w.toUpperCase().trim()).filter((w) => /^[A-Z]{3,10}$/.test(w)), ...shuffle(rng, CODEWORDS)])]);
	const rows = pool.slice(0, 5).map((code, i) => ({ id: i + 1, code, active: rng() < 0.6 ? 1 : 0 }));
	if (rows.filter((r) => r.active).length < 2) rows[0].active = rows[3].active = 1;
	if (rows.every((r) => r.active)) rows[2].active = 0;
	const want = rng() < 0.75 ? 1 : 0;
	const desc = rng() < 0.6;
	const hits = rows.filter((r) => r.active === want).sort((a, b) => (desc ? b.id - a.id : a.id - b.id));
	const vault = hits[0].code;

	const a = int(rng, 9, 63);
	const b = int(rng, 9, 63);
	const bin = (n: number) => `0b${n.toString(2).padStart(6, '0')}`;
	const logic = logicPuzzle(rng);
	const hash = hashPuzzle(rng);
	const pin = `${prefix}${a + b}${logic.output}`;

	return [
		{
			tag: 'NETWORK',
			title: 'Subnet lock',
			prompt: 'The network gate expects the CIDR prefix length for the subnet mask below. Enter just the number.',
			blocks: [{ type: 'code', label: 'MASK', text: prefixToMask(prefix) }],
			answers: [String(prefix), `/${prefix}`],
			reveal: 'NETWORK UNLOCKED. Remember this number.'
		},
		{
			tag: 'DATABASE',
			title: 'Vault query',
			prompt: 'The database door opens with the value returned by this query.',
			blocks: [
				{ type: 'code', label: 'QUERY', text: `SELECT code FROM vault\nWHERE active = ${want}\nORDER BY id ${desc ? 'DESC' : 'ASC'}\nLIMIT 1;` },
				{ type: 'table', label: 'vault', columns: ['id', 'code', 'active'], rows: rows.map((r) => [String(r.id), r.code, String(r.active)]) }
			],
			answers: [vault.toLowerCase()],
			reveal: 'DATABASE UNLOCKED.'
		},
		{
			tag: 'BINARY',
			title: 'Keypad overflow',
			prompt: 'The keypad only accepts decimal. Compute the sum.',
			blocks: [{ type: 'code', label: 'PANEL', text: `${bin(a)} + ${bin(b)} = ?` }],
			answers: [String(a + b)],
			reveal: 'BINARY UNLOCKED. Remember this number.'
		},
		{
			tag: 'LOGIC',
			title: 'Loop trap',
			prompt: 'What does this program print?',
			blocks: [{ type: 'code', label: 'trap.py', text: logic.code }],
			answers: [String(logic.output)],
			reveal: 'LOGIC UNLOCKED. Remember this number.'
		},
		{
			tag: 'SECURITY',
			title: 'Hash signature',
			prompt: 'A password dump shows hashes in this format. Which hashing algorithm produced them?',
			blocks: [{ type: 'code', label: 'shadow.db', text: hash.lines.join('\n') }, ...(hash.note ? [{ type: 'note', text: hash.note } as Block] : [])],
			answers: hash.answers,
			reveal: 'SECURITY UNLOCKED. One door left.'
		},
		{
			tag: 'ADMIN CORE',
			title: 'Master PIN',
			prompt: 'The admin PIN is the NETWORK, BINARY and LOGIC answers written one after another, in that order.',
			blocks: [{ type: 'code', label: 'ADMIN CORE', text: 'PIN = [NETWORK][BINARY][LOGIC]' }],
			answers: [pin],
			reveal: 'ADMIN CORE UNLOCKED — YOU ESCAPED.'
		}
	];
}

/* ───────────────────────────── OVERRIDE — boss fight ───────────────────────────── */

const DEFENSES = [
	{ code: '429', tail: 'retry-after=30' },
	{ code: '503', tail: 'maintenance=core' },
	{ code: '401', tail: 'www-authenticate=Bearer' },
	{ code: '403', tail: 'acl=deny ip-blacklisted' }
];

export interface BossMaterial {
	handshake: string;
	cipher: string;
	question: ShortQuestion;
}

export function overrideDrafts(rng: Rng, m: BossMaterial): Draft[] {
	const used = new Set<string>();
	const handshake = takeWord(rng, [m.handshake], used, 3, 10);
	const cipher = takeWord(rng, [m.cipher], used, 7, 14);
	const defense = pick(rng, DEFENSES);
	const n = int(rng, 16, 255);
	const killCode = `${defense.code}${handshake[0]}${cipher[0]}${n.toString(16)}`;
	const t = (s: number) => `03:00:0${s}`;
	return [
		{
			tag: 'LAYER 1',
			title: 'Core handshake',
			prompt: 'The core speaks Base64. Decode the handshake.',
			blocks: [{ type: 'code', label: 'HANDSHAKE', text: toBase64(handshake.toUpperCase()) }],
			answers: [handshake],
			reveal: 'HANDSHAKE ACCEPTED. Keep the first letter.'
		},
		{
			tag: 'LAYER 2',
			title: 'Search the void',
			prompt: m.question.prompt,
			answers: m.question.answers,
			reveal: 'KEY LOCATED.'
		},
		{
			tag: 'LAYER 3',
			title: 'Core defenses',
			prompt: 'The core is fighting back. Which HTTP status code is it returning to the attacker once its defenses kick in?',
			blocks: [
				{
					type: 'log',
					label: 'edge-proxy.log',
					lines: [
						`${t(1)}  GET /core/key   200  12ms`,
						`${t(1)}  GET /core/key   200  11ms`,
						`${t(2)}  GET /core/key   200  14ms`,
						`${t(2)}  GET /core/key   ${defense.code}  1ms   ${defense.tail}`,
						`${t(2)}  GET /core/key   ${defense.code}  1ms   ${defense.tail}`,
						`${t(3)}  GET /core/key   ${defense.code}  1ms   ${defense.tail}`
					]
				}
			],
			answers: [defense.code],
			reveal: 'DEFENSE IDENTIFIED. Remember the code.'
		},
		{
			tag: 'LAYER 4',
			title: 'Rotated core',
			prompt: 'The final cipher layer is rotated by 13. Decrypt it.',
			blocks: [{ type: 'code', label: 'ROT', text: rot13(cipher) }],
			answers: [cipher],
			reveal: 'CIPHER BROKEN. Keep the first letter.'
		},
		{
			tag: 'OVERRIDE',
			title: 'THE OVERRIDE',
			prompt: 'Assemble the kill-code and seize the system.',
			blocks: [
				{
					type: 'code',
					label: 'KILL-CODE FORMAT',
					text: `[LAYER 3 status code]\n[first letter of LAYER 1 answer]\n[first letter of LAYER 4 answer]\n[${n} written in hexadecimal, no 0x]\n\n→ write all four parts together, no spaces`
				}
			],
			answers: [killCode],
			reveal: 'OVERRIDE ACCEPTED — SYSTEM CONTROL TRANSFERRED.'
		}
	];
}
