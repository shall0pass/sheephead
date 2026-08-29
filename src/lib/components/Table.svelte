<script lang="ts">
	import type { Card, Seat } from '$lib/sheephead/types';
	import { SEATS, legalMoves } from '$lib/sheephead';
	import type { GameStore } from '$lib/repo/gameStore.svelte';
	import type { Presence } from '$lib/repo/presence.svelte';
	import PlayerPlate from './PlayerPlate.svelte';
	import CardFan from './CardFan.svelte';
	import TrickArea from './TrickArea.svelte';
	import MyHand from './MyHand.svelte';
	import PickPanel from './PickPanel.svelte';
	import BuryPanel from './BuryPanel.svelte';
	import CallPartnerPanel from './CallPartnerPanel.svelte';
	import Scoreboard from './Scoreboard.svelte';
	import GameOver from './GameOver.svelte';
	import LogFeed from './LogFeed.svelte';
	import LeaveButton from './LeaveButton.svelte';

	let { store, presence, onleave }: { store: GameStore; presence: Presence; onleave: () => void } =
		$props();

	const doc = $derived(store.doc);
	const mySeat = $derived(store.mySeat);
	const base = $derived(mySeat ?? 0);

	function nameOf(s: Seat): string {
		return doc?.players[s]?.name ?? `Seat ${s + 1}`;
	}

	const slotClass = [
		'area-bottom',
		'area-mid-right',
		'area-top-right',
		'area-top-left',
		'area-mid-left'
	];
	const slotFor = (seat: Seat) => slotClass[(seat - base + 5) % 5];

	/** The seat we are currently waiting on to act. */
	const activeSeat = $derived.by<Seat | null>(() => {
		if (!doc) return null;
		if (doc.phase === 'picking') return doc.picking?.turn ?? null;
		if (doc.phase === 'bury' || doc.phase === 'callPartner') return doc.picker;
		if (doc.phase === 'trick') return doc.trick?.turn ?? null;
		return null;
	});

	const showPartner = $derived(
		!!doc && (doc.partnerRevealed || mySeat === doc.picker || mySeat === doc.partnerSeat)
	);

	const myLegal = $derived(
		doc && mySeat != null && doc.phase === 'trick' && doc.trick?.turn === mySeat
			? legalMoves(doc, mySeat)
			: null
	);

	let burySel = $state<Card[]>([]);
	// Reset the bury selection whenever a new hand's bury begins.
	$effect(() => {
		if (doc?.phase !== 'bury') burySel = [];
	});

	function toggleBury(c: Card) {
		burySel = burySel.includes(c)
			? burySel.filter((x) => x !== c)
			: burySel.length < 2
				? [...burySel, c]
				: [burySel[1], c];
	}
	function doBury() {
		if (burySel.length === 2)
			store.tryChange({ type: 'Bury', seat: mySeat as Seat, cards: [burySel[0], burySel[1]] });
	}
	function play(card: Card) {
		store.tryChange({ type: 'PlayCard', seat: mySeat as Seat, card });
	}
	function nextHand() {
		store.tryChange({ type: 'StartHand', seed: crypto.randomUUID() });
	}

	const iAmPicker = $derived(mySeat != null && mySeat === doc?.picker);
</script>

{#if doc}
	<div class="wrap">
		<div class="absolute top-2 left-2 z-30"><LeaveButton {onleave} /></div>
		<Scoreboard {doc} {nameOf} onnext={nextHand} />

		<div class="table-grid">
			{#each SEATS as seat (seat)}
				<div class={slotFor(seat)}>
					<div class="seat-stack">
						<PlayerPlate
							player={doc.players[seat]}
							online={doc.players[seat]?.isBot || presence.isOnline(doc.players[seat]?.actorId)}
							isMe={seat === mySeat}
							isDealer={seat === doc.dealer}
							isTurn={seat === activeSeat}
							isPicker={seat === doc.picker}
							isPartner={showPartner && seat === doc.partnerSeat && seat !== doc.picker}
							thinking={seat === activeSeat && !!doc.players[seat]?.isBot}
							passed={doc.phase === 'picking' && (doc.picking?.passed.includes(seat) ?? false)}
							tricks={doc.tricksWon[seat]?.length ?? 0}
						/>
						{#if seat !== mySeat}
							<CardFan count={doc.hands[seat]?.length ?? 0} />
						{/if}
					</div>
				</div>
			{/each}

			<div class="area-center">
				<TrickArea {doc} {nameOf} />
			</div>
		</div>

		<div class="dock">
			{#if doc.phase === 'picking' && mySeat != null}
				<PickPanel
					myTurn={activeSeat === mySeat}
					waitingOn={activeSeat != null ? nameOf(activeSeat) : '…'}
					onpick={() => store.tryChange({ type: 'Pick', seat: mySeat as Seat })}
					onpass={() => store.tryChange({ type: 'Pass', seat: mySeat as Seat })}
				/>
			{:else if doc.phase === 'bury' && iAmPicker}
				<BuryPanel selected={burySel} onbury={doBury} />
			{:else if doc.phase === 'bury'}
				<p class="muted">{nameOf(doc.picker as Seat)} is burying two cards…</p>
			{:else if doc.phase === 'callPartner' && iAmPicker}
				<CallPartnerPanel
					{doc}
					oncall={(c) => store.tryChange({ type: 'CallPartner', seat: mySeat as Seat, call: c })}
				/>
			{:else if doc.phase === 'callPartner'}
				<p class="muted">{nameOf(doc.picker as Seat)} is choosing a partner…</p>
			{/if}

			{#if mySeat != null && doc.hands[mySeat]?.length}
				<MyHand
					cards={doc.hands[mySeat]}
					legal={myLegal}
					selectable={doc.phase === 'bury' && iAmPicker}
					selected={burySel}
					onplay={play}
					ontoggle={toggleBury}
				/>
			{/if}
		</div>

		<LogFeed log={doc.log} players={doc.players} />
		{#if doc.phase === 'gameOver'}<GameOver {store} />{/if}
	</div>
{/if}

<style>
	.wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		min-height: 100vh;
		padding: 3rem 1rem 1rem;
		background: #0a5c36;
	}
	.table-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-rows: auto auto auto;
		gap: 1rem 2rem;
		place-items: center;
		width: min(96vw, 60rem);
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
	.seat-stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
	}
	.dock {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}
	.muted {
		color: rgb(255 255 255 / 0.6);
		font-size: 0.9rem;
	}
</style>
