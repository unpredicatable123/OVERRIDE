<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Btn from '#lib/components/Btn.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import InviteCard from '#lib/components/InviteCard.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import { setAccent } from '#lib/client/colors.ts';
	import { scene } from '#lib/client/scene.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';

	let { data, form } = $props();

	let tab = $state<'login' | 'register'>('register');
	let busy = $state(false);

	$effect(() => {
		setAccent('lobby');
		scene.set('calm', 0.8);
	});

	$effect(() => {
		if (form?.mode === 'register') tab = 'register';
		if (form?.mode === 'login') tab = 'login';
		if (form?.message) sound.play('deny');
		if (form?.mode === 'registered') sound.play('unlock');
	});

	const submit = () => {
		busy = true;
		// No refreshAll: re-running load would redirect the fresh session to /play before the
		// captain sees their access key and the invite QR.
		return async ({ result, update }: { result: { type: string }; update: (o?: { refreshAll?: boolean }) => Promise<void> }) => {
			busy = false;
			if (result.type === 'redirect') await update();
			else await update({ refreshAll: false });
		};
	};
</script>

<svelte:head><title>Sign in · OVERRIDE</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
	<a href="/" class="mb-3 self-center"><Logo size="sm" /></a>
	<p class="mb-10 text-center text-sm text-mute">Teams of two. Everyone against everyone.</p>

	{#if form?.mode === 'registered' && form.team}
		{@const t = form.team}
		<Frame label="Team created" tone="hot" class="anim-rise">
			<div class="flex items-center gap-4">
				<TeamAvatar id={t.id} name={t.name} size={56} />
				<div class="min-w-0">
					<div class="display truncate text-3xl text-ink">{t.name}</div>
					<div class="mt-1 text-sm text-mute">Captain · <span class="text-ink">{t.captain}</span></div>
				</div>
			</div>
			<div class="mt-6 grid grid-cols-2 gap-3">
				<div class="tile p-3.5">
					<div class="label">Team ID</div>
					<div class="mt-1 font-mono text-xl text-ink">{t.id}</div>
				</div>
				<div class="tile p-3.5">
					<div class="label">Access key</div>
					<div class="mt-1 font-mono text-xl tracking-[0.15em] text-ink">{t.accessKey}</div>
				</div>
			</div>
			<p class="mt-3 text-xs text-mute">Keep these — either of you can sign in with them later.</p>

			{#if t.invite}
				<div class="rule my-7"></div>
				<p class="mb-1 text-center font-medium text-ink">Invite your teammate</p>
				<p class="mb-6 text-center text-sm text-mute">They scan this code or open the link — no typing needed.</p>
				<InviteCard code={t.invite} teamName={t.name} />
			{/if}
			<Btn block size="lg" class="mt-7" onclick={() => goto('/play')}>Enter the arena</Btn>
		</Frame>
	{:else}
		<div class="tabs relative mb-5 grid grid-cols-2 rounded-full p-1" role="tablist">
			<span class="thumb" style:transform="translateX({tab === 'register' ? '0%' : '100%'})" aria-hidden="true"></span>
			{#each [['register', 'Create a team'], ['login', 'Sign in']] as const as [id, label] (id)}
				<button
					role="tab"
					aria-selected={tab === id}
					class="relative rounded-full py-2.5 text-sm font-medium transition-colors duration-300 {tab === id ? 'text-ink' : 'text-mute hover:text-ink'}"
					onclick={() => (tab = id)}>{label}</button
				>
			{/each}
		</div>

		{#key tab}
			<div class="anim-rise">
				{#if tab === 'register'}
					<Frame label="New team">
						<form method="POST" action="?/register" use:enhance={submit} class="flex flex-col gap-4">
							<label class="flex flex-col gap-2">
								<span class="label">Team name</span>
								<input class="field uppercase" name="name" maxlength="24" placeholder="BYTEFORCE" required autocomplete="off" />
							</label>
							<label class="flex flex-col gap-2">
								<span class="label">Your name</span>
								<input class="field" name="p1" maxlength="24" placeholder="e.g. Arun" required autocomplete="given-name" />
							</label>
							{#if data.codeRequired}
								<label class="flex flex-col gap-2">
									<span class="label">Event code</span>
									<input class="field uppercase" name="joinCode" required autocomplete="off" />
								</label>
							{/if}
							<p class="text-xs leading-relaxed text-mute">Next, you'll get a QR code and invite link for your teammate.</p>
							{#if form?.message}<p class="anim-bad text-sm text-bad" role="alert">{form.message}</p>{/if}
							<Btn type="submit" block size="lg" {busy}>Create team</Btn>
						</form>
					</Frame>
				{:else}
					<Frame label="Team sign in">
						<form method="POST" action="?/login" use:enhance={submit} class="flex flex-col gap-4">
							<label class="flex flex-col gap-2">
								<span class="label">Team ID</span>
								<input
									class="field font-mono uppercase"
									name="teamId"
									placeholder="OV-042"
									autocomplete="username"
									autocapitalize="characters"
									required
									value={form && 'teamId' in form ? form.teamId : ''}
								/>
							</label>
							<label class="flex flex-col gap-2">
								<span class="label">Access key</span>
								<input
									class="field font-mono tracking-[0.3em] uppercase"
									name="accessKey"
									placeholder="••••••"
									autocomplete="current-password"
									autocapitalize="characters"
									required
								/>
							</label>
							{#if form?.message}<p class="anim-bad text-sm text-bad" role="alert">{form.message}</p>{/if}
							<Btn type="submit" block size="lg" {busy}>Sign in</Btn>
						</form>
					</Frame>
					<p class="mt-5 text-center text-xs text-mute">Got an invite? Open the link or scan the code your teammate shows you.</p>
				{/if}
			</div>
		{/key}

		<p class="mt-8 text-center text-xs text-mute">
			Just looking? <a href="/demo" class="text-ink underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-white/60">Try the demo</a> — no sign-up needed.
		</p>
	{/if}
</main>

<style>
	.tabs {
		background: rgb(255 255 255 / 0.04);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07);
	}
	.thumb {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 4px;
		width: calc(50% - 4px);
		border-radius: 999px;
		background: rgb(255 255 255 / 0.09);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
		transition: transform 450ms var(--ease);
	}
</style>
