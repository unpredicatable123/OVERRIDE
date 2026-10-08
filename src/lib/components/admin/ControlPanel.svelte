<script lang="ts">
	import Board from '#lib/components/Board.svelte';
	import Btn from '#lib/components/Btn.svelte';
	import Counter from '#lib/components/Counter.svelte';
	import Feed from '#lib/components/Feed.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import { api } from '#lib/client/api.ts';
	import { arena } from '#lib/client/arena.svelte.ts';
	import { formatClock } from '#lib/client/clock.svelte.ts';
	import type { ActionType } from '#lib/engine/gameState.ts';
	import type { ArenaSnapshot, GenerationStatus } from '#lib/engine/views.ts';

	let {
		snap,
		actions,
		generation,
		onchange,
		toast
	}: { snap: ArenaSnapshot; actions: ActionType[]; generation: GenerationStatus; onchange: () => void; toast: (m: string, bad?: boolean) => void } = $props();

	let busy = $state<string | null>(null);
	let wipeTarget = $state('scan');
	const can = (a: ActionType) => actions.includes(a);
	const st = $derived(snap.state);
	const current = $derived(snap.protocols.find((p) => p.id === st.protocol));
	const selfPaced = $derived(st.phase === 'EVENT_LIVE' || st.phase === 'LIVE_PAUSED');
	const remaining = $derived(arena.remainingMs);
	const boardTitle = $derived(snap.board.mode === 'boss' ? 'OVERRIDE // BOSS' : snap.board.mode === 'final' ? 'FINAL RESULTS' : 'LIVE LEADERBOARD');

	async function act(body: Record<string, unknown>, confirmText?: string) {
		if (confirmText && !confirm(confirmText)) return;
		busy = String(body.type ?? body.op);
		try {
			await api('/api/admin/action', body);
			onchange();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Action failed', true);
		} finally {
			busy = null;
		}
	}

	async function system(body: Record<string, unknown>, confirmText: string) {
		if (!confirm(confirmText)) return;
		busy = String(body.op);
		try {
			await api('/api/admin/system', body);
			toast('Done');
			onchange();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Failed', true);
		} finally {
			busy = null;
		}
	}

	function reset() {
		const typed = prompt('RESET wipes ALL progress and every generated question set, and returns to EVENT_IDLE. Teams are kept.\nType RESET to confirm.');
		if (typed === 'RESET') void act({ type: 'RESET' });
	}
</script>

<div class="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
	<div class="flex flex-col gap-5">
		<!-- STATUS -->
		<Frame label="EVENT STATE" tone={snap.board.mode === 'boss' ? 'hot' : 'base'}>
			{#snippet meta()}v{st.version}{/snippet}
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div>
					<div class="display text-5xl text-phos glow">{st.phase.replace(/_/g, ' ')}</div>
					<div class="mt-1 text-sm tracking-[0.2em] text-ink">
						{selfPaced ? 'EVERY TEAM ON ITS OWN ROUND CLOCK' : current ? `${current.code} · ${current.name} · ${current.title}` : 'NO PROTOCOL'}
					</div>
				</div>
				<div class="text-right">
					<div class="label">TIME REMAINING</div>
					<div class="display text-6xl tabular-nums {remaining !== null && remaining < 60_000 ? 'text-bad' : 'text-ink'}">{formatClock(remaining)}</div>
				</div>
			</div>
			{#if st.submissionsLocked}<p class="label mt-3 text-bad!">● SUBMISSIONS LOCKED</p>{/if}
		</Frame>

		<!-- CONTROL -->
		<Frame label="EVENT CONTROL">
			<div class="flex flex-col gap-5">
				{#if can('OPEN_LOBBY')}
					<Btn size="lg" onclick={() => act({ type: 'OPEN_LOBBY' })} busy={busy === 'OPEN_LOBBY'}>START EVENT · OPEN LOBBY</Btn>
				{/if}

				{#if can('START_LIVE')}
					<div class="border border-phos bg-wash p-4">
						<p class="label mb-3 text-phos!">
							SELF-PACED: TEAMS PLAY SCAN → OVERDRIVE ON THEIR OWN CLOCKS. CLEARING A PROTOCOL (OR RUNNING OUT ITS TIME) OPENS THE NEXT. YOU RUN THE BOSS FIGHT AFTERWARDS.
						</p>
						<Btn size="lg" block onclick={() => act({ type: 'START_LIVE' }, 'Start the self-paced run? Every team can begin SCAN immediately.')} busy={busy === 'START_LIVE'}>
							▶ START SELF-PACED RUN
						</Btn>
					</div>
				{/if}

				{#if can('PREPARE_ROUND')}
					<div>
						<p class="label mb-2">{selfPaced ? 'WHEN THE TEAMS ARE DONE — PREPARE THE BOSS FIGHT' : can('START_LIVE') ? 'OR RUN ROUNDS MANUALLY' : 'PREPARE PROTOCOL'}</p>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each snap.protocols as p (p.id)}
								{@const done = st.completed.includes(p.id)}
								<button
									class="border px-3 py-2.5 text-left transition-colors enabled:hover:border-phos enabled:hover:bg-wash disabled:opacity-30 {p.id === st.protocol
										? 'border-phos bg-wash'
										: 'border-line'}"
									disabled={selfPaced && p.id !== 'override'}
									onclick={() =>
										act(
											{ type: 'PREPARE_ROUND', protocol: p.id },
											selfPaced
												? `End the self-paced run and prepare the boss fight?\n\n${(snap.stats.stages.slice(0, -1).reduce((a, b) => a + b, 0))} team(s) have not finished every protocol yet — their open rounds close now.`
												: done
													? `${p.name} was already played. Prepare it again? (Existing XP is kept.)`
													: undefined
										)}
								>
									<div class="label">{p.code} {done ? '✓' : ''}</div>
									<div class="font-bold tracking-[0.15em] {p.id === 'override' ? 'text-bad' : 'text-ink'}">{p.name}</div>
									<div class="text-[0.65rem] text-mute">{formatClock(p.durationSec * 1000)}</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex flex-wrap gap-2">
					{#if can('START_ROUND')}
						<Btn size="lg" onclick={() => act({ type: 'START_ROUND' })} busy={busy === 'START_ROUND'}>
							{st.protocol === 'override' ? '⚠ INITIALIZE BOSS FIGHT' : 'INITIALIZE PROTOCOL'}
						</Btn>
					{/if}
					{#if can('PAUSE')}<Btn variant="ghost" onclick={() => act({ type: 'PAUSE' })}>⏸ PAUSE</Btn>{/if}
					{#if can('RESUME')}<Btn onclick={() => act({ type: 'RESUME' })}>▶ RESUME</Btn>{/if}
					{#if can('END_ROUND')}
						<Btn variant="danger" onclick={() => act({ type: 'END_ROUND' }, `Complete ${current?.name}? Submissions close immediately.`)}>■ COMPLETE PROTOCOL</Btn>
					{/if}
				</div>

				{#if can('EXTEND')}
					<div class="flex flex-wrap items-center gap-2">
						<span class="label mr-1">CLOCK</span>
						{#each [-60, -30, 30, 60, 120] as s (s)}
							<Btn size="sm" variant="ghost" onclick={() => act({ type: 'EXTEND', seconds: s })}>{s > 0 ? '+' : '−'}{Math.abs(s)}s</Btn>
						{/each}
					</div>
				{/if}

				{#if can('LOCK_SUBMISSIONS') || can('UNLOCK_SUBMISSIONS')}
					<div>
						{#if can('LOCK_SUBMISSIONS')}<Btn size="sm" variant="ghost" onclick={() => act({ type: 'LOCK_SUBMISSIONS' })}>🔒 LOCK SUBMISSIONS</Btn>{/if}
						{#if can('UNLOCK_SUBMISSIONS')}<Btn size="sm" onclick={() => act({ type: 'UNLOCK_SUBMISSIONS' })}>🔓 UNLOCK SUBMISSIONS</Btn>{/if}
					</div>
				{/if}

				{#if can('LOCK_RESULTS')}
					<Btn variant="ghost" onclick={() => act({ type: 'LOCK_RESULTS' })}>LOCK RESULTS</Btn>
				{/if}

				{#if can('FINALIZE')}
					<div class="border border-phos bg-wash p-4">
						<p class="label mb-3 text-phos!">AGGREGATES ALL PROTOCOL XP + BOSS XP AND TRIGGERS THE ARENA REVEAL</p>
						<Btn
							size="lg"
							block
							class="finalize"
							busy={busy === 'FINALIZE'}
							onclick={() => act({ type: 'FINALIZE' }, 'FINALIZE RESULTS?\n\nThis freezes the final ranking and starts the cinematic reveal on every screen.')}
						>
							FINALIZE RESULTS
						</Btn>
					</div>
				{/if}

				{#if can('COMPLETE_EVENT')}
					<Btn variant="ghost" onclick={() => act({ type: 'COMPLETE_EVENT' }, 'End the event?')}>END EVENT</Btn>
				{/if}
			</div>
		</Frame>

		{#if selfPaced}
			<Frame label="SELF-PACED PROGRESS">
				<div class="grid grid-cols-3 gap-px bg-line sm:grid-cols-6">
					{#each [...snap.protocols.filter((p) => p.id !== 'override').map((p) => p.name), 'BOSS GATE'] as name, i (name)}
						<div class="bg-panel p-3">
							<div class="label {i === snap.stats.stages.length - 1 ? 'text-ok!' : ''}">{name}</div>
							<div class="display text-4xl text-ink"><Counter value={snap.stats.stages[i] ?? 0} /></div>
						</div>
					{/each}
				</div>
			</Frame>
		{/if}

		<Frame label="QUESTION SETS">
			{#snippet meta()}{generation.gemini ? generation.model : 'LOCAL'}{/snippet}
			<p class="mb-3 text-xs text-mute">
				{#if generation.gemini}
					Every team gets its own Gemini-generated set for SCAN, DECODE, ESCAPE, OVERDRIVE and OVERRIDE. TRACE is shared. If Gemini fails, that set is randomized locally.
				{:else}
					<span class="text-bad">GEMINI_API_KEY is not set.</span> Each team still gets its own set, randomized locally from the base content.
				{/if}
			</p>
			<dl class="grid grid-cols-3 gap-px bg-line">
				<div class="bg-panel p-3"><dt class="label">SETS BUILT</dt><dd class="display text-3xl text-ink">{generation.sets}</dd></div>
				<div class="bg-panel p-3"><dt class="label">GENERATING</dt><dd class="display text-3xl {generation.pending ? 'text-phos anim-pulse' : 'text-ink'}">{generation.pending}</dd></div>
				<div class="bg-panel p-3"><dt class="label">LOCAL FALLBACKS</dt><dd class="display text-3xl {generation.fallbacks ? 'text-bad' : 'text-ink'}">{generation.fallbacks}</dd></div>
			</dl>
		</Frame>

		<!-- MONITOR -->
		<Frame label="LIVE MONITORING">
			<dl class="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
				<div class="bg-panel p-3"><dt class="label">ACTIVE TEAMS</dt><dd class="display text-4xl text-ink"><Counter value={snap.stats.activeTeams} /><span class="text-lg text-faint">/{snap.stats.teams}</span></dd></div>
				<div class="bg-panel p-3"><dt class="label">SUBMISSIONS</dt><dd class="display text-4xl text-ink"><Counter value={snap.stats.submissions} /></dd></div>
				<div class="bg-panel p-3"><dt class="label">CURRENT ROUND</dt><dd class="display truncate text-4xl text-ink">{selfPaced ? 'SELF-PACED' : (current?.name ?? '—')}</dd></div>
				<div class="bg-panel p-3"><dt class="label">AVG {snap.board.mode === 'boss' ? 'BOSS ' : ''}SCORE</dt><dd class="display text-4xl text-phos"><Counter value={snap.stats.avgXp} /> <span class="text-lg">XP</span></dd></div>
			</dl>
		</Frame>

		<Frame label="DANGER ZONE" tone="bad">
			<div class="flex flex-wrap items-center gap-2">
				<select bind:value={wipeTarget} class="field w-auto! py-1.5! text-xs">
					{#each snap.protocols as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
				<Btn size="sm" variant="danger" onclick={() => system({ op: 'wipe-protocol', protocol: wipeTarget }, `Erase ALL team progress in ${wipeTarget.toUpperCase()}?`)}>WIPE PROTOCOL XP</Btn>
				<Btn size="sm" variant="danger" onclick={() => system({ op: 'restore-content' }, 'Overwrite protocols & challenges with the bundled defaults? Custom challenges with other IDs are kept. Already-generated team sets are not changed.')}>RESTORE DEFAULT CONTENT</Btn>
				<Btn size="sm" variant="danger" onclick={reset}>RESET EVENT</Btn>
			</div>
		</Frame>
	</div>

	<div class="flex flex-col gap-5">
		<Frame label={boardTitle} tone={snap.board.mode === 'boss' ? 'hot' : 'base'} pad={false}>
			{#snippet meta()}
				{#if snap.board.mode === 'boss'}<span class="text-bad">TOTALS HIDDEN UNTIL FINALIZE</span>{:else}{snap.board.rows.length} TEAMS{/if}
			{/snippet}
			<div class="max-h-[60vh] overflow-y-auto">
				<Board rows={snap.board.rows} limit={200} unit={snap.board.mode === 'boss' ? 'BOSS' : 'XP'} />
			</div>
		</Frame>
		<Frame label="LIVE ACTION">
			<Feed items={snap.feed} limit={12} />
		</Frame>
	</div>
</div>

<style>
	:global(.finalize) {
		font-size: 1.1rem !important;
		padding: 1.15rem !important;
		letter-spacing: 0.32em !important;
		box-shadow: 0 0 40px -6px var(--glow);
	}
</style>
