import { describe, expect, it } from 'vitest';
import { matchesAnswer } from '#lib/engine/answers.ts';
import type { Block, Challenge } from '#lib/engine/types.ts';
import {
	assemble,
	caesar,
	decodeDrafts,
	escapeDrafts,
	overdriveDrafts,
	overrideDrafts,
	prefixToMask,
	rot13,
	scanDrafts,
	toBinary,
	toMorse,
	type Rng
} from './puzzles';

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function seeded(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const code = (blocks: Block[] | undefined, i = 0) => {
	const b = blocks?.filter((x) => x.type === 'code')[i];
	return b && b.type === 'code' ? b.text : '';
};
const fromCodes = (text: string, radix: number) =>
	text
		.trim()
		.split(/\s+/)
		.map((t) => String.fromCharCode(parseInt(t, radix)))
		.join('');

const MORSE_BACK = Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [toMorse(c), c]));
const PORTS: Record<string, string> = {
	HTTPS: '443', HTTP: '80', SSH: '22', FTP: '21', SMTP: '25', DNS: '53', TELNET: '23', IMAP: '143', POP3: '110', RDP: '3389', MYSQL: '3306', REDIS: '6379', LDAP: '389'
};

describe('encoders', () => {
	it('encode the way the puzzles describe', () => {
		expect(toBinary('SHIFT')).toBe('01010011 01001000 01001001 01000110 01010100');
		expect(caesar('firewall', 7)).toBe('MPYLDHSS');
		expect(caesar(caesar('kernel', 11), -11)).toBe('KERNEL');
		expect(rot13('cryptography')).toBe('PELCGBTENCUL');
		expect(toMorse('stack')).toBe('...  -  .-  -.-.  -.-');
		expect(prefixToMask(24)).toBe('255.255.255.0');
		expect(prefixToMask(20)).toBe('255.255.240.0');
		expect(prefixToMask(30)).toBe('255.255.255.252');
	});
});

describe('generated answers always match their puzzle', () => {
	for (let seed = 1; seed <= 300; seed++) {
		const rng = seeded(seed);

		it(`DECODE #${seed}`, () => {
			const [l1, l2, l3, l4, l5] = decodeDrafts(rng, seed % 2 ? ['kernel', 'socket', 'Bad Word', 'x'] : []);
			expect(matchesAnswer(fromCodes(code(l1.blocks), 2), l1.answers)).toBe(true);
			const shift = Number(/SHIFT = (\d+)/.exec(l1.reveal!)![1]);
			expect(matchesAnswer(caesar(code(l2.blocks), -shift), l2.answers)).toBe(true);
			const morse = code(l3.blocks).split('  ').map((m) => MORSE_BACK[m]).join('');
			expect(matchesAnswer(morse, l3.answers)).toBe(true);
			expect(l4.answers).toEqual([PORTS[fromCodes(code(l4.blocks), 16)]]);
			expect(matchesAnswer(fromCodes(code(l5.blocks), 10), l5.answers)).toBe(true);
			expect(new Set([l1, l2, l3, l5].map((l) => l.answers[0])).size).toBe(4);
		});

		it(`ESCAPE #${seed}`, () => {
			const [net, db, bin, logic, sec, core] = escapeDrafts(rng, seed % 3 ? ['ORION', 'VEGA', 'not valid!'] : []);
			const prefix = net.answers[0];
			expect(prefixToMask(Number(prefix))).toBe(code(net.blocks));

			const query = code(db.blocks);
			const table = db.blocks!.find((b) => b.type === 'table');
			if (table?.type !== 'table') throw new Error('no vault table');
			const want = /active = (\d)/.exec(query)![1];
			const rows = table.rows.filter((r) => r[2] === want).sort((a, b) => Number(a[0]) - Number(b[0]));
			const hit = query.includes('DESC') ? rows[rows.length - 1] : rows[0];
			expect(hit).toBeDefined();
			expect(matchesAnswer(hit[1], db.answers)).toBe(true);

			const [a, b] = code(bin.blocks).match(/0b[01]+/g)!.map((x) => parseInt(x.slice(2), 2));
			expect(bin.answers).toEqual([String(a + b)]);

			expect(Number(logic.answers[0])).toBeGreaterThanOrEqual(1);
			expect(Number(logic.answers[0])).toBeLessThanOrEqual(99);
			expect(sec.answers.length).toBeGreaterThan(0);
			expect(core.answers).toEqual([`${prefix}${bin.answers[0]}${logic.answers[0]}`]);
		});

		it(`OVERRIDE #${seed}`, () => {
			const layers = overrideDrafts(rng, { handshake: seed % 2 ? 'graphql' : '', cipher: seed % 2 ? 'recursion' : '???', question: { prompt: 'Q?', answers: ['a'] } });
			const [l1, , l3, l4, l5] = layers;
			const handshake = atob(code(l1.blocks)).toLowerCase();
			expect(l1.answers).toEqual([handshake]);
			expect(l4.answers).toEqual([rot13(code(l4.blocks)).toLowerCase()]);
			const n = Number(/\[(\d+) written in hexadecimal/.exec(code(l5.blocks))![1]);
			expect(l5.answers).toEqual([`${l3.answers[0]}${handshake[0]}${l4.answers[0][0]}${n.toString(16)}`]);
			const log = l3.blocks!.find((b) => b.type === 'log');
			expect(log?.type === 'log' && log.lines.at(-1)!.includes(` ${l3.answers[0]} `)).toBe(true);
		});
	}
});

describe('assemble', () => {
	const template = [
		{ baseXp: 200, difficulty: 'medium', timeLimitSec: 120, hardTimeout: false, maxAttempts: 4 },
		{ baseXp: 400, difficulty: 'hard', timeLimitSec: 180, hardTimeout: false, maxAttempts: 2 }
	] as Challenge[];

	it('owns every challenge by the team and keeps the admin scoring settings', () => {
		const rng = seeded(7);
		const set = assemble('OV-007', 'decode', template, decodeDrafts(rng, []).slice(0, 3), rng);
		expect(set.map((c) => c.teamId)).toEqual(['OV-007', 'OV-007', 'OV-007']);
		expect(set.map((c) => c.order)).toEqual([0, 1, 2]);
		expect(set.map((c) => c.baseXp)).toEqual([200, 400, 400]);
		expect(new Set(set.map((c) => c.id)).size).toBe(3);
		expect(set.every((c) => c.id.startsWith('g-ov-007-decode-'))).toBe(true);
	});

	it('keeps multiple choice one-shot and the answer among the options', () => {
		const rng = seeded(3);
		const drafts = overdriveDrafts(rng, [{ question: 'Q', options: ['a', 'b', 'c', 'd'], answer: 'c' }]);
		const [c] = assemble('OV-001', 'overdrive', [{ ...template[0], maxAttempts: 3 }] as Challenge[], drafts, rng);
		expect(c.kind).toBe('choice');
		expect(c.maxAttempts).toBe(1);
		expect(c.options).toContain('c');
		expect(c.title).toBe('RAPID FIRE');
	});

	it('fills a full bingo board', () => {
		const clues = Array.from({ length: 20 }, (_, i) => ({ tag: 'lang', title: `t${i}`, clue: `c${i}`, answers: [`a${i}`] }));
		expect(scanDrafts(clues)).toHaveLength(16);
	});
});
