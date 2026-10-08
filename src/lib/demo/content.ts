import type { Challenge, Difficulty, Protocol, ProtocolId } from '#lib/engine/types.ts';

/**
 * Demo-only content. Deliberately DIFFERENT from the real event puzzles (which live server-side),
 * because everything in this file ships to the browser — answers included.
 */

const P = (
	id: ProtocolId,
	index: number,
	name: string,
	title: string,
	tagline: string,
	story: string,
	flow: Protocol['flow'],
	durationSec: number,
	extra: Partial<Protocol> = {}
): Protocol => ({ id, index, code: `P-0${index + 1}`, name, title, tagline, story, flow, durationSec, dossier: [], lineBonus: 0, ...extra });

export const DEMO_PROTOCOLS: Protocol[] = [
	P('scan', 0, 'SCAN', 'Tech Bingo', 'Identify the signatures. Complete the lines.', 'Sixteen signatures on the scanner — languages, tools, companies. Name them. Every completed row, column or diagonal earns a bonus.', 'grid', 240, { lineBonus: 100 }),
	P('decode', 1, 'DECODE', 'Crack the Code', 'Every answer is a key.', 'An encrypted chain. Each layer you crack reveals the key to the next.', 'sequence', 300),
	P('trace', 2, 'TRACE', 'Tech Detective', 'The logs never lie.', 'Someone deleted the production database backup at midnight. Read the evidence. Name what happened.', 'free', 300, {
		dossier: [
			{ type: 'note', label: 'Case file', text: 'At 00:04 the nightly backup bucket was emptied. Only two engineers had access.' },
			{
				type: 'log',
				label: 'audit.log',
				lines: [
					'23:51:10  LOGIN   user=maya   ip=10.2.0.14   mfa=ok',
					'23:58:42  LOGIN   user=leo    ip=91.204.7.33 mfa=SKIPPED (legacy token)',
					'00:04:03  DELETE  user=leo    bucket=backups/nightly  objects=1,284',
					'00:04:30  LOGOUT  user=leo',
					'00:12:55  LOGOUT  user=maya'
				]
			},
			{
				type: 'table',
				label: 'On-call roster',
				columns: ['USER', 'STATUS', 'LOCATION'],
				rows: [
					['maya', 'On call', 'Office'],
					['leo', 'On leave — phone lost on Friday', '—']
				]
			}
		]
	}),
	P('escape', 3, 'ESCAPE', 'Digital Escape', 'Three locks. One exit.', 'The doors sealed behind you. Clear each subsystem to unlock the next.', 'sequence', 300),
	P('overdrive', 4, 'OVERDRIVE', 'Speed Stack', 'Ten seconds. One shot.', 'Rapid fire. Each question has a ten-second fuse and only your first answer counts.', 'sequence', 150),
	P('override', 5, 'OVERRIDE', 'Boss Fight', 'Take control of the core.', 'The core has turned hostile. Three layers stand between you and the override.', 'sequence', 240)
];

type Seed = Partial<Challenge> & Pick<Challenge, 'title' | 'prompt' | 'answers'>;

function build(protocol: ProtocolId, defaults: Partial<Challenge>, seeds: Seed[]): Challenge[] {
	return seeds.map((s, order) => ({
		id: `demo-${protocol}-${order + 1}`,
		protocol,
		order,
		tag: '',
		kind: 'text',
		blocks: [],
		options: [],
		baseXp: 100,
		difficulty: 'easy' as Difficulty,
		timeLimitSec: null,
		hardTimeout: false,
		maxAttempts: 3,
		reveal: null,
		hint: null,
		active: true,
		...defaults,
		...s
	}));
}

const q = (prompt: string, options: string[], answer: string): Seed => ({ title: 'Rapid fire', prompt, options, answers: [answer], kind: 'choice' });

export const DEMO_CHALLENGES: Challenge[] = [
	...build('scan', { baseXp: 60 }, [
		{ tag: 'LANG', title: 'The gopher', prompt: 'Google’s language with a gopher mascot and goroutines.', answers: ['go', 'golang'] },
		{ tag: 'TOOL', title: 'Package giant', prompt: 'The default package manager that ships with Node.js.', answers: ['npm'] },
		{ tag: 'LANG', title: 'Coffee cup', prompt: '“Write once, run anywhere.” Its logo is a steaming cup.', answers: ['java'] },
		{ tag: 'COMPANY', title: 'Fruit logo', prompt: 'Founded in a garage in 1976 by Steve Jobs and Steve Wozniak.', answers: ['apple'] },
		{ tag: 'TOOL', title: 'The elephant', prompt: 'Open-source relational database with an elephant logo.', answers: ['postgresql', 'postgres'] },
		{ tag: 'FRAMEWORK', title: 'Compiler-first UI', prompt: 'The UI framework this very demo is built with.', answers: ['svelte', 'sveltekit'] },
		{ tag: 'TERM', title: 'Snapshot', prompt: 'Git command that records a new snapshot of staged changes.', answers: ['commit', 'git commit'] },
		{ tag: 'LANG', title: 'Crab-powered', prompt: 'Memory-safe systems language without a garbage collector.', answers: ['rust'] },
		{ tag: 'COMPANY', title: 'Search verb', prompt: 'Its name became a verb meaning “to search the web”.', answers: ['google'] },
		{ tag: 'TOOL', title: 'Humanity', prompt: 'Linux distribution named after a Southern African word meaning “humanity to others”.', answers: ['ubuntu'] },
		{ tag: 'TERM', title: '404', prompt: 'HTTP status meaning the resource was not found. Digits only.', answers: ['404'] },
		{ tag: 'LANG', title: 'Web styling', prompt: 'Language of selectors, cascades and the box model.', answers: ['css'] },
		{ tag: 'COMPANY', title: 'Windows maker', prompt: 'Company founded by Bill Gates and Paul Allen in 1975.', answers: ['microsoft'] },
		{ tag: 'TOOL', title: 'Pipelines', prompt: 'GitHub’s built-in CI/CD service.', answers: ['github actions', 'actions'] },
		{ tag: 'TERM', title: 'Half a byte', prompt: 'Four bits make one ______.', answers: ['nibble', 'nybble'] },
		{ tag: 'LANG', title: 'Apple’s swift one', prompt: 'Apple’s modern language for iOS apps.', answers: ['swift'] }
	]),
	...build('decode', { difficulty: 'medium', maxAttempts: 4, timeLimitSec: 90 }, [
		{
			tag: 'BINARY',
			title: 'Layer 1 — Binary',
			prompt: 'Decode the 8-bit ASCII.',
			blocks: [{ type: 'code', label: 'Transmission', text: '01000011 01001111 01000100 01000101' }],
			answers: ['code'],
			baseXp: 200,
			reveal: 'Key: the next layer is shifted by 3.'
		},
		{
			tag: 'CAESAR',
			title: 'Layer 2 — Caesar',
			prompt: 'Shift each letter back by the key from layer 1.',
			blocks: [{ type: 'code', label: 'Cipher', text: 'NHUQHO' }],
			answers: ['kernel'],
			baseXp: 250,
			hint: 'N − 3 = K',
			reveal: 'Key: the last layer is hexadecimal.'
		},
		{
			tag: 'HEX',
			title: 'Layer 3 — Hex',
			prompt: 'Convert the hex bytes to ASCII.',
			blocks: [{ type: 'code', label: 'Bytes', text: '42 55 47' }],
			answers: ['bug'],
			baseXp: 300,
			difficulty: 'hard',
			reveal: 'Chain broken.'
		}
	]),
	...build('trace', { difficulty: 'medium', baseXp: 180, maxAttempts: 3 }, [
		{ tag: 'ACCOUNT', title: 'Whose account?', prompt: 'Which user account deleted the backups?', answers: ['leo'] },
		{ tag: 'IP', title: 'Point of origin', prompt: 'From which IP address did the deletion come?', answers: ['91.204.7.33'] },
		{
			tag: 'VERDICT',
			title: 'What really happened?',
			kind: 'choice',
			maxAttempts: 1,
			difficulty: 'hard',
			prompt: 'What is the most likely explanation?',
			options: ['Maya framed Leo', 'Leo deleted it from home', 'Leo’s lost phone held a legacy token that an attacker used', 'A cron job misfired'],
			answers: ['Leo’s lost phone held a legacy token that an attacker used'],
			reveal: 'Case closed — Leo was on leave, his lost phone carried a legacy token that skipped MFA, and the login came from an unknown external IP.'
		}
	]),
	...build('escape', { difficulty: 'medium', baseXp: 250, timeLimitSec: 90, maxAttempts: 4 }, [
		{ tag: 'NETWORK', title: 'Subnet lock', prompt: 'How many usable host addresses does a /30 subnet have?', answers: ['2'], reveal: 'Network unlocked.' },
		{
			tag: 'LOGIC',
			title: 'Loop trap',
			prompt: 'What does this print?',
			blocks: [{ type: 'code', label: 'trap.js', text: 'let s = 0;\nfor (let i = 1; i <= 4; i++) s += i * i;\nconsole.log(s);' }],
			answers: ['30'],
			reveal: 'Logic unlocked.'
		},
		{ tag: 'CORE', title: 'Exit code', prompt: 'Final lock: type the network answer followed by the logic answer.', answers: ['230'], difficulty: 'hard', reveal: 'You escaped.' }
	]),
	...build('overdrive', { baseXp: 100, timeLimitSec: 10, hardTimeout: true, maxAttempts: 1, kind: 'choice' }, [
		q('What does HTML stand for?', ['HyperText Markup Language', 'High Transfer Machine Logic', 'Hyperlink Text Mode Language', 'Home Tool Markup Language'], 'HyperText Markup Language'),
		q('Which structure is FIFO?', ['Stack', 'Queue', 'Tree', 'Heap'], 'Queue'),
		q('2¹⁰ equals…', ['512', '1000', '1024', '2048'], '1024'),
		q('Default HTTP port?', ['21', '22', '80', '443'], '80'),
		q('Which is a version control system?', ['Docker', 'Git', 'Nginx', 'Redis'], 'Git'),
		q('JSON stands for…', ['Java Source Object Notation', 'JavaScript Object Notation', 'Joined Syntax Object Network', 'Just Simple Object Names'], 'JavaScript Object Notation')
	]),
	...build('override', { difficulty: 'boss', maxAttempts: 4, timeLimitSec: 120 }, [
		{
			tag: 'LAYER 1',
			title: 'Handshake',
			prompt: 'Decode the Base64 handshake.',
			blocks: [{ type: 'code', label: 'Handshake', text: 'Q09SRQ==' }],
			answers: ['core'],
			baseXp: 250,
			reveal: 'Keep the first letter.'
		},
		{
			tag: 'LAYER 2',
			title: 'Complexity',
			prompt: 'Worst-case time complexity of quicksort?',
			answers: ['o(n^2)', 'o(n²)', 'n^2', 'n²', 'o(n*n)'],
			baseXp: 300,
			reveal: 'Keep the exponent.'
		},
		{
			tag: 'OVERRIDE',
			title: 'Kill code',
			prompt: 'Combine: the first letter of layer 1 followed by the exponent from layer 2.',
			answers: ['c2'],
			baseXp: 400,
			reveal: 'Override accepted — the core is yours.'
		}
	])
];
