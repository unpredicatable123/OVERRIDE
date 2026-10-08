<script lang="ts">
	import type { Block } from '#lib/engine/types.ts';

	let { blocks, dense = false }: { blocks: Block[]; dense?: boolean } = $props();
</script>

<div class="flex flex-col {dense ? 'gap-3' : 'gap-4'}">
	{#each blocks as b, i (i)}
		{#if b.type === 'text'}
			<p class="leading-relaxed text-ink/90">{b.text}</p>
		{:else if b.type === 'code'}
			<figure class="code overflow-hidden rounded-2xl">
				{#if b.label}<figcaption class="label flex items-center gap-2 px-4 pt-3"><i class="dot"></i>{b.label}</figcaption>{/if}
				<pre class="overflow-x-auto px-4 py-3.5 text-[0.95rem] leading-relaxed sm:text-[1.05rem]">{b.text}</pre>
			</figure>
		{:else if b.type === 'log'}
			<figure class="code overflow-hidden rounded-2xl">
				{#if b.label}<figcaption class="label flex items-center gap-2 px-4 pt-3"><i class="dot"></i>{b.label}</figcaption>{/if}
				<div class="overflow-x-auto px-3 py-3 font-mono text-[0.72rem] leading-[1.75] sm:text-xs">
					{#each b.lines as line, j (j)}
						<div class="rounded-md px-1.5 whitespace-pre text-ink/85" class:bad={/FAIL|BLOCK|429/.test(line)}>
							<span class="mr-3 text-faint select-none">{String(j + 1).padStart(2, '0')}</span>{line}
						</div>
					{/each}
				</div>
			</figure>
		{:else if b.type === 'table'}
			<figure class="tile overflow-hidden">
				{#if b.label}<figcaption class="label px-4 pt-3">{b.label}</figcaption>{/if}
				<div class="overflow-x-auto px-1.5 pb-1.5">
					<table class="w-full text-left text-xs">
						<thead>
							<tr>{#each b.columns as c (c)}<th class="label px-3 py-2.5 font-medium">{c}</th>{/each}</tr>
						</thead>
						<tbody>
							{#each b.rows as row, r (r)}
								<tr class="border-t border-white/5">
									{#each row as cell, c (c)}<td class="px-3 py-2 whitespace-nowrap text-ink/90">{cell}</td>{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</figure>
		{:else if b.type === 'note'}
			<aside class="note rounded-2xl px-4 py-3.5">
				{#if b.label}<div class="label mb-1.5 text-phos-hi!">{b.label}</div>{/if}
				<p class="text-sm leading-relaxed text-ink/90">{b.text}</p>
			</aside>
		{/if}
	{/each}
</div>

<style>
	.code {
		background: rgb(3 4 10 / 0.6);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07);
	}
	.code pre {
		color: var(--phos-hi);
		text-shadow: 0 0 22px var(--glow);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--phos);
	}
	.bad {
		color: var(--bad);
		background: color-mix(in oklab, var(--bad) 8%, transparent);
	}
	.note {
		background: linear-gradient(110deg, var(--wash), transparent);
		box-shadow: inset 2px 0 0 var(--phos);
	}
</style>
