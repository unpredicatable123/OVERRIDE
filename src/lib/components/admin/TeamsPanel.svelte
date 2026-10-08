<script lang="ts">
	import Btn from '#lib/components/Btn.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import { api } from '#lib/client/api.ts';
	import { fmt } from '#lib/client/clock.svelte.ts';
	import type { AdminTeamRow } from '#lib/engine/views.ts';

	let { teams, onchange, toast }: { teams: AdminTeamRow[]; onchange: () => void; toast: (m: string, bad?: boolean) => void } = $props();

	const PAGE = 20;
	let q = $state('');
	let page = $state(0);
	let reveal = $state<Set<string>>(new Set());
	let form = $state({ name: '', p1: '', p2: '' });
	let created = $state<{ id: string; name: string; accessKey: string } | null>(null);

	const filtered = $derived.by(() => {
		const s = q.trim().toLowerCase();
		if (!s) return teams;
		return teams.filter((t) => t.id.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || t.players.some((p) => p.toLowerCase().includes(s)));
	});
	const pages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE)));
	const rows = $derived(filtered.slice(page * PAGE, page * PAGE + PAGE));
	$effect(() => {
		if (page >= pages) page = pages - 1;
	});

	async function op(body: Record<string, unknown>, confirmText?: string) {
		if (confirmText && !confirm(confirmText)) return;
		try {
			const res = await api<{ team?: { id: string; name: string; accessKey: string }; created?: number }>('/api/admin/teams', body);
			if (res.team) created = res.team;
			if (res.created !== undefined) toast(`${res.created} demo teams created`);
			onchange();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Failed', true);
		}
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		await op({ op: 'create', name: form.name, players: [form.p1, form.p2] });
		form = { name: '', p1: '', p2: '' };
	}

	function toggleKey(id: string) {
		const next = new Set(reveal);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		reveal = next;
	}

	function exportCsv() {
		const lines = [['TEAM ID', 'TEAM', 'PLAYER 1', 'PLAYER 2', 'ACCESS KEY'], ...teams.map((t) => [t.id, t.name, ...t.players, t.accessKey])];
		const csv = lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		const a = Object.assign(document.createElement('a'), { href: url, download: 'override-teams.csv' });
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
	<Frame label="TEAMS // {teams.length}" pad={false}>
		{#snippet meta()}
			<button class="hover:text-phos" onclick={exportCsv}>⇩ EXPORT CREDENTIALS</button>
		{/snippet}
		<div class="flex flex-wrap items-center gap-2 border-b border-line p-3">
			<input class="field max-w-xs py-2!" placeholder="search team, ID or player" bind:value={q} oninput={() => (page = 0)} />
			<span class="label ml-auto">{filtered.length} MATCH</span>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full min-w-[760px] text-left text-sm">
				<thead>
					<tr class="label">
						<th class="px-3 py-2 font-normal">ID</th>
						<th class="px-3 py-2 font-normal">TEAM</th>
						<th class="px-3 py-2 font-normal">PLAYERS</th>
						<th class="px-3 py-2 font-normal">KEY</th>
						<th class="px-3 py-2 font-normal">STAGE</th>
						<th class="px-3 py-2 text-right font-normal">SOLVED</th>
						<th class="px-3 py-2 text-right font-normal">XP</th>
						<th class="px-3 py-2 font-normal"></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as t (t.id)}
						<tr class="border-t border-line/60 {t.disabled ? 'opacity-45' : ''}">
							<td class="px-3 py-2"><span class="flex items-center gap-2 text-phos"><TeamAvatar id={t.id} name={t.name} size={20} />{t.id}</span></td>
							<td class="px-3 py-2 font-bold tracking-wider">
								{t.name}
								{#if t.joinedAt}<span class="ml-1 text-ok" title="Logged in">●</span>{/if}
								{#if t.disabled}<span class="label ml-1 text-bad!">DISABLED</span>{/if}
							</td>
							<td class="px-3 py-2 text-mute">{t.players[0]} · {#if t.players[1]}{t.players[1]}{:else}<span class="text-ink">invite pending</span>{/if}</td>
							<td class="px-3 py-2">
								<button class="tracking-[0.2em] hover:text-phos" onclick={() => toggleKey(t.id)}>{reveal.has(t.id) ? t.accessKey : '••••••'}</button>
							</td>
							<td class="px-3 py-2 text-xs tracking-[0.15em] {t.stage === 'BOSS GATE' ? 'text-ok' : 'text-mute'}">{t.stage ?? '—'}</td>
							<td class="px-3 py-2 text-right tabular-nums">{t.solved}</td>
							<td class="px-3 py-2 text-right tabular-nums text-phos">{fmt(t.xp)}</td>
							<td class="px-3 py-2">
								<div class="flex justify-end gap-1 whitespace-nowrap">
									<Btn size="sm" variant="ghost" onclick={() => op({ op: t.disabled ? 'enable' : 'disable', teamId: t.id })}>{t.disabled ? 'ENABLE' : 'DISABLE'}</Btn>
									<Btn size="sm" variant="ghost" onclick={() => op({ op: 'rekey', teamId: t.id }, `Issue a new access key for ${t.name}? The old key stops working for new logins.`)}>REKEY</Btn>
									<Btn size="sm" variant="danger" onclick={() => op({ op: 'reset', teamId: t.id }, `Reset ALL progress for ${t.name}? Their round clocks restart and they get freshly generated questions.`)}>RESET</Btn>
									<Btn size="sm" variant="danger" onclick={() => op({ op: 'delete', teamId: t.id }, `Delete ${t.name} permanently?`)}>✕</Btn>
								</div>
							</td>
						</tr>
					{:else}
						<tr><td colspan="8" class="label px-3 py-8 text-center">NO TEAMS</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if pages > 1}
			<div class="flex items-center justify-between border-t border-line p-3">
				<Btn size="sm" variant="ghost" disabled={page === 0} onclick={() => page--}>‹ PREV</Btn>
				<span class="label">PAGE {page + 1}/{pages}</span>
				<Btn size="sm" variant="ghost" disabled={page >= pages - 1} onclick={() => page++}>NEXT ›</Btn>
			</div>
		{/if}
	</Frame>

	<div class="flex flex-col gap-5">
		<Frame label="REGISTER TEAM">
			<form class="flex flex-col gap-3" onsubmit={create}>
				<input class="field uppercase" placeholder="TEAM NAME" maxlength="24" bind:value={form.name} required />
				<input class="field" placeholder="Player 01" maxlength="24" bind:value={form.p1} required />
				<input class="field" placeholder="Player 02" maxlength="24" bind:value={form.p2} required />
				<Btn type="submit">CREATE TEAM</Btn>
			</form>
			{#if created}
				<div class="anim-scan mt-4 border border-ok/50 bg-ok/5 p-3">
					<div class="label text-ok!">ISSUED</div>
					<div class="mt-1 font-bold">{created.name}</div>
					<div class="display text-3xl text-phos">{created.id} · {created.accessKey}</div>
				</div>
			{/if}
		</Frame>
		<Frame label="TEST DATA">
			<p class="mb-3 text-xs text-mute">Creates 42 realistic demo teams with generated keys. Existing names are skipped.</p>
			<Btn variant="ghost" onclick={() => op({ op: 'seed' })}>SEED 42 DEMO TEAMS</Btn>
		</Frame>
	</div>
</div>
