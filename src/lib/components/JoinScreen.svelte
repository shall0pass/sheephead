<script lang="ts">
	import { onMount } from 'svelte';
	import { normaliseCode, registryAvailable } from '$lib/repo/directory';
	import { JOIN_CODES_SUPPORTED } from '$lib/repo/repo';
	import { createNewGame, joinExistingGame, type GameStore } from '$lib/repo/gameStore.svelte';

	let { onjoined }: { onjoined: (store: GameStore) => void } = $props();

	let code = $state('');
	let busy = $state(false);
	let error = $state('');

	// Show the "secret code" box only when short join codes actually work: a
	// custom relay build (trusted outright) or a probe that finds the
	// same-origin `/games/:code` registry. On the public Automerge relay with
	// no registry there is nothing to type there, so it stays hidden.
	let codesUsable = $state(JOIN_CODES_SUPPORTED);
	onMount(async () => {
		if (!codesUsable && (await registryAvailable())) codesUsable = true;
	});

	async function join() {
		error = '';
		busy = true;
		try {
			const store = await joinExistingGame(code);
			if (store) onjoined(store);
			else error = `No game with code "${normaliseCode(code)}".`;
		} catch {
			error = 'Could not reach the game server.';
		} finally {
			busy = false;
		}
	}

	async function create() {
		error = '';
		busy = true;
		try {
			onjoined(await createNewGame());
		} catch {
			error = 'Could not create a game.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-green-900 p-6 text-white">
	<div class="w-full max-w-sm rounded-2xl bg-green-950/60 p-8 shadow-xl ring-1 ring-white/10">
		<h1 class="mb-1 text-center text-3xl font-bold tracking-wide">Clabber</h1>
		<p class="mb-6 text-center text-sm text-white/60">
			{#if codesUsable}
				Enter your friends' secret code to join.
			{:else}
				Start a game, then share the invite link with your friends.
			{/if}
		</p>

		{#if codesUsable}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					join();
				}}
			>
				<input
					bind:value={code}
					oninput={() => (code = code.toUpperCase())}
					placeholder="SECRET CODE"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					class="w-full rounded-lg border-0 bg-white/10 px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] text-white uppercase placeholder:tracking-normal placeholder:text-white/30 focus:ring-2 focus:ring-green-400 focus:outline-none"
				/>
				<button
					type="submit"
					disabled={busy || normaliseCode(code).length < 4}
					class="mt-3 w-full rounded-lg bg-green-500 py-3 font-semibold text-green-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Join game
				</button>
			</form>

			<div class="my-5 flex items-center gap-3 text-xs text-white/40">
				<span class="h-px flex-1 bg-white/15"></span>or<span class="h-px flex-1 bg-white/15"></span>
			</div>
		{/if}

		<button
			onclick={create}
			disabled={busy}
			class="w-full rounded-lg py-3 font-semibold transition disabled:opacity-40 {codesUsable
				? 'bg-white/10 hover:bg-white/20'
				: 'bg-green-500 text-green-950 hover:bg-green-400'}"
		>
			Start a new game
		</button>

		{#if error}
			<p class="mt-4 text-center text-sm text-red-300">{error}</p>
		{/if}

		<p class="mt-6 text-center text-[11px] leading-snug text-white/35">
			{#if codesUsable}
				Friendly game: everyone's cards live in the shared data, so don't go poking at it.
			{:else}
				Already have an invite link? Just open it. Friendly game: everyone's cards live in the
				shared data, so don't go poking at it.
			{/if}
		</p>
	</div>
</div>
