<script lang="ts">
	import Card from './Card.svelte';
	import { legalBids } from '$lib/clabber/bidding';
	import { suitOf } from '$lib/clabber/cards';
	import { SUIT_NAME, SUIT_SYMBOL, isRedSuit } from '$lib/cards/display';
	import type { GameStore } from '$lib/repo/gameStore.svelte';
	import type { Bid, Seat } from '$lib/clabber/types';

	let { store }: { store: GameStore } = $props();

	const doc = $derived(store.doc);
	const mySeat = $derived(store.mySeat);
	const bidding = $derived(doc?.bidding ?? null);
	const myTurn = $derived(bidding != null && mySeat != null && bidding.turn === mySeat);
	const options = $derived(myTurn && doc && mySeat != null ? legalBids(doc, mySeat) : []);
	const turnName = $derived(
		bidding ? (doc?.players[bidding.turn]?.name ?? `seat ${bidding.turn}`) : ''
	);

	function label(bid: Bid): string {
		if (bid === 'pass') return 'Pass';
		if (bid === 'accept') {
			const s = doc?.upCard ? suitOf(doc.upCard) : undefined;
			return s ? `Play ${SUIT_NAME[s]}` : 'Play';
		}
		return `${SUIT_SYMBOL[bid.suit]} ${SUIT_NAME[bid.suit]}`;
	}

	function send(bid: Bid) {
		if (mySeat == null) return;
		store.tryChange({ type: 'Bid', seat: mySeat as Seat, bid });
	}
</script>

{#if bidding && doc}
	<div
		class="flex flex-col items-center gap-3 rounded-2xl bg-green-950/85 p-4 ring-1 ring-white/10"
	>
		<div class="flex items-center gap-3">
			{#if doc.upCard}
				<Card card={doc.upCard} height={72} />
			{/if}
			<div class="text-sm text-white/70">
				{#if bidding.round === 1}
					Round 1 — play or pass this suit
				{:else}
					Round 2 — name a suit (not
					<span class="font-semibold"
						>{bidding.passedSuit ? SUIT_NAME[bidding.passedSuit] : ''}</span
					>)
				{/if}
			</div>
		</div>

		{#if myTurn}
			<div class="flex flex-wrap justify-center gap-2">
				{#each options as opt (JSON.stringify(opt))}
					<button
						onclick={() => send(opt)}
						class="rounded-lg px-4 py-2 text-sm font-semibold
							{opt === 'pass'
							? 'bg-white/10 hover:bg-white/20'
							: 'bg-amber-300 text-green-950 hover:bg-amber-200'}
							{typeof opt === 'object' && isRedSuit(opt.suit) ? 'text-red-700' : ''}"
					>
						{label(opt)}
					</button>
				{/each}
			</div>
		{:else}
			<div class="text-sm text-white/55">Waiting for {turnName}…</div>
		{/if}
	</div>
{/if}
