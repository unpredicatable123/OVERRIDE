import type { Challenge, Difficulty, Protocol } from '#lib/engine/types.ts';

/**
 * Seed content for a full OVERRIDE run. Everything here can be edited live from the admin
 * console; this file only bootstraps an event (and powers `npm run simulate`).
 */

export const PROTOCOLS: Protocol[] = [
	{
		id: 'scan',
		index: 0,
		code: 'P-01',
		name: 'SCAN',
		title: 'Tech Bingo',
		tagline: 'Identify the signatures. Light up the grid.',
		story:
			'The system is fingerprinting you. Sixteen signatures flicker on the scanner — languages, tools, companies, legends. Identify them. Every complete line overloads the scanner for bonus XP.',
		dossier: [],
		flow: 'grid',
		durationSec: 8 * 60,
		lineBonus: 100
	},
	{
		id: 'decode',
		index: 1,
		code: 'P-02',
		name: 'DECODE',
		title: 'Crack the Code',
		tagline: 'Every answer is a key. Every key opens the next lock.',
		story:
			'You found an encrypted transmission chain. Each layer you crack generates the key for the next one. Break the chain to recover the final code.',
		dossier: [],
		flow: 'sequence',
		durationSec: 10 * 60,
		lineBonus: 0
	},
	{
		id: 'trace',
		index: 2,
		code: 'P-03',
		name: 'TRACE',
		title: 'Tech Detective',
		tagline: 'The logs never lie. People do.',
		story:
			'INCIDENT 0x7F. Someone altered exam results inside NovaTech University’s grade database at 2 AM. The evidence locker opens when the protocol starts. Connect the dots. Name the culprit.',
		dossier: [
			{
				type: 'note',
				label: 'CASE FILE // 0x7F',
				text: 'On 14 March at 02:13, three exam results in grades_db were changed to "A". The DB server was fully patched last week and no vulnerability was found. Your job: reconstruct what happened.'
			},
			{
				type: 'log',
				label: 'auth.log — db-core-01',
				lines: [
					'01:52:07  LOGIN   user=r.kumar   ip=10.0.4.21       dev=LAB-PC-07  status=OK',
					'02:04:44  LOGIN   user=admin     ip=185.220.101.4   dev=—          status=FAIL',
					'02:04:51  LOGIN   user=admin     ip=185.220.101.4   dev=—          status=FAIL',
					'02:05:02  LOGIN   user=admin     ip=185.220.101.4   dev=—          status=FAIL',
					'02:05:09  BLOCK   ip=185.220.101.4   reason=rate_limit (Tor exit node)',
					'02:06:30  LOGIN   user=s.iyer    ip=10.0.4.21       dev=LAB-PC-07  status=OK',
					'02:11:58  SUDO    user=s.iyer    cmd="psql grades_db"',
					"02:13:09  QUERY   user=s.iyer    UPDATE results SET grade='A' WHERE roll IN ('21CS044','21CS051','21CS063')",
					'02:14:40  LOGOUT  user=s.iyer',
					'02:31:12  LOGOUT  user=r.kumar'
				]
			},
			{
				type: 'table',
				label: 'Badge access — Lab Block B',
				columns: ['BADGE', 'NAME', 'IN', 'OUT'],
				rows: [
					['B-1182', 'Rahul Kumar (r.kumar)', '01:45:30', '02:33:05'],
					['B-0907', 'Dev Mehta (d.mehta)', '22:10:12', '23:58:41'],
					['B-0451', 'Anita Rao (a.rao)', '—', '—']
				]
			},
			{
				type: 'table',
				label: 'Staff roster',
				columns: ['USER', 'NAME', 'ROLE', 'STATUS 12–14 MAR'],
				rows: [
					['s.iyer', 'Dr. Sneha Iyer', 'Faculty, DB admin', 'On leave — conference in Pune'],
					['r.kumar', 'Rahul Kumar', 'Student lab assistant', 'On duty (night lab)'],
					['a.rao', 'Anita Rao', 'Sysadmin', 'Remote, VPN only']
				]
			},
			{
				type: 'table',
				label: 'Students — results changed',
				columns: ['ROLL', 'NAME', 'OLD', 'NEW'],
				rows: [
					['21CS044', 'Rahul Kumar', 'D', 'A'],
					['21CS051', 'Priya Nair', 'C', 'A'],
					['21CS063', 'Arjun Das', 'C', 'A']
				]
			},
			{
				type: 'note',
				label: 'Helpdesk ticket #4471 — 07 Mar',
				text: 's.iyer: "Accidentally clicked ‘Save password’ in the browser on LAB-PC-07 while demoing the grades portal. Please remove it." — Status: OPEN (unassigned)'
			}
		],
		flow: 'free',
		durationSec: 12 * 60,
		lineBonus: 0
	},
	{
		id: 'escape',
		index: 3,
		code: 'P-04',
		name: 'ESCAPE',
		title: 'Digital Escape',
		tagline: 'Six locks. One exit. The clock is not on your side.',
		story:
			'You are inside the facility now — and the doors just sealed. Six subsystems stand between you and the exit: NETWORK, DATABASE, BINARY, LOGIC, SECURITY, ADMIN CORE. Each breach unlocks the next.',
		dossier: [],
		flow: 'sequence',
		durationSec: 10 * 60,
		lineBonus: 0
	},
	{
		id: 'overdrive',
		index: 4,
		code: 'P-05',
		name: 'OVERDRIVE',
		title: 'Speed Stack',
		tagline: 'Ten seconds. One shot. No mercy.',
		story:
			'The system is overclocking. Questions fire one after another, each with a ten-second fuse. Only your first answer counts. The faster you lock it in, the more XP you rip out of the system.',
		dossier: [],
		flow: 'sequence',
		durationSec: 6 * 60,
		lineBonus: 0
	},
	{
		id: 'override',
		index: 5,
		code: 'P-06',
		name: 'OVERRIDE',
		title: 'Boss Fight',
		tagline: 'The system is failing. Take control — or go down with it.',
		story:
			'SYSTEM FAILURE. The core has turned hostile. Database offline. Network compromised. Five layers stand between you and the OVERRIDE — and the last one demands everything you learned tonight.',
		dossier: [],
		flow: 'sequence',
		durationSec: 8 * 60,
		lineBonus: 0
	}
];

type Seed = Partial<Challenge> & Pick<Challenge, 'title' | 'prompt' | 'answers'>;

function build(protocol: Protocol['id'], defaults: Partial<Challenge>, seeds: Seed[]): Challenge[] {
	return seeds.map((s, order) => ({
		id: `${protocol}-${String(order + 1).padStart(2, '0')}`,
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

const SCAN = build('scan', { baseXp: 60, difficulty: 'easy', maxAttempts: 3 }, [
	{ tag: 'LANG', title: '10 days', prompt: 'Written in 10 days in 1995. Despite the name, I am not related to Java.', answers: ['javascript', 'js', 'ecmascript'] },
	{ tag: 'TOOL', title: 'Kernel keeper', prompt: 'Linus Torvalds built me in 2005 to manage the Linux kernel source code.', answers: ['git'] },
	{ tag: 'LANG', title: 'Not a snake', prompt: 'Named after a British comedy troupe, not a reptile. Indentation is my religion.', answers: ['python'] },
	{ tag: 'TOOL', title: 'The whale', prompt: 'My logo is a whale carrying shipping containers.', answers: ['docker'] },
	{ tag: 'TOOL', title: 'Helmsman', prompt: 'Greek for "helmsman". Seven spokes on my wheel. Fans write me as K8s.', answers: ['kubernetes', 'k8s'] },
	{ tag: 'FRAMEWORK', title: 'Virtual DOM', prompt: 'Meta’s component-based UI library. Hooks were added to me in 2019.', answers: ['react', 'reactjs'] },
	{ tag: 'LANG', title: 'SEQUEL', prompt: 'My original name was SEQUEL. I talk to relational databases.', answers: ['sql'] },
	{ tag: 'TOOL', title: 'Blue ribbon', prompt: 'Microsoft’s free code editor, built on Electron. Probably open on your laptop right now.', answers: ['vs code', 'vscode', 'visual studio code'] },
	{ tag: 'COMPANY', title: 'Garage, 1939', prompt: 'Founded in a Palo Alto garage in 1939 by Bill and Dave. Two letters.', answers: ['hp', 'hewlett packard', 'hewlett-packard'] },
	{ tag: 'COMPANY', title: 'Bookstore cloud', prompt: 'The cloud arm of an online bookstore, launched publicly in 2006 with S3. Three letters.', answers: ['aws', 'amazon web services'] },
	{ tag: 'LANG', title: 'Typed superset', prompt: 'A typed superset of JavaScript from Microsoft. My files end in .ts', answers: ['typescript', 'ts'] },
	{ tag: 'MASCOT', title: 'The crab', prompt: 'Rust’s unofficial mascot is an orange crab. What is its name?', answers: ['ferris', 'ferris the crab'] },
	{ tag: 'TERM', title: 'Skeleton', prompt: 'The markup language that forms the skeleton of every web page.', answers: ['html', 'html5', 'hypertext markup language'] },
	{ tag: 'COMPANY', title: 'Octocat', prompt: 'Home of the Octocat. Acquired by Microsoft in 2018 for $7.5B.', answers: ['github'] },
	{ tag: 'LOGO', title: 'Green robot', prompt: 'LOGO CLUE: a small green robot with antennae. Name the operating system.', answers: ['android'] },
	{ tag: 'TERM', title: 'Ctrl+C, Ctrl+V', prompt: 'The Q&A site every developer copies from. Its logo is a stack of trays.', answers: ['stack overflow', 'stackoverflow'] }
]);

const DECODE = build('decode', { difficulty: 'medium', maxAttempts: 4 }, [
	{
		tag: 'BINARY',
		title: 'Layer 01 — Binary',
		prompt: 'An 8-bit ASCII transmission was intercepted. Decode it.',
		blocks: [{ type: 'code', label: 'TRANSMISSION 01', text: '01010011 01001000 01001001 01000110 01010100' }],
		answers: ['shift'],
		baseXp: 200,
		timeLimitSec: 120,
		reveal: 'KEY GENERATED → SHIFT = 7. Layer 02 is a Caesar cipher. Shift every letter back by 7.'
	},
	{
		tag: 'CAESAR',
		title: 'Layer 02 — Caesar',
		prompt: 'Apply the key from Layer 01. What is the hidden word?',
		blocks: [{ type: 'code', label: 'TRANSMISSION 02', text: 'MPYLDHSS' }],
		answers: ['firewall'],
		baseXp: 250,
		timeLimitSec: 150,
		hint: 'M − 7 = F',
		reveal: 'KEY GENERATED → The next layer is not text. It beeps. ·−'
	},
	{
		tag: 'MORSE',
		title: 'Layer 03 — Morse',
		prompt: 'A pulse train is leaking from the server room. Decode it into a single data-structure name.',
		blocks: [{ type: 'code', label: 'PULSE', text: '...  -  .-  -.-.  -.-' }],
		answers: ['stack'],
		baseXp: 250,
		timeLimitSec: 150,
		reveal: 'KEY GENERATED → Raw bytes ahead. Base 16. Think like a browser.'
	},
	{
		tag: 'HEX',
		title: 'Layer 04 — Hex',
		prompt: 'Decode the hex bytes to ASCII to reveal a protocol. Your answer is that protocol’s default port.',
		blocks: [{ type: 'code', label: 'BYTES', text: '48 54 54 50 53' }],
		answers: ['443'],
		baseXp: 300,
		difficulty: 'hard',
		timeLimitSec: 150,
		reveal: 'KEY GENERATED → Port 443 opened. Final transmission incoming in decimal ASCII.'
	},
	{
		tag: 'ASCII',
		title: 'Layer 05 — Final Code',
		prompt: 'Final transmission. Decimal ASCII. This is the name of the system you are fighting.',
		blocks: [{ type: 'code', label: 'FINAL STREAM', text: '79 86 69 82 82 73 68 69' }],
		answers: ['override'],
		baseXp: 400,
		difficulty: 'hard',
		timeLimitSec: 180,
		reveal: 'FINAL CODE ACCEPTED → The system knows your name now.'
	}
]);

const TRACE = build('trace', { difficulty: 'medium', baseXp: 180, maxAttempts: 3 }, [
	{ tag: 'IP', title: 'Point of origin', prompt: 'From which IP address was the grade change actually carried out?', answers: ['10.0.4.21'] },
	{ tag: 'ACCOUNT', title: 'Borrowed identity', prompt: 'Which user account executed the UPDATE on grades_db?', answers: ['s.iyer', 'siyer', 'sneha iyer', 'dr. sneha iyer'] },
	{ tag: 'TIME', title: 'Moment of impact', prompt: 'At exactly what time (HH:MM:SS) were the grades modified?', answers: ['02:13:09', '2:13:09'] },
	{
		tag: 'NOISE',
		title: 'Red herring?',
		kind: 'choice',
		maxAttempts: 1,
		prompt: 'What were the login attempts from 185.220.101.4?',
		options: ['The actual attack', 'A distraction — they all failed and were blocked', 'Successful data exfiltration', 'A DDoS that took the server down'],
		answers: ['A distraction — they all failed and were blocked']
	},
	{
		tag: 'METHOD',
		title: 'The method',
		kind: 'choice',
		maxAttempts: 1,
		difficulty: 'hard',
		prompt: 'How did the attacker get into the faculty account?',
		options: ['Brute-forced the admin password', 'SQL injection on the grades portal', 'Credentials saved in the browser on LAB-PC-07', 'A phishing email to Dr. Iyer'],
		answers: ['Credentials saved in the browser on LAB-PC-07']
	},
	{
		tag: 'CULPRIT',
		title: 'Name the culprit',
		difficulty: 'hard',
		baseXp: 300,
		prompt: 'Who changed the grades? Give their username.',
		answers: ['r.kumar', 'rkumar', 'rahul kumar', 'rahul'],
		maxAttempts: 2,
		reveal: 'CASE CLOSED — r.kumar sat at LAB-PC-07 the whole time, used Dr. Iyer’s saved credentials while she was in Pune, and upgraded his own grade (21CS044) plus two friends’ to look less suspicious.'
	}
]);

const ESCAPE = build('escape', { difficulty: 'medium', baseXp: 250, timeLimitSec: 120, maxAttempts: 4 }, [
	{
		tag: 'NETWORK',
		title: 'Subnet lock',
		prompt: 'The network gate expects the CIDR prefix length for the subnet mask below. Enter just the number.',
		blocks: [{ type: 'code', label: 'MASK', text: '255.255.255.0' }],
		answers: ['24', '/24'],
		reveal: 'NETWORK UNLOCKED. Remember this number.'
	},
	{
		tag: 'DATABASE',
		title: 'Vault query',
		prompt: 'The database door opens with the value returned by this query.',
		blocks: [
			{ type: 'code', label: 'QUERY', text: 'SELECT code FROM vault\nWHERE active = 1\nORDER BY id DESC\nLIMIT 1;' },
			{
				type: 'table',
				label: 'vault',
				columns: ['id', 'code', 'active'],
				rows: [
					['1', 'ALPHA', '1'],
					['2', 'BRAVO', '0'],
					['3', 'CIPHER', '1'],
					['4', 'DELTA', '1'],
					['5', 'ECHO', '0']
				]
			}
		],
		answers: ['delta'],
		reveal: 'DATABASE UNLOCKED.'
	},
	{
		tag: 'BINARY',
		title: 'Keypad overflow',
		prompt: 'The keypad only accepts decimal. Compute the sum.',
		blocks: [{ type: 'code', label: 'PANEL', text: '0b101101 + 0b011011 = ?' }],
		answers: ['72'],
		difficulty: 'hard',
		reveal: 'BINARY UNLOCKED. Remember this number.'
	},
	{
		tag: 'LOGIC',
		title: 'Loop trap',
		prompt: 'What does this program print?',
		blocks: [
			{ type: 'code', label: 'trap.py', text: 'x = 0\nfor i in range(1, 6):\n    if i % 2 == 0:\n        x += i\n    else:\n        x -= 1\nprint(x)' }
		],
		answers: ['3'],
		difficulty: 'hard',
		reveal: 'LOGIC UNLOCKED. Remember this number.'
	},
	{
		tag: 'SECURITY',
		title: 'Hash signature',
		prompt: 'A password dump shows hashes in this format. Which hashing algorithm produced them?',
		blocks: [{ type: 'code', label: 'shadow.db', text: '$2b$12$KIXQJx5n0zJ6v2gq4eO0oOq0yq1FQ1o1Zk4Q9e7m8c1V9a3b2c1dE' }],
		answers: ['bcrypt'],
		reveal: 'SECURITY UNLOCKED. One door left.'
	},
	{
		tag: 'ADMIN CORE',
		title: 'Master PIN',
		prompt: 'The admin PIN is the NETWORK, BINARY and LOGIC answers written one after another, in that order.',
		blocks: [{ type: 'code', label: 'ADMIN CORE', text: 'PIN = [NETWORK][BINARY][LOGIC]' }],
		answers: ['24723'],
		baseXp: 400,
		difficulty: 'hard',
		timeLimitSec: 90,
		reveal: 'ADMIN CORE UNLOCKED — YOU ESCAPED.'
	}
]);

// Titles are visible before a timed challenge is opened, so they must not contain the question.
const q = (prompt: string, options: string[], answer: string): Seed => ({ title: 'RAPID FIRE', prompt, options, answers: [answer], kind: 'choice' });

const OVERDRIVE = build(
	'overdrive',
	{ difficulty: 'easy', baseXp: 100, timeLimitSec: 10, hardTimeout: true, maxAttempts: 1, kind: 'choice' },
	[
		q('What does CPU stand for?', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'], 'Central Processing Unit'),
		q('Which data structure follows LIFO?', ['Queue', 'Stack', 'Tree', 'Graph'], 'Stack'),
		q('Which protocol uses port 443?', ['HTTP', 'FTP', 'HTTPS', 'SSH'], 'HTTPS'),
		q('What is 2⁵?', ['16', '25', '32', '64'], '32'),
		q('What does SQL stand for?', ['Structured Query Language', 'Simple Query Logic', 'Sequential Query Language', 'Server Query Layer'], 'Structured Query Language'),
		q('Which language styles web pages?', ['HTML', 'CSS', 'PHP', 'XML'], 'CSS'),
		q('RAM stands for…', ['Read Access Memory', 'Random Access Memory', 'Rapid Action Memory', 'Run Access Module'], 'Random Access Memory'),
		q('Binary search runs in…', ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'], 'O(log n)'),
		q('Which HTTP method is idempotent and used to fetch data?', ['POST', 'GET', 'PATCH', 'CONNECT'], 'GET'),
		q('What does DNS translate?', ['IP → MAC', 'Domain names → IP addresses', 'Bits → bytes', 'HTTP → HTTPS'], 'Domain names → IP addresses'),
		q('Which of these is NOT a programming language?', ['Rust', 'Go', 'Kotlin', 'Nginx'], 'Nginx'),
		q('1 byte = ? bits', ['4', '8', '16', '32'], '8'),
		q('Which company created Java?', ['Microsoft', 'Apple', 'Sun Microsystems', 'IBM'], 'Sun Microsystems'),
		q('What does "git clone" do?', ['Deletes a repo', 'Copies a remote repo locally', 'Merges branches', 'Creates a commit'], 'Copies a remote repo locally'),
		q('HTTP status 404 means…', ['Server error', 'Unauthorized', 'Not found', 'Redirect'], 'Not found'),
		q('Which is a NoSQL database?', ['MySQL', 'PostgreSQL', 'MongoDB', 'SQLite'], 'MongoDB'),
		q('0xFF in decimal is…', ['15', '128', '255', '256'], '255'),
		q('Which layer of OSI handles routing?', ['Physical', 'Network', 'Session', 'Application'], 'Network'),
		q('What does API stand for?', ['Application Programming Interface', 'Advanced Program Integration', 'Automated Protocol Interface', 'Applied Program Instruction'], 'Application Programming Interface'),
		q('Which sort has the best average-case complexity?', ['Bubble sort', 'Insertion sort', 'Merge sort', 'Selection sort'], 'Merge sort')
	]
);

const OVERRIDE = build('override', { difficulty: 'boss', maxAttempts: 4, timeLimitSec: 120 }, [
	{
		tag: 'LAYER 1',
		title: 'Core handshake',
		prompt: 'The core speaks Base64. Decode the handshake — it names an architectural style built on HTTP verbs.',
		blocks: [{ type: 'code', label: 'HANDSHAKE', text: 'UkVTVA==' }],
		answers: ['rest'],
		baseXp: 300,
		reveal: 'HANDSHAKE ACCEPTED. Keep the first letter.'
	},
	{
		tag: 'LAYER 2',
		title: 'Search the void',
		prompt: 'The core hides its key in a sorted array of one billion entries. What is the time complexity of binary search over it?',
		answers: ['o(log n)', 'log n', 'o(logn)', 'logn', 'o(log(n))', 'log(n)'],
		baseXp: 300,
		reveal: 'KEY LOCATED.'
	},
	{
		tag: 'LAYER 3',
		title: 'Rate limiter',
		prompt: 'The core is fighting back. Which HTTP status code is it returning to the attacker once the limiter kicks in?',
		blocks: [
			{
				type: 'log',
				label: 'edge-proxy.log',
				lines: [
					'03:00:01  GET /core/key   200  12ms',
					'03:00:01  GET /core/key   200  11ms',
					'03:00:02  GET /core/key   200  14ms',
					'03:00:02  GET /core/key   429  1ms   retry-after=30',
					'03:00:02  GET /core/key   429  1ms   retry-after=30',
					'03:00:03  GET /core/key   429  1ms   retry-after=29'
				]
			}
		],
		answers: ['429'],
		baseXp: 350,
		reveal: 'LIMITER IDENTIFIED. Remember the code.'
	},
	{
		tag: 'LAYER 4',
		title: 'Rotated core',
		prompt: 'The final cipher layer is rotated by 13. Decrypt it.',
		blocks: [{ type: 'code', label: 'ROT', text: 'PELCGBTENCUL' }],
		answers: ['cryptography'],
		baseXp: 350,
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
				text: '[LAYER 3 status code]\n[first letter of LAYER 1 answer]\n[first letter of LAYER 4 answer]\n[2⁵ written in hexadecimal, no 0x]\n\n→ write all four parts together, no spaces'
			}
		],
		answers: ['429rc20'],
		baseXp: 500,
		timeLimitSec: 180,
		reveal: 'OVERRIDE ACCEPTED — SYSTEM CONTROL TRANSFERRED.'
	}
]);

export const CHALLENGES: Challenge[] = [...SCAN, ...DECODE, ...TRACE, ...ESCAPE, ...OVERDRIVE, ...OVERRIDE];

export const DEMO_TEAMS: Array<{ name: string; players: [string, string] }> = [
	['BYTEFORCE', 'Arun', 'Karthi'],
	['NULL POINTER', 'Priya', 'Sanjay'],
	['CODEX', 'Divya', 'Rohit'],
	['STACK RAIDERS', 'Meera', 'Vikram'],
	['DEBUGGERS', 'Harini', 'Naveen'],
	['KERNEL PANIC', 'Ashwin', 'Lakshmi'],
	['SEGFAULT', 'Gokul', 'Swetha'],
	['BIT BANDITS', 'Ram', 'Kavya'],
	['ROOT ACCESS', 'Nisha', 'Ajay'],
	['PACKET SNIFFERS', 'Deepak', 'Anjali'],
	['QUANTUM BITS', 'Surya', 'Pooja'],
	['SYNTAX ERROR', 'Vignesh', 'Keerthana'],
	['DARK MODE', 'Bala', 'Shruthi'],
	['HEAP OVERFLOW', 'Manoj', 'Revathi'],
	['LAMBDA SQUAD', 'Hari', 'Nandhini'],
	['ZERO DAY', 'Prakash', 'Janani'],
	['CACHE MISS', 'Dinesh', 'Sowmya'],
	['RUNTIME TERROR', 'Siddharth', 'Aishwarya'],
	['BINARY BEASTS', 'Kishore', 'Gayathri'],
	['FORK BOMB', 'Arjun', 'Sangeetha'],
	['THE COMPILERS', 'Varun', 'Preethi'],
	['404 FOUND', 'Mohan', 'Ramya'],
	['GIT PUSHERS', 'Saravanan', 'Dharani'],
	['PIXEL PIRATES', 'Ganesh', 'Monisha'],
	['NEURAL KNIGHTS', 'Karthik', 'Abinaya'],
	['SUDO SU', 'Ravi', 'Madhu'],
	['INFINITE LOOP', 'Yash', 'Bhavana'],
	['CTRL ALT DEFEAT', 'Ajith', 'Indhu'],
	['BOOLEAN BANDITS', 'Sathish', 'Varsha'],
	['TERMINAL VELOCITY', 'Pranav', 'Ishwarya'],
	['MALWARE MAFIA', 'Rahul', 'Archana'],
	['CLOUD NINE', 'Sriram', 'Yamini'],
	['RECURSION', 'Tarun', 'Hema'],
	['HEXADECIMALS', 'Nithin', 'Saranya'],
	['THE DAEMONS', 'Ashok', 'Priyanka'],
	['BLUE SCREEN', 'Vimal', 'Kaviya'],
	['OVERCLOCKED', 'Jagan', 'Deepika'],
	['PROXY WAR', 'Lokesh', 'Malini'],
	['MAINFRAME', 'Selva', 'Sneha'],
	['ASYNC AWAIT', 'Kumar', 'Tharani'],
	['LOGIC BOMB', 'Ragul', 'Vidhya'],
	['FIREWALL', 'Dhanush', 'Mythili']
].map(([name, a, b]) => ({ name, players: [a, b] as [string, string] }));
