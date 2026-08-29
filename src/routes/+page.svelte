<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { pickBotNames } from '$lib/clabber';
	import JoinScreen from '$lib/components/JoinScreen.svelte';
	import Lobby from '$lib/components/Lobby.svelte';
	import Table from '$lib/components/Table.svelte';
	import ChatBox from '$lib/components/ChatBox.svelte';
	import { GameStore, joinExistingGame } from '$lib/repo/gameStore.svelte';
	import { Presence } from '$lib/repo/presence.svelte';
	import { Host } from '$lib/repo/host';

	let store = $state<GameStore | undefined>(undefined);
	let presence = $state<Presence | undefined>(undefined);
	let host = $state<Host | undefined>(undefined);
	let booting = $state(true);
	let bootError = $state('');
	let online = $state(true);

	function attach(s: GameStore) {
		store = s;
		// Put the code in the URL fragment so a reload rejoins the same game.
		// Fragment-only, so it never triggers a navigation or the SvelteKit router.
		if (location.hash.slice(1) !== s.code) {
			location.replace(`${location.pathname}${location.search}#${s.code}`);
		}
		const p = new Presence(s.handle, s.clientId);
		p.start();
		presence = p;

		// `?fast` (dev only) shrinks the bots' think-time — handy for manual
		// testing and end-to-end runs.
		const fast = dev && location.search.includes('fast');
		const h = new Host(
			s,
			p,
			fast
				? {
						minDelayMs: 15,
						maxDelayMs: 40,
						trickDelayMs: 40,
						interHandDelayMs: 60,
						redealDelayMs: 20
					}
				: {}
		);
		h.start();
		host = h;

		if (dev) {
			(globalThis as Record<string, unknown>).__clabber = { store: s, presence: p, host: h };
		}
	}

	/** Leave the table: hand our seat to a bot, tear down the live connections
	 *  and drop back to the join screen. */
	function leave() {
		const seat = store?.mySeat ?? null;
		if (store && seat != null) {
			const others = (store.doc?.players ?? [])
				.filter((p, i) => p != null && i !== seat)
				.map((p) => p!.name);
			store.tryChange({ type: 'LeaveTable', seat, botName: pickBotNames(1, others)[0] });
		}
		host?.stop();
		presence?.stop();
		host = undefined;
		presence = undefined;
		store = undefined;
		bootError = '';
		booting = false;
		if (dev) delete (globalThis as Record<string, unknown>).__clabber;
		// Drop the #code so a reload starts fresh at the join screen.
		history.replaceState(null, '', location.pathname + location.search);
	}

	onMount(() => {
		online = navigator.onLine;
		const setOn = () => (online = true);
		const setOff = () => (online = false);
		window.addEventListener('online', setOn);
		window.addEventListener('offline', setOff);

		const code = location.hash.replace(/^#+/, '');
		if (code) {
			joinExistingGame(code)
				.then((s) => {
					if (s) attach(s);
					else bootError = `No game with code "${code}".`;
				})
				.catch(() => (bootError = 'Could not reach the game server.'))
				.finally(() => (booting = false));
		} else {
			booting = false;
		}

		return () => {
			window.removeEventListener('online', setOn);
			window.removeEventListener('offline', setOff);
			host?.stop();
			presence?.stop();
		};
	});

	const phase = $derived(store?.doc?.phase);
</script>

{#if !online}
	<div
		class="fixed inset-x-0 top-0 z-50 bg-amber-500 py-1 text-center text-xs font-semibold text-amber-950"
		role="status"
	>
		Offline — the game will catch up when you're back on the network.
	</div>
{/if}

{#if booting}
	<div class="grid min-h-screen place-items-center bg-green-900 text-white/70">joining…</div>
{:else if store && presence && host}
	{#if phase === 'lobby'}
		<Lobby {store} {presence} onleave={leave} />
	{:else}
		<Table {store} {presence} {host} onleave={leave} />
	{/if}
	<ChatBox {store} />
{:else}
	<JoinScreen onjoined={attach} />
	{#if bootError}
		<p class="bg-green-900 pb-6 text-center text-sm text-red-300">{bootError}</p>
	{/if}
{/if}
