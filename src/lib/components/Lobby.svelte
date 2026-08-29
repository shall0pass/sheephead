<script lang="ts">
	import { SEATS, pickBotNames } from '$lib/sheephead';
	import type { Seat as SeatIndex } from '$lib/sheephead/types';
	import type { GameStore } from '$lib/repo/gameStore.svelte';
	import type { Presence } from '$lib/repo/presence.svelte';
	import SeatSlot from './Seat.svelte';
	import LeaveButton from './LeaveButton.svelte';

	let { store, presence, onleave }: { store: GameStore; presence: Presence; onleave: () => void } =
		$props();

	const NAME_KEY = 'sheephead:name';
	let preferredName = $state(readName());
	function readName(): string {
		try {
			return localStorage.getItem(NAME_KEY) ?? '';
		} catch {
			return '';
		}
	}
	function rememberName(name: string) {
		preferredName = name;
		try {
			localStorage.setItem(NAME_KEY, name);
		} catch {
			/* ignore */
		}
	}

	const doc = $derived(store.doc);
	const players = $derived(doc?.players ?? [null, null, null, null, null]);
	const mySeat = $derived(store.mySeat);
	const baseSeat = $derived(mySeat ?? 0);
	const filled = $derived(players.every((p) => p != null));
	const hasHuman = $derived(players.some((p) => p != null && !p.isBot));

	// Screen slots, clockwise from the local player at the bottom.
	const slotClass = [
		'area-bottom',
		'area-mid-right',
		'area-top-right',
		'area-top-left',
		'area-mid-left'
	];
	function slotFor(seat: SeatIndex) {
		return slotClass[(seat - baseSeat + 5) % 5];
	}

	function sit(seat: SeatIndex) {
		if (mySeat != null && mySeat !== seat) store.change({ type: 'LeaveSeat', seat: mySeat });
		store.change({ type: 'JoinSeat', seat, name: preferredName, actorId: store.clientId });
	}
	function leave(seat: SeatIndex) {
		store.change({ type: 'LeaveSeat', seat });
	}
	function rename(seat: SeatIndex, name: string) {
		rememberName(name);
		store.change({ type: 'RenameSeat', seat, name });
	}
	function removeBot(seat: SeatIndex) {
		store.change({ type: 'SetBot', seat, isBot: false });
	}
	function fillWithBots() {
		const empties = SEATS.filter((s) => players[s] == null);
		const names = pickBotNames(
			empties.length,
			players.filter((p) => p != null).map((p) => p!.name)
		);
		empties.forEach((seat, i) =>
			store.change({ type: 'SetBot', seat, isBot: true, botName: names[i] })
		);
	}
	function deal() {
		if (!filled) fillWithBots();
		store.change({ type: 'StartHand', seed: crypto.randomUUID() });
	}

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${store.code}`);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* ignore */
		}
	}
</script>

<div class="relative flex min-h-screen flex-col items-center gap-6 bg-green-900 p-6 text-white">
	<div class="absolute top-4 left-4">
		<LeaveButton {onleave} />
	</div>

	<header class="flex flex-col items-center gap-1">
		<h1 class="text-xl font-bold tracking-wide">Sheephead lobby</h1>
		{#if store.code && store.code.length <= 8}
			<button
				onclick={copyLink}
				class="rounded-lg bg-green-950/60 px-3 py-1.5 font-mono text-lg tracking-[0.35em] ring-1 ring-white/10 hover:ring-green-400"
				title="Copy invite link"
			>
				{store.code}
			</button>
		{:else}
			<button
				onclick={copyLink}
				class="rounded-lg bg-green-950/60 px-3 py-1.5 text-sm ring-1 ring-white/10 hover:ring-green-400"
			>
				📋 Copy invite link
			</button>
		{/if}
		<span class="h-4 text-xs text-green-300">{copied ? 'link copied!' : ''}</span>
	</header>

	<div class="table-grid">
		{#each SEATS as seat (seat)}
			<div class={slotFor(seat)}>
				<SeatSlot
					player={players[seat]}
					online={players[seat]?.isBot || presence.isOnline(players[seat]?.actorId)}
					isMe={seat === mySeat}
					relation={seat === mySeat ? 'you' : 'opponent'}
					canSit={players[seat] == null}
					canMove={mySeat != null}
					onsit={() => sit(seat)}
					onleave={() => leave(seat)}
					onrename={(name) => rename(seat, name)}
					onremovebot={() => removeBot(seat)}
				/>
			</div>
		{/each}
		<div class="area-center felt">
			<p class="text-sm text-white/70">
				{#if mySeat == null}
					Pick a seat to join.
				{:else}
					You're seated. Teams form each hand once the picker calls a partner.
				{/if}
			</p>
		</div>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-3">
		<button
			onclick={fillWithBots}
			disabled={filled}
			class="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
		>
			Fill empty seats with computers
		</button>
		<button
			onclick={deal}
			disabled={!hasHuman}
			class="rounded-lg bg-green-500 px-6 py-2 font-bold text-green-950 hover:bg-green-400 disabled:opacity-40"
			title={!hasHuman ? 'At least one human must be seated' : ''}
		>
			Deal
		</button>
	</div>
</div>

<style>
	.table-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-rows: repeat(3, auto);
		gap: 1rem;
		place-items: center;
		width: min(92vw, 640px);
	}
	.area-top-left {
		grid-area: 1 / 1;
	}
	.area-top-right {
		grid-area: 1 / 3;
	}
	.area-mid-left {
		grid-area: 2 / 1;
	}
	.area-mid-right {
		grid-area: 2 / 3;
	}
	.area-bottom {
		grid-area: 3 / 2;
	}
	.area-center {
		grid-area: 2 / 2;
	}
	.felt {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 1;
		max-width: 220px;
		padding: 1.5rem;
		text-align: center;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 40%, #157a4a, #0a5c36 70%);
		box-shadow:
			inset 0 0 40px rgb(0 0 0 / 0.35),
			0 10px 30px rgb(0 0 0 / 0.3);
	}
</style>
