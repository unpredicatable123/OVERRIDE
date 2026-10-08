<script lang="ts">
	import Blocks from '#lib/components/Blocks.svelte';
	import Btn from '#lib/components/Btn.svelte';
	import SegBar from '#lib/components/SegBar.svelte';
	import { clock, fmt, formatClock } from '#lib/client/clock.svelte.ts';
	import type { GameClient } from '#lib/client/team.svelte.ts';
	import { cycleColor, DIFFICULTY_COLORS, tagColor } from '#lib/client/colors.ts';
	import { accuracyFactor, speedFactor } from '#lib/engine/scoring.ts';
	import type { ChallengeView } from '#lib/engine/views.ts';

	let {
		challenge: ch,
		game,
		heading = true,
		autofocus = true,
		bigOptions = false,
		hotkeys = false
	}: { challenge: ChallengeView; game: GameClient; heading?: boolean; autofocus?: boolean; bigOptions?: boolean; hotkeys?: boolean } = $props();

	let answer = $state('');
	let shake = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let opening = $state(false);

	const live = $derived(ch.status === 'open');
	const busy = $derived(game.submitting === ch.id);
	const remaining = $derived(ch.deadlineAt !== null ? Math.max(0, ch.deadlineAt - clock.now) : null);
	const ratio = $derived(remaining !== null && ch.timeLimitSec ? remaining / (ch.timeLimitSec * 1000) : 1);

	// Display-only preview of what a correct answer is worth right now. The server decides the real XP.
	const worth = $derived.by(() => {
		if (!live) return null;
		const elapsed = ch.timeLimitSec && ch.deadlineAt !== null ? ch.timeLimitSec * 1000 - (remaining ?? 0) : 0;
		return Math.round(ch.maxXp * speedFactor(elapsed, ch.timeLimitSec) * accuracyFactor(ch.kind, ch.tries + 1));
	});

	const triesLeft = $derived(ch.maxAttempts - ch.tries);

	$effect(() => {
		if (live && autofocus && ch.kind === 'text' && input) input.focus({ preventScroll: true });
	});

	async function initialize() {
		opening = true;
		await game.open(ch.id);
		opening = false;
	}

	async function execute(value = answer) {
		if (!value.trim() || busy) return;
		const res = await game.submit(ch.id, value);
		if (res && res.outcome !== 'accepted') {
			shake++;
			answer = '';
		}
		if (res?.outcome === 'accepted') answer = '';
	}

	function onKey(e: KeyboardEvent) {
		if (!hotkeys || !live || ch.kind !== 'choice' || !ch.content) return;
		const n = Number(e.key);
		if (n >= 1 && n <= ch.content.options.length && !(e.target instanceof HTMLInputElement)) {
			e.preventDefault();
			void execute(ch.content.options[n - 1]);
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<article class="flex flex-col gap-5">
	{#if heading}
		<header class="flex flex-wrap items-center gap-x-3 gap-y-2">
			{#if ch.tag}<span class="chip" style:--c={tagColor(ch.tag, ch.order)}>{ch.tag}</span>{/if}
			<h3 class="font-display text-lg font-semibold text-ink sm:text-xl">{ch.title}</h3>
			<span class="chip ml-auto" style:--c={DIFFICULTY_COLORS[ch.difficulty]}>{ch.difficulty}</span>
			<span class="label">up to <span class="display grad text-lg">{fmt(ch.maxXp)}</span> XP</span>
		</header>
	{/if}

	{#if ch.status === 'ready' && !ch.content}
		<!-- Timed challenge: content stays sealed until the clock starts. -->
		<div class="sealed flex flex-col items-start gap-4 rounded-2xl p-5 sm:p-6">
			<div class="flex items-center gap-3">
				<span class="lock" aria-hidden="true">◈</span>
				<p class="text-sm text-ink/90">
					Sealed node — the clock starts when you begin. Finish within
					<span class="font-semibold text-phos-hi">{formatClock((ch.timeLimitSec ?? 0) * 1000)}</span> for the full speed bonus.
				</p>
			</div>
			<ul class="space-y-1.5 text-xs text-mute">
				<li>· Faster answers earn more XP</li>
				<li>· Wrong answers earn nothing {ch.kind === 'choice' ? '— one shot only' : `— ${ch.maxAttempts} tries, each lowers the reward`}</li>
				{#if ch.hardTimeout}<li class="text-bad">· Hard timeout — no answer, no XP</li>{/if}
			</ul>
			<Btn onclick={initialize} busy={opening}>Begin</Btn>
		</div>
	{:else if ch.status === 'locked'}
		<div class="tile p-5 text-sm text-faint">Locked — clear the previous node to unlock.</div>
	{:else if ch.content}
		{#if ch.deadlineAt !== null && live}
			<div class="flex items-center gap-4">
				<SegBar value={ratio} tone={ratio < 0.2 ? 'bad' : 'phos'} class="flex-1" />
				<span class="display w-16 text-right text-xl {ratio < 0.2 ? 'text-bad' : 'text-ink'}">{formatClock(remaining)}</span>
			</div>
		{/if}

		<p class="text-[1.05rem] leading-relaxed text-ink sm:text-lg">{ch.content.prompt}</p>
		{#if ch.content.blocks.length}<Blocks blocks={ch.content.blocks} />{/if}
		{#if ch.content.hint}<p class="text-sm text-info">Hint · {ch.content.hint}</p>{/if}

		{#if live}
			{#key shake}
				<div class={shake ? 'anim-bad' : ''}>
					{#if ch.kind === 'choice'}
						<div class="grid gap-2.5 {bigOptions ? 'sm:grid-cols-2' : ''}">
							{#each ch.content.options as opt, i (opt)}
								<button
									class="opt flex items-center gap-3.5 rounded-2xl px-4 text-left disabled:opacity-40 {bigOptions ? 'min-h-16 py-4 text-base sm:text-lg' : 'py-3 text-sm'}"
									style:--c={cycleColor(i)}
									style:animation-delay="{i * 60}ms"
									disabled={busy}
									onclick={() => execute(opt)}
								>
									<span class="key display flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base">{i + 1}</span>
									<span class="font-medium text-ink">{opt}</span>
								</button>
							{/each}
						</div>
					{:else}
						<form
							class="flex gap-2"
							onsubmit={(e) => {
								e.preventDefault();
								void execute();
							}}
						>
							<input
								bind:this={input}
								bind:value={answer}
								class="field flex-1 text-base"
								placeholder="Type your answer"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								maxlength="200"
								disabled={busy}
							/>
							<Btn type="submit" {busy} disabled={!answer.trim()}>Execute</Btn>
						</form>
					{/if}
				</div>
			{/key}
			<div class="flex flex-wrap justify-between gap-2 text-xs text-mute">
				<span>{#if ch.kind === 'choice'}One shot{:else}Tries left <span class="text-ink">{triesLeft}</span> / {ch.maxAttempts}{/if}</span>
				{#if worth !== null}<span>Worth now <span class="display text-sm text-phos-hi">{fmt(worth)}</span> XP</span>{/if}
			</div>
		{/if}
	{/if}

	{#if ch.status === 'solved'}
		<div class="result anim-ok flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-5 py-3.5" style:--c="var(--ok)">
			<span class="font-semibold whitespace-nowrap text-ok">✓ System accepted</span>
			<span class="display text-2xl whitespace-nowrap text-ok">+{fmt(ch.xp)} XP</span>
		</div>
	{:else if ch.status === 'failed'}
		<div class="result flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-5 py-3.5" style:--c="var(--bad)">
			<span class="font-semibold whitespace-nowrap text-bad">✕ Access denied</span>
			<span class="text-xs text-mute">Node closed · 0 XP</span>
		</div>
	{/if}
	{#if ch.reveal}
		<div class="reveal anim-scan rounded-2xl px-4 py-3.5 text-sm text-phos-hi">
			<span class="mr-2 text-phos">⚿</span>{ch.reveal}
		</div>
	{/if}
</article>

<style>
	.sealed {
		background: linear-gradient(140deg, var(--wash), transparent 70%);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--phos) 24%, transparent);
	}
	.lock {
		display: inline-flex;
		width: 2.4rem;
		height: 2.4rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		color: var(--phos-hi);
		background: color-mix(in oklab, var(--phos) 16%, transparent);
		animation: breathe 2.4s ease-in-out infinite;
	}
	.opt {
		background: rgb(255 255 255 / 0.035);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07);
		animation: rise 500ms var(--ease) both;
		transition:
			transform 300ms var(--ease),
			box-shadow 300ms var(--ease),
			background-color 300ms var(--ease);
	}
	.opt:hover:not(:disabled) {
		background: color-mix(in oklab, var(--c) 12%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--c) 55%, transparent),
			0 14px 30px -18px var(--c);
		transform: translate3d(0, -2px, 0);
	}
	.opt .key {
		color: color-mix(in oklab, var(--c) 85%, white);
		background: color-mix(in oklab, var(--c) 18%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--c) 40%, transparent);
	}
	.result {
		background: color-mix(in oklab, var(--c) 9%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--c) 30%, transparent);
	}
	.reveal {
		background: linear-gradient(110deg, var(--wash), transparent);
		box-shadow: inset 2px 0 0 var(--phos);
	}
</style>
