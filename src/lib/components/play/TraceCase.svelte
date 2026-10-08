<script lang="ts">
	import Blocks from '#lib/components/Blocks.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import type { GameClient } from '#lib/client/team.svelte.ts';
	import type { TeamStateView } from '#lib/engine/views.ts';
	import ChallengeConsole from './ChallengeConsole.svelte';

	let { view, game }: { view: TeamStateView; game: GameClient } = $props();

	let tab = $state<'evidence' | 'questions'>('evidence');
	let openId = $state<string | null>(null);

	const qs = $derived(view.challenges);
	const closed = $derived(qs.filter((q) => q.status === 'solved' || q.status === 'failed').length);
	const current = $derived(qs.find((q) => q.id === openId) ?? qs.find((q) => q.status === 'ready' || q.status === 'open') ?? null);

	async function select(id: string) {
		openId = id;
	}

	// Ensure the focused question has an attempt row (tries are tracked server-side). One try per id.
	const requested = new Set<string>();
	$effect(() => {
		if (current?.status === 'ready' && !requested.has(current.id)) {
			requested.add(current.id);
			void game.open(current.id);
		}
	});
</script>

<div class="mb-3 flex gap-1 rounded-full bg-white/5 p-1 lg:hidden" role="tablist">
	{#each ['evidence', 'questions'] as const as t (t)}
		<button
			role="tab"
			aria-selected={tab === t}
			class="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-all {tab === t ? 'bg-white/10 text-ink' : 'text-mute'}"
			onclick={() => (tab = t)}
		>
			{t === 'evidence' ? 'Evidence' : `Deductions ${closed}/${qs.length}`}
		</button>
	{/each}
</div>

<div class="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
	<div class={tab === 'evidence' ? '' : 'hidden lg:block'}>
		<Frame label="Evidence locker">
			{#if view.protocol?.dossier}
				<Blocks blocks={view.protocol.dossier} dense />
			{:else}
				<p class="text-sm text-faint">Evidence sealed.</p>
			{/if}
		</Frame>
	</div>

	<div class="flex flex-col gap-3 {tab === 'questions' ? '' : 'hidden lg:flex'}">
		<ol class="grid grid-cols-6 gap-1.5">
			{#each qs as q, i (q.id)}
				<li>
					<button
						class="q display w-full rounded-xl py-2 text-sm"
						data-st={q.status}
						class:on={q.id === current?.id}
						onclick={() => select(q.id)}
						aria-label="Deduction {i + 1}"
					>
						{q.status === 'solved' ? '✓' : q.status === 'failed' ? '✕' : `Q${i + 1}`}
					</button>
				</li>
			{/each}
		</ol>
		{#if current}
			<Frame label="Deduction {qs.indexOf(current) + 1} of {qs.length}" tone="hot">
				{#key current.id}<ChallengeConsole challenge={current} {game} />{/key}
			</Frame>
		{:else}
			<Frame label="Case status" tone="ok">
				<p class="text-sm text-ok">All deductions filed. Case closed.</p>
			</Frame>
		{/if}
	</div>
</div>

<style>
	.q {
		color: var(--mute);
		background: rgb(255 255 255 / 0.04);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07);
		transition: all 350ms var(--ease);
	}
	.q:hover {
		color: var(--ink);
	}
	.q[data-st='solved'] {
		color: var(--ok);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ok) 45%, transparent);
	}
	.q[data-st='failed'] {
		color: var(--bad);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 45%, transparent);
	}
	.q.on {
		color: #05060b;
		background: var(--grad);
		box-shadow: 0 10px 24px -10px var(--phos);
	}
</style>
