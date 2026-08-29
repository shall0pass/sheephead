<script lang="ts">
	import type { Card, GameDoc } from '$lib/sheephead/types';
	import type { CallPayload } from '$lib/sheephead/actions';
	import { cardPoints, legalCalls, sortHand, trumpRank } from '$lib/sheephead';

	let { doc, oncall }: { doc: GameDoc; oncall: (c: CallPayload) => void } = $props();

	const opts = $derived(legalCalls(doc));
	const hand = $derived(doc.picker != null ? doc.hands[doc.picker] : []);
	/** Default face-down card for an `under` call: cheapest, then lowest trump. */
	const holeCard = $derived(
		sortHand(hand)
			.slice()
			.sort((a, b) => cardPoints(a) - cardPoints(b) || trumpRank(a) - trumpRank(b))[0] as
			Card | undefined
	);
</script>

<div class="panel">
	<p>Call a partner</p>
	<div class="row">
		{#each opts as o (o.kind + ('suit' in o ? o.suit : ''))}
			{#if o.kind === 'ace'}
				<button onclick={() => oncall({ suit: o.suit })}>Call A{o.suit}</button>
			{:else if o.kind === 'ten'}
				<button onclick={() => oncall({ suit: o.suit })}>Call 10{o.suit}</button>
			{:else if o.kind === 'under' && holeCard}
				<button onclick={() => oncall({ under: true, suit: o.suit, hole: holeCard })}>
					Under A{o.suit} (hide {holeCard})
				</button>
			{:else if o.kind === 'alone'}
				<button class="alone" onclick={() => oncall({ alone: true })}>Go alone</button>
			{/if}
		{/each}
	</div>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		color: #fff;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}
	button {
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1rem;
		font-weight: 700;
		background: #fbbf24;
		color: #422006;
		cursor: pointer;
	}
	button.alone {
		background: rgb(255 255 255 / 0.15);
		color: #fff;
	}
</style>
