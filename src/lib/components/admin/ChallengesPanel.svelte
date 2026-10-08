<script lang="ts">
	import Btn from '#lib/components/Btn.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import { api } from '#lib/client/api.ts';
	import { maxXp } from '#lib/engine/scoring.ts';
	import type { Challenge, Protocol, ProtocolId } from '#lib/engine/types.ts';

	let { toast }: { toast: (m: string, bad?: boolean) => void } = $props();

	let protocols = $state<Protocol[]>([]);
	let challenges = $state<Challenge[]>([]);
	let filter = $state<ProtocolId>('scan');
	let draft = $state<Record<string, any> | null>(null);
	let isNew = $state(false);
	let saving = $state(false);

	const list = $derived(challenges.filter((c) => c.protocol === filter).sort((a, b) => a.order - b.order));
	const proto = $derived(protocols.find((p) => p.id === filter));

	async function load() {
		try {
			const res = await api<{ protocols: Protocol[]; challenges: Challenge[] }>('/api/admin/challenges');
			protocols = res.protocols;
			challenges = res.challenges;
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Load failed', true);
		}
	}
	$effect(() => {
		void load();
	});

	function edit(c: Challenge) {
		isNew = false;
		draft = {
			...c,
			optionsText: c.options.join('\n'),
			answersText: c.answers.join('\n'),
			blocksText: JSON.stringify(c.blocks, null, 2),
			timeLimitSec: c.timeLimitSec ?? ''
		};
	}

	function create() {
		isNew = true;
		const seq = list.length + 1;
		draft = {
			id: `${filter}-${String(seq).padStart(2, '0')}x`,
			protocol: filter,
			order: list.length,
			title: '',
			tag: '',
			kind: 'text',
			prompt: '',
			optionsText: '',
			answersText: '',
			blocksText: '[]',
			baseXp: 200,
			difficulty: 'medium',
			timeLimitSec: '',
			hardTimeout: false,
			maxAttempts: 3,
			reveal: '',
			hint: '',
			active: true
		};
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!draft) return;
		let blocks: unknown;
		try {
			blocks = JSON.parse(draft.blocksText || '[]');
			if (!Array.isArray(blocks)) throw new Error();
		} catch {
			toast('Blocks must be a JSON array', true);
			return;
		}
		const lines = (s: string) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
		saving = true;
		try {
			await api('/api/admin/challenges', {
				op: 'upsert',
				challenge: {
					...draft,
					options: lines(draft.optionsText),
					answers: lines(draft.answersText),
					blocks,
					timeLimitSec: draft.timeLimitSec === '' ? null : Number(draft.timeLimitSec)
				}
			});
			toast('Challenge saved');
			draft = null;
			await load();
		} catch (err) {
			toast(err instanceof Error ? err.message : 'Save failed', true);
		} finally {
			saving = false;
		}
	}

	async function remove(id: string) {
		if (!confirm(`Delete ${id}? Team attempts on it are removed too.`)) return;
		try {
			await api('/api/admin/challenges', { op: 'delete', id });
			draft = null;
			await load();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Delete failed', true);
		}
	}

	async function toggle(c: Challenge) {
		try {
			await api('/api/admin/challenges', { op: 'upsert', challenge: { ...c, active: !c.active } });
			await load();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Failed', true);
		}
	}

	async function saveProtocol(e: SubmitEvent) {
		e.preventDefault();
		if (!proto) return;
		const f = new FormData(e.currentTarget as HTMLFormElement);
		try {
			await api('/api/admin/challenges', {
				op: 'protocol',
				id: proto.id,
				durationSec: Number(f.get('minutes')) * 60,
				lineBonus: Number(f.get('lineBonus') ?? 0)
			});
			toast('Protocol updated');
			await load();
		} catch (err) {
			toast(err instanceof Error ? err.message : 'Failed', true);
		}
	}
</script>

<div class="mb-4 flex flex-wrap gap-1">
	{#each protocols as p (p.id)}
		<button
			class="label border px-3 py-2 {filter === p.id ? 'border-phos text-phos!' : 'border-line'}"
			onclick={() => {
				filter = p.id;
				draft = null;
			}}>{p.code} {p.name}</button
		>
	{/each}
</div>

<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
	<div class="flex flex-col gap-5">
		{#if proto}
			<Frame label="PROTOCOL SETTINGS">
				<form class="flex flex-wrap items-end gap-3" onsubmit={saveProtocol}>
					<label class="flex flex-col gap-1">
						<span class="label">DURATION (MIN)</span>
						<input class="field w-28" name="minutes" type="number" min="0.5" step="0.5" value={proto.durationSec / 60} />
					</label>
					{#if proto.flow === 'grid'}
						<label class="flex flex-col gap-1">
							<span class="label">BINGO LINE BONUS</span>
							<input class="field w-28" name="lineBonus" type="number" min="0" value={proto.lineBonus} />
						</label>
					{/if}
					<Btn type="submit" size="sm">SAVE</Btn>
					<span class="label ml-auto">FLOW: {proto.flow}</span>
				</form>
			</Frame>
		{/if}

		<Frame label="CHALLENGES // {list.length}" pad={false}>
			{#snippet meta()}<button class="hover:text-phos" onclick={create}>+ NEW</button>{/snippet}
			<div class="overflow-x-auto">
				<table class="w-full min-w-[560px] text-left text-sm">
					<thead>
						<tr class="label">
							<th class="px-3 py-2 font-normal">#</th>
							<th class="px-3 py-2 font-normal">TITLE</th>
							<th class="px-3 py-2 font-normal">DIFF</th>
							<th class="px-3 py-2 text-right font-normal">MAX XP</th>
							<th class="px-3 py-2 text-right font-normal">TIME</th>
							<th class="px-3 py-2 font-normal">LIVE</th>
						</tr>
					</thead>
					<tbody>
						{#each list as c (c.id)}
							<tr class="cursor-pointer border-t border-line/60 hover:bg-wash {draft?.id === c.id ? 'bg-wash' : ''} {c.active ? '' : 'opacity-45'}" onclick={() => edit(c)}>
								<td class="px-3 py-2 text-faint">{c.order + 1}</td>
								<td class="px-3 py-2"><span class="text-phos">{c.tag}</span> {c.title}</td>
								<td class="label px-3 py-2">{c.difficulty}</td>
								<td class="px-3 py-2 text-right tabular-nums">{maxXp(c.baseXp, c.difficulty)}</td>
								<td class="px-3 py-2 text-right tabular-nums">{c.timeLimitSec ? `${c.timeLimitSec}s${c.hardTimeout ? '!' : ''}` : '—'}</td>
								<td class="px-3 py-2">
									<button
										class="label {c.active ? 'text-ok!' : ''}"
										onclick={(e) => {
											e.stopPropagation();
											void toggle(c);
										}}>{c.active ? 'ON' : 'OFF'}</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Frame>
	</div>

	<div>
		{#if draft}
			<Frame label={isNew ? 'NEW CHALLENGE' : `EDIT ${draft.id}`} tone="hot">
				<form class="grid grid-cols-2 gap-3 text-sm" onsubmit={save}>
					<label class="col-span-1 flex flex-col gap-1"><span class="label">ID</span><input class="field" bind:value={draft.id} readonly={!isNew} required /></label>
					<label class="flex flex-col gap-1"><span class="label">ORDER</span><input class="field" type="number" bind:value={draft.order} /></label>
					<label class="col-span-2 flex flex-col gap-1"><span class="label">TITLE (visible before opening — no spoilers)</span><input class="field" bind:value={draft.title} required /></label>
					<label class="flex flex-col gap-1"><span class="label">TAG</span><input class="field" bind:value={draft.tag} maxlength="24" /></label>
					<label class="flex flex-col gap-1">
						<span class="label">KIND</span>
						<select class="field" bind:value={draft.kind}><option value="text">text answer</option><option value="choice">multiple choice</option></select>
					</label>
					<label class="col-span-2 flex flex-col gap-1"><span class="label">PROMPT</span><textarea class="field min-h-20" bind:value={draft.prompt} required></textarea></label>
					{#if draft.kind === 'choice'}
						<label class="col-span-2 flex flex-col gap-1"><span class="label">OPTIONS (one per line)</span><textarea class="field min-h-24" bind:value={draft.optionsText}></textarea></label>
					{/if}
					<label class="col-span-2 flex flex-col gap-1">
						<span class="label">ACCEPTED ANSWERS (one per line{draft.kind === 'choice' ? ', must match an option exactly' : ', case/spacing insensitive'})</span>
						<textarea class="field min-h-16" bind:value={draft.answersText} required></textarea>
					</label>
					<label class="flex flex-col gap-1"><span class="label">BASE XP</span><input class="field" type="number" min="0" bind:value={draft.baseXp} /></label>
					<label class="flex flex-col gap-1">
						<span class="label">DIFFICULTY</span>
						<select class="field" bind:value={draft.difficulty}>
							<option value="easy">easy ×1</option><option value="medium">medium ×1.25</option><option value="hard">hard ×1.5</option><option value="boss">boss ×2</option>
						</select>
					</label>
					<label class="flex flex-col gap-1"><span class="label">TIME LIMIT (s, empty = fixed XP)</span><input class="field" type="number" min="1" bind:value={draft.timeLimitSec} /></label>
					<label class="flex flex-col gap-1"><span class="label">MAX ATTEMPTS</span><input class="field" type="number" min="1" max="10" bind:value={draft.maxAttempts} /></label>
					<label class="label flex items-center gap-2"><input type="checkbox" bind:checked={draft.hardTimeout} class="accent-[var(--phos)]" /> HARD TIMEOUT</label>
					<label class="label flex items-center gap-2"><input type="checkbox" bind:checked={draft.active} class="accent-[var(--phos)]" /> ACTIVE</label>
					<label class="col-span-2 flex flex-col gap-1"><span class="label">REVEAL (shown after the node closes — keys, unlock text)</span><input class="field" bind:value={draft.reveal} /></label>
					<label class="col-span-2 flex flex-col gap-1"><span class="label">HINT (shown after the first wrong try)</span><input class="field" bind:value={draft.hint} /></label>
					<label class="col-span-2 flex flex-col gap-1">
						<span class="label">BLOCKS (JSON: text · code · log · table · note)</span>
						<textarea class="field min-h-32 font-mono text-xs" bind:value={draft.blocksText} spellcheck="false"></textarea>
					</label>
					<div class="col-span-2 flex flex-wrap items-center gap-2">
						<Btn type="submit" busy={saving}>SAVE</Btn>
						<Btn type="button" variant="ghost" onclick={() => (draft = null)}>CANCEL</Btn>
						{#if !isNew}<Btn type="button" variant="danger" class="ml-auto" onclick={() => remove(draft!.id)}>DELETE</Btn>{/if}
						<span class="label w-full">MAX XP → {maxXp(Number(draft.baseXp) || 0, draft.difficulty)}</span>
					</div>
				</form>
			</Frame>
		{:else}
			<Frame label="EDITOR" tone="dim">
				<p class="text-sm text-mute">Select a challenge to edit it, or create a new one. Changes go live within seconds — avoid editing a protocol while it is running.</p>
			</Frame>
		{/if}
	</div>
</div>
