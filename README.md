# OVERRIDE — Technical Game Arena

A live, arena-wide technical competition for college tech events. Teams of two fight through six
protocols — **SCAN → DECODE → TRACE → ESCAPE → OVERDRIVE → OVERRIDE** — earning XP for speed,
accuracy and difficulty, with a red-alert boss fight and a cinematic final reveal on the projector.

| Screen | URL | Who |
| --- | --- | --- |
| Boot sequence / entry | `/` | everyone |
| Team registration & login | `/login` | players |
| Teammate invite (QR / link) | `/join/<code>` | player 02 |
| Demo — play every protocol, no sign-up | `/demo` | anyone |
| Game | `/play` | players (phones & laptops) |
| Arena display | `/arena` | projector / big screen |
| Admin console | `/admin` | event crew |

## Quick start

```sh
npm install
cp .env.example .env      # set ADMIN_KEY, SESSION_SECRET and (optionally) GEMINI_API_KEY
npm run dev               # http://localhost:5173
```

With no Supabase variables set, the app runs on a built-in **in-memory store** (persisted to
`.data/arena.json`) with server-sent events for realtime. That is enough for rehearsals, demos and a
single-server event.

1. Open `/admin`, log in with `ADMIN_KEY`. For a rehearsal, use **TEAMS → SEED 42 DEMO TEAMS**.
2. Open `/arena` on the projector, click once to arm audio. It shows the join URL.
3. **Player 01** opens `/login` → **NEW TEAM**, enters a team name and their own name, and gets a
   TEAM ID, an ACCESS KEY and a **QR code + invite link**.
4. **Player 02** scans the QR (or opens the link), types their name and lands in the same team.
   Either player can also log in later with TEAM ID + ACCESS KEY.
5. Drive the event from **CONTROL** — usually **START SELF-PACED RUN** (see below).

Set `EVENT_JOIN_CODE` to require an event code at registration. Admins can also create full teams
directly from **TEAMS**.

## Self-paced run

The default way to play. After **START SELF-PACED RUN**, every team works through
SCAN → DECODE → TRACE → ESCAPE → OVERDRIVE **on its own round clock**:

- A protocol opens with its briefing; the team's clock starts when either player presses **INITIALIZE**.
- The round ends as soon as every node is closed (solved or locked out) **or** the team's own clock
  runs out — and the next protocol opens immediately.
- After OVERDRIVE the team waits at the **boss gate**. The admin then prepares and runs the OVERRIDE
  boss fight for everyone at once, as before (this closes any rounds still in progress).
- **PAUSE** freezes every team's clock; paused time is never charged.

The arena shows how many teams are in each protocol; **ADMIN → TEAMS** shows each team's stage.
Progress is derived on the server from each team's round start times and attempts
([`src/lib/engine/progress.ts`](src/lib/engine/progress.ts)), so it can't drift out of sync.
The admin-driven flow (**PREPARE PROTOCOL** → **INITIALIZE**) is still available from the lobby.

## Question generation (Gemini)

Every team gets **its own question set** for SCAN, DECODE, ESCAPE, OVERDRIVE and OVERRIDE. TRACE is
a hand-written case file and stays shared. Sets are generated when a team first needs one and the
next round's set is generated in the background while the current one is played, so teams rarely
wait. Generated challenges are stored per team (`challenges.team_id`) and never leave the server
before they are opened, exactly like base content.

- **Gemini writes the content, the server computes the answers.** Gemini (`GEMINI_API_KEY`,
  `GEMINI_MODEL`, default `gemini-3.8-flash`) writes the bingo clues, the rapid-fire MCQs, the
  boss-fight question and the words used in the cipher rounds. Anything with a computed answer —
  binary/Caesar/Morse/hex/ASCII/Base64/ROT13 layers, subnet masks, SQL results, code output,
  PINs and kill-codes — is built by [`src/lib/server/generate/puzzles.ts`](src/lib/server/generate/puzzles.ts),
  so an accepted answer can't disagree with its puzzle. Gemini output is validated (answers leaked
  in clues, duplicates and malformed choices are dropped) and topped up from base content.
- **XP, difficulty, time limits and attempts** come from the base challenges in **ADMIN → CHALLENGES**,
  position by position. Edit those to tune every team's generated set.
- **No key, or Gemini fails?** The set is randomized locally (shuffled base clues and questions,
  fresh parametric puzzles), so a round never blocks on the API. **ADMIN → CONTROL → QUESTION SETS**
  shows how many sets were built and how many fell back.
- Calls are limited to 4 at a time with retries on rate limits, so a whole arena entering a round at
  once doesn't trip the quota. **RESET EVENT** and a team's **RESET** delete their generated sets.

## Demo mode

`/demo` lets anyone try all six protocols without creating a team or touching the live event:
pick a protocol, play it against the clock, see a debrief ranked against seven simulated teams,
and preview the cinematic final reveal. It runs entirely in the browser on the same engine as the
real arena (projection, scoring, answer matching, bingo lines), using a **separate demo puzzle set**
in [`src/lib/demo/content.ts`](src/lib/demo/content.ts) — real event answers never reach the client.

## Design

Midnight glass: graphite surfaces, off-white type (Geist / Geist Mono), one quiet silver accent.
Colour is reserved for meaning (correct / wrong) and two moments — a muted crimson for the boss
fight and soft champagne for the finale.

- **Start page** — a monochrome starfield: a Svelte port of the React Bits
  [Galaxy](https://reactbits.dev) shader (MIT), rendered with `ogl`. Its internal resolution adapts
  to the device so slower GPUs keep a smooth frame rate.
- **Everywhere else** — a slow Three.js field of chrome, frosted-porcelain and graphite solids.
  Pages set its mood and presence (dimmed while a protocol is live), and correct answers send a
  gentle pulse through it. It loads lazily, pauses in background tabs, and doesn't exist at all on
  pages that hide it.
- Reduced-motion users get still frames and no transitions.

## Supabase setup

1. Create a project, then run the files in [`supabase/migrations/`](supabase/migrations/) in order
   (`0001_override.sql`, `0002_invites.sql`, `0003_self_paced.sql`) in the SQL editor, or `supabase db push`.
2. Set `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Start the app — protocols and challenges are seeded automatically on first boot.

Every table has RLS enabled with **no** browser policies except one: `arena_snapshot` is readable by
`anon`. Browsers subscribe to that single row over Supabase Realtime; all game writes go through the
SvelteKit server with the service-role key.

## Deployment

Built with `@sveltejs/adapter-node`:

```sh
npm run build
node build                # PORT=3000 by default
```

Run **one** server instance. Snapshot publishing is throttled in-process, and the memory store is
single-process by design. One Node process comfortably handles a full college event — see the
simulation numbers below. Put it behind HTTPS (cookies are `Secure` in production).

## Event-day runbook

| Step | Admin action | Arena shows |
| --- | --- | --- |
| Doors open | **START EVENT · OPEN LOBBY** | team count + join URL |
| Go | **START SELF-PACED RUN** | teams per protocol, live board, feed |
| Problems | **PAUSE / RESUME**, **LOCK SUBMISSIONS** | SYSTEM HALTED |
| Teams at the boss gate | watch **SELF-PACED PROGRESS** | — |
| Boss | prepare **OVERRIDE** → **INITIALIZE BOSS FIGHT** | whole UI turns red; **boss XP only** |
| After boss | **COMPLETE PROTOCOL** → (optional) **LOCK RESULTS** | results locked, totals classified |
| Reveal | **FINALIZE RESULTS** | cinematic reveal → podium |

Prefer the admin-driven rounds? From the lobby use **PREPARE PROTOCOL** → **INITIALIZE PROTOCOL** →
**COMPLETE PROTOCOL** for each protocol instead of starting the self-paced run (**±CLOCK** works there).

Phones hold back each team's final rank for ~34 s after FINALIZE so the projector reveal isn't spoiled.

## How scoring works

All XP comes from one module: [`src/lib/engine/scoring.ts`](src/lib/engine/scoring.ts).

```
XP = round( BASE × DIFFICULTY × SPEED × ACCURACY )

DIFFICULTY  easy ×1 · medium ×1.25 · hard ×1.5 · boss ×2
SPEED       timed challenges only: t = elapsed / limit
            speed = 0.4 + 0.6 × (1 + cos(π·t)) / 2      → 1.0 … 0.4, smooth
ACCURACY    choice: first try only (a lucky 2nd guess = 0)
            text:   1.0, 0.7, 0.45, 0.25 per try
WRONG       always 0 · XP is never negative
```

- The curve is flat at the start (reading time isn't punished) and never drops below 40%, so a
  correct answer is always worth something. A 500-XP easy challenge answered at 18 s of 60 s pays
  **438 XP**; at 55 s it pays **205 XP**.
- **Tech Bingo** is fixed-XP; every completed row/column/diagonal adds a line bonus.
- **FINAL XP** = sum of all six protocols, computed from authoritative attempt rows at FINALIZE
  time and frozen.

## Integrity

- The client never decides correctness or XP. It sends `open` / `submit` intents; the server
  validates team, challenge, protocol, round status, unlock order, timing and answers, then scores.
- Timed challenges ship **no content** until the team opens them, which starts the server clock.
  Paused time is excluded from elapsed time.
- Locked sequence nodes, answers, reveals and dossiers never leave the server early.
- Both teammates can play at once; conditional writes (optimistic concurrency) stop double-scoring.
- Submissions are rate-limited per team; logins are throttled on **failed** attempts only, so a whole
  campus behind one NAT address can still log in.
- During the boss fight the public snapshot, the admin board and the player HUD only contain
  **boss XP**. Totals exist nowhere outside the database until FINALIZE.

## Architecture

```
src/lib/engine/      pure, shared, unit-tested — no I/O
  gameState.ts         explicit state machine (EVENT_IDLE … EVENT_COMPLETE) + legal actions
  progress.ts          self-paced run: where each team is, from its round clocks + attempts
  scoring.ts           the XP engine
  leaderboard.ts       aggregation, ranking, boss/final visibility rules
  answers.ts           answer normalisation
src/lib/server/      authoritative game service
  game.ts              team state projection, open/submit, admin actions, team & challenge mgmt
  snapshot.ts          builds + throttles the public realtime snapshot
  store/               Store interface → Supabase or memory implementation
  seed/content.ts      all six protocols' puzzles + 42 demo teams
  generate/            per-team question sets: Gemini client, validation, deterministic puzzles
src/lib/client/      realtime feed, shared clock, WebAudio synth, team game client
src/lib/components/  design system, protocol views, admin panels, arena reveal
scripts/simulate.ts  load test + integrity check
```

Every screen renders from one realtime **arena snapshot** (phase, clock, board, feed). The player
page additionally fetches its own team projection when the state version changes.

## Sound

All sounds are synthesised with WebAudio — no audio files. Audio starts only after the first tap or
key press. The **🔊 SOUND ON / 🔇 SOUND OFF** toggle, the volume slider and the ambient-bed switch are
in the bottom-right corner on every screen.

## Testing

```sh
npm test                                  # engine unit tests
npm run check                             # svelte-check / TypeScript
npm run simulate -- --full --reset        # 42 teams × 2 players play the whole event
npm run simulate -- --self-paced --reset  # same, through the self-paced run, then the boss
```

Bots read each team's generated answers through the admin API. The simulator logs every player in, plays every protocol with bots of varying skill (including
wrong answers and colliding teammates), asserts the boss-only and final-aggregation rules, and
prints latency percentiles. A local run on the memory store at 20× human speed — 84 concurrent
players, 3,013 graded submissions — finished with **0 server errors**. Submit latency was 7 ms at
p50 and 36 ms at p99.

## Editing content

Use **ADMIN → CHALLENGES** to edit live content: prompt, rich blocks (`text`, `code`, `log`, `table`,
`note` as JSON), options, accepted answers, base XP, difficulty, time limit, hard timeout, attempts,
the reveal text, and the hint. You can also change protocol durations and the bingo line bonus there.
To change the bundled defaults, edit `src/lib/server/seed/content.ts` and use
**RESTORE DEFAULT CONTENT**.

> Titles are visible before a timed challenge is opened — keep the question out of the title.
