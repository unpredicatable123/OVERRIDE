<script lang="ts">
	import Frame from '#lib/components/Frame.svelte';
	import SegBar from '#lib/components/SegBar.svelte';
	import type { GameClient } from '#lib/client/team.svelte.ts';
	import type { ChallengeView, TeamStateView } from '#lib/engine/views.ts';
	import ChallengeConsole from './ChallengeConsole.svelte';

	let {
		view,
		game,
		variant,
		roundRatio
	}: { view: TeamStateView; game: GameClient; variant: 'decode' | 'escape' | 'override'; roundRatio: number } = $props();

	let pinned = $state<string | null>(null);

	const nodes = $derived(view.challenges);
	const isClosed = (c: ChallengeView) => c.status === 'solved' || c.status === 'failed';
	const frontier = $derived(nodes.find((c) => !isClosed(c)) ?? null);
	const focus = $derived(nodes.find((c) => c.id === pinned) ?? frontier ?? nodes[nodes.length - 1] ?? null);
	const solvedCount = $derived(nodes.filter((c) => c.status === 'solved').length);
	const closedCount = $derived(nodes.filter(isClosed).length);
	const progress = $derived(nodes.length ? closedCount / nodes.length : 0);

	// When the frontier advances, release any pinned review so the next node takes focus.
	let lastFrontier: string | null = null;
	$effect(() => {
		const f = frontier?.id ?? null;
		if (f !== lastFrontier) {
			lastFrontier = f;
			pinned = null;
		}
	});

	const FAILURE_LABELS = [
		['DATABASE', 'OFFLINE', 'RESTORED'],
		['NETWORK', 'COMPROMISED', 'SECURED'],
		['SECURITY', 'BREACHED', 'SEALED'],
		['CRYPTO', 'CORRUPTED', 'DECRYPTED'],
		['AI CORE', 'LOCKED', 'OVERRIDDEN']
	] as const;
</script>

<div class="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
	<aside class="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
		{#if variant === 'escape'}
			<Frame label="Facility status">
				<ul class="space-y-1">
					{#each nodes as n (n.id)}
						{@const st = n.status === 'solved' ? 'ok' : n.status === 'failed' ? 'bad' : n.status === 'open' ? 'live' : 'idle'}
						<li>
							<button class="node flex w-full items-center justify-between rounded-xl px-3 py-2 text-left" class:on={n.id === focus?.id} data-st={st} onclick={() => (pinned = n.id)}>
								<span class="flex items-center gap-2.5 text-sm font-medium text-ink/90"><i class="pip"></i>{n.tag}</span>
								<span class="text-[0.68rem] tracking-wider text-mute">
									{n.status === 'solved' ? 'Unlocked' : n.status === 'failed' ? 'Forced' : n.status === 'open' ? 'Breaching…' : 'Locked'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
				<div class="mt-5 mb-2 flex justify-between text-xs text-mute"><span>Escape progress</span><span class="text-ink">{Math.round(progress * 100)}%</span></div>
				<SegBar value={progress} tone={progress === 1 ? 'ok' : 'phos'} />
			</Frame>
		{:else if variant === 'override'}
			<Frame label="System failure" tone="hot">
				<ul class="space-y-1">
					{#each nodes as n, i (n.id)}
						{@const l = FAILURE_LABELS[i % FAILURE_LABELS.length]}
						<li class="node flex items-center justify-between rounded-xl px-3 py-2" data-st={n.status === 'solved' ? 'ok' : 'bad'}>
							<span class="flex items-center gap-2.5 text-sm font-medium text-ink/90"><i class="pip"></i>{l[0]}</span>
							<span class="text-[0.68rem] tracking-wider {n.status === 'solved' ? 'text-ok' : 'text-bad'}">{n.status === 'solved' ? l[2] : l[1]}</span>
						</li>
					{/each}
				</ul>
				<div class="mt-5 mb-2 flex justify-between text-xs text-mute"><span>Core integrity</span><span class="text-bad">{Math.round(roundRatio * 100)}%</span></div>
				<SegBar value={roundRatio} tone="bad" />
				<div class="mt-3 flex justify-between text-xs text-mute"><span>Layers breached</span><span class="text-ink">{solvedCount}/{nodes.length}</span></div>
			</Frame>
		{:else}
			<Frame label="Key chain">
				<ol class="flex flex-col">
					{#each nodes as n, i (n.id)}
						<li>
							<button class="flex w-full items-center gap-3 rounded-xl py-1.5 text-left" onclick={() => n.status !== 'locked' && (pinned = n.id)}>
								<span class="step display flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm" data-st={n.status} class:on={n.id === focus?.id}>{i + 1}</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium {n.status === 'locked' ? 'text-faint' : 'text-ink'}">{n.status === 'locked' ? 'Encrypted' : n.tag}</span>
									{#if n.reveal}<span class="block truncate text-[0.68rem] text-phos-hi">⚿ Key generated</span>{/if}
								</span>
							</button>
							{#if i < nodes.length - 1}<div class="ml-[17px] h-3 w-px {isClosed(n) ? 'bg-phos' : 'bg-white/10'}"></div>{/if}
						</li>
					{/each}
				</ol>
				<div class="mt-3 text-xs text-mute">Final code · <span class="text-ink">{closedCount === nodes.length ? 'recovered ✓' : 'pending'}</span></div>
			</Frame>
		{/if}
	</aside>

	<section>
		{#if focus}
			<Frame label="{variant === 'escape' ? 'Subsystem' : variant === 'override' ? 'Layer' : 'Transmission'} {focus.order + 1} of {nodes.length}" tone={variant === 'override' ? 'hot' : 'base'}>
				{#snippet meta()}
					{#if pinned && frontier && pinned !== frontier.id}<button class="transition-colors hover:text-ink" onclick={() => (pinned = null)}>Back to active →</button>{/if}
				{/snippet}
				{#key focus.id}<div class="anim-rise"><ChallengeConsole challenge={focus} {game} /></div>{/key}
			</Frame>
			{#if !frontier}
				<div class="done anim-scan mt-4 rounded-3xl p-6 text-center">
					<p class="display iris text-4xl sm:text-5xl">
						{variant === 'escape' ? 'You escaped' : variant === 'override' ? 'Override complete' : 'Chain broken'}
					</p>
					<p class="mt-2 text-sm text-mute">{solvedCount}/{nodes.length} nodes accepted · awaiting protocol end</p>
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.node {
		--c: var(--faint);
		transition: background-color 300ms var(--ease);
	}
	.node[data-st='ok'] {
		--c: var(--ok);
	}
	.node[data-st='bad'] {
		--c: var(--bad);
	}
	.node[data-st='live'] {
		--c: var(--phos);
	}
	.node.on,
	button.node:hover {
		background: rgb(255 255 255 / 0.05);
	}
	.pip {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 10px var(--c);
	}
	.node[data-st='live'] .pip,
	.node[data-st='bad'] .pip {
		animation: breathe 1.6s ease-in-out infinite;
	}
	.step {
		color: var(--faint);
		background: rgb(255 255 255 / 0.04);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
		transition: all 400ms var(--ease);
	}
	.step[data-st='solved'] {
		color: var(--ok);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ok) 50%, transparent);
	}
	.step[data-st='failed'] {
		color: var(--bad);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 50%, transparent);
	}
	.step.on {
		color: #05060b;
		background: var(--grad);
		box-shadow: 0 8px 22px -8px var(--phos);
	}
	.done {
		background: linear-gradient(140deg, color-mix(in oklab, var(--ok) 12%, transparent), transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ok) 30%, transparent);
	}
</style>
