<script lang="ts">
	import { enhance } from '$app/forms';
	import Btn from '#lib/components/Btn.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import ChallengesPanel from '#lib/components/admin/ChallengesPanel.svelte';
	import ControlPanel from '#lib/components/admin/ControlPanel.svelte';
	import TeamsPanel from '#lib/components/admin/TeamsPanel.svelte';
	import { api } from '#lib/client/api.ts';
	import { arena } from '#lib/client/arena.svelte.ts';
	import { clock } from '#lib/client/clock.svelte.ts';
	import { setAccent, type Accent } from '#lib/client/colors.ts';
	import type { AdminOverview } from '#lib/engine/views.ts';

	let { data, form } = $props();

	let tab = $state<'control' | 'teams' | 'challenges'>('control');
	let overview = $state<AdminOverview | null>(null);
	let toastMsg = $state<{ text: string; bad: boolean } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	function toast(text: string, bad = false) {
		toastMsg = { text, bad };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastMsg = null), 3200);
	}

	async function loadOverview() {
		try {
			overview = await api<AdminOverview>('/api/admin/overview');
			arena.apply(overview.snapshot);
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Overview failed', true);
		}
	}

	$effect(() => {
		if (!data.authed) return;
		const off = arena.connect();
		const offClock = clock.use();
		void loadOverview();
		return () => {
			off();
			offClock();
			clearTimeout(toastTimer);
		};
	});

	// Re-derive legal actions whenever the state version moves; refresh the team table periodically.
	let lastVersion = -1;
	$effect(() => {
		const v = arena.snapshot?.state.version ?? -1;
		if (data.authed && v !== lastVersion) {
			lastVersion = v;
			if (overview && overview.snapshot.state.version !== v) void loadOverview();
		}
	});
	$effect(() => {
		if (!data.authed || tab !== 'teams') return;
		const t = setInterval(loadOverview, 8000);
		return () => clearInterval(t);
	});

	const snap = $derived(arena.snapshot ?? overview?.snapshot ?? null);
	const accent = $derived.by((): Accent => {
		const m = snap?.board.mode;
		if (m === 'final') return 'final';
		if (m === 'boss') return 'override';
		const ph = snap?.state.phase;
		return snap?.state.protocol && ph !== 'EVENT_IDLE' && ph !== 'EVENT_LOBBY' ? snap.state.protocol : 'lobby';
	});
	// Each protocol re-tints the whole interface; the boss fight goes red, the finale gold.
	$effect(() => {
		setAccent(accent);
		return () => setAccent(null);
	});
</script>

<svelte:head><title>Admin // OVERRIDE</title></svelte:head>

{#if !data.authed}
	<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
		<Logo size="md" class="mb-6" />
		<Frame label="ADMIN CONSOLE // RESTRICTED">
			<form method="POST" action="?/login" use:enhance class="flex flex-col gap-4">
				<label class="flex flex-col gap-1.5">
					<span class="label">ADMIN KEY</span>
					<input class="field" type="password" name="key" autocomplete="current-password" required />
				</label>
				{#if form?.message}<p class="anim-bad text-sm text-bad">{form.message}</p>{/if}
				<Btn type="submit" block>AUTHENTICATE</Btn>
			</form>
		</Frame>
	</main>
{:else}
	<header class="sticky top-0 z-50 border-b border-line bg-void/90 backdrop-blur-md">
		<div class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
			<div class="flex items-baseline gap-3">
				<Logo size="sm" />
				<span class="label">// ADMIN CONSOLE</span>
				<span class="text-xs {arena.online ? 'text-ok' : 'text-bad'}">● {arena.online ? 'LIVE' : 'RECONNECTING'}</span>
			</div>
			<nav class="flex gap-1" aria-label="Admin sections">
				{#each [['control', 'CONTROL'], ['teams', 'TEAMS'], ['challenges', 'CHALLENGES']] as const as [id, label] (id)}
					<button
						class="label border px-3 py-1.5 {tab === id ? 'border-phos text-phos!' : 'border-transparent hover:text-ink!'}"
						onclick={() => {
							tab = id;
							if (id === 'teams') void loadOverview();
						}}>{label}</button
					>
				{/each}
			</nav>
			<div class="ml-auto flex items-center gap-4">
				<a href="/arena" target="_blank" rel="noopener" class="label hover:text-phos!">◱ OPEN ARENA DISPLAY ↗</a>
				<form method="POST" action="?/logout" use:enhance><button class="label hover:text-bad!">LOGOUT</button></form>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-[1600px] px-4 pt-5 pb-24">
		{#if !snap || !overview}
			<p class="display py-20 text-center text-3xl text-phos-dim anim-pulse">SYNCING…</p>
		{:else if tab === 'control'}
			<ControlPanel {snap} actions={overview.snapshot.state.version === snap.state.version ? overview.actions : []} generation={overview.generation} onchange={loadOverview} {toast} />
		{:else if tab === 'teams'}
			<TeamsPanel teams={overview.teams} onchange={loadOverview} {toast} />
		{:else}
			<ChallengesPanel {toast} />
		{/if}
	</main>

	{#if toastMsg}
		<div
			class="anim-rise fixed bottom-16 left-1/2 z-[85] -translate-x-1/2 border bg-panel px-4 py-2 text-sm {toastMsg.bad ? 'border-bad/60 text-bad' : 'border-ok/60 text-ok'}"
			role="status"
		>
			{toastMsg.text}
		</div>
	{/if}
{/if}
