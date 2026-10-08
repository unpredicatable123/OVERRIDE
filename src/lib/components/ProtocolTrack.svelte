<script lang="ts">
	import { PROTOCOL_COLORS } from '#lib/client/colors.ts';
	import type { ProtocolId } from '#lib/engine/types.ts';
	import type { ProtocolMeta } from '#lib/engine/views.ts';

	let {
		protocols,
		current,
		completed,
		class: cls = ''
	}: { protocols: ProtocolMeta[]; current: ProtocolId | null; completed: ProtocolId[]; class?: string } = $props();
</script>

<!-- Six-stop journey: a hairline rail with a glowing node per protocol. -->
<ol class="track flex items-center overflow-x-auto pb-1 {cls}">
	{#each protocols as p, i (p.id)}
		{@const done = completed.includes(p.id) && p.id !== current}
		{@const live = p.id === current}
		{@const [a, b] = PROTOCOL_COLORS[p.id]}
		<li class="flex shrink-0 items-center" style:--a={a} style:--b={b}>
			<span class="step flex items-center gap-2 rounded-full px-3 py-1.5" class:live class:done>
				<i class="node"></i>
				<span class="text-[0.68rem] font-semibold tracking-[0.14em]">{p.name}</span>
			</span>
			{#if i < protocols.length - 1}<span class="link" class:done></span>{/if}
		</li>
	{/each}
</ol>

<style>
	.step {
		color: var(--faint);
		transition: all 600ms var(--ease);
	}
	.node {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.15);
		transition: all 600ms var(--ease);
	}
	.step.done {
		color: color-mix(in oklab, var(--a) 70%, var(--mute));
	}
	.step.done .node {
		background: var(--a);
	}
	.step.live {
		color: white;
		background: linear-gradient(110deg, color-mix(in oklab, var(--a) 35%, transparent), color-mix(in oklab, var(--b) 25%, transparent));
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--a) 55%, transparent),
			0 8px 26px -10px var(--a);
	}
	.step.live .node {
		background: white;
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--a) 50%, transparent), 0 0 14px var(--a);
		animation: breathe 1.8s ease-in-out infinite;
	}
	.link {
		width: 18px;
		height: 1px;
		background: rgb(255 255 255 / 0.1);
	}
	.link.done {
		background: linear-gradient(90deg, var(--a), var(--b));
	}
</style>
