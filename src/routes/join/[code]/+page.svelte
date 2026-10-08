<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Btn from '#lib/components/Btn.svelte';
	import Frame from '#lib/components/Frame.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import TeamAvatar from '#lib/components/TeamAvatar.svelte';
	import { setAccent } from '#lib/client/colors.ts';
	import { scene } from '#lib/client/scene.svelte.ts';
	import { sound } from '#lib/client/sound.svelte.ts';

	let { data, form } = $props();
	let busy = $state(false);

	$effect(() => {
		setAccent('lobby');
		scene.set('calm', 0.8);
	});
	$effect(() => {
		if (form?.message) sound.play('deny');
	});
</script>

<svelte:head><title>{data.invite ? `Join ${data.invite.name}` : 'Invite'} · OVERRIDE</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
	<div class="mb-10 flex justify-center"><Logo size="sm" /></div>

	{#if !data.invite || data.invite.full}
		<Frame label={data.invite ? 'Team full' : 'Invite unavailable'} tone="bad">
			<p class="text-ink">
				{data.invite ? `${data.invite.name} already has two players.` : 'This invite link is invalid or has expired.'}
			</p>
			<p class="mt-2 text-sm text-mute">Ask your teammate for a fresh link, or sign in with your team ID and access key.</p>
			<div class="mt-6"><Btn variant="ghost" onclick={() => goto('/login')}>Go to sign in</Btn></div>
		</Frame>
	{:else}
		{@const inv = data.invite}
		<div class="anim-rise text-center">
			<p class="label mb-6 tracking-[0.3em]!">You've been invited</p>
			<div class="flex justify-center"><TeamAvatar id={inv.teamId} name={inv.name} size={72} /></div>
			<h1 class="display iris mt-5 text-4xl sm:text-5xl">{inv.name}</h1>
			<p class="mt-3 text-mute"><span class="text-ink">{inv.captain}</span> wants you as their teammate.</p>
		</div>

		<Frame class="anim-rise mt-10">
			<div class="grid grid-cols-2 gap-3 text-center">
				<div class="tile p-3.5">
					<div class="label">Player 1</div>
					<div class="mt-1 font-medium text-ink">{inv.captain}</div>
				</div>
				<div class="slot tile p-3.5">
					<div class="label">Player 2</div>
					<div class="mt-1 font-medium text-mute anim-pulse">You</div>
				</div>
			</div>
			<form
				method="POST"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						busy = false;
						await update();
					};
				}}
				class="mt-6 flex flex-col gap-3"
			>
				<label class="flex flex-col gap-2">
					<span class="label">Your name</span>
					<input class="field" name="name" maxlength="24" placeholder="e.g. Karthi" required autocomplete="given-name" />
				</label>
				{#if form?.message}<p class="anim-bad text-sm text-bad" role="alert">{form.message}</p>{/if}
				<Btn type="submit" block size="lg" {busy}>Join {inv.name}</Btn>
			</form>
		</Frame>
	{/if}
</main>

<style>
	.slot {
		border-style: dashed;
		border-color: rgb(255 255 255 / 0.18);
	}
</style>
