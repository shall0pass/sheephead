<script lang="ts">
	import type { GameDoc, Seat } from '$lib/sheephead/types';
	import { pickerPointsSoFar } from '$lib/sheephead';
	import Card from './Card.svelte';

	let { doc, nameOf }: { doc: GameDoc; nameOf: (s: Seat) => string } = $props();

	const trick = $derived(doc.trick);
	const pickerPts = $derived(pickerPointsSoFar(doc));
	const calledLabel = $derived(
		doc.call?.kind === 'alone' ? 'going alone' : doc.calledCard ? `called ${doc.calledCard}` : ''
	);
</script>

<div class="felt">
	<div class="head">
		<span>♦ Q J — trump</span>
		{#if trick}<span>trick {trick.number}/6</span>{/if}
		{#if calledLabel}<span>{calledLabel}</span>{/if}
		<span>picker side: {pickerPts}</span>
	</div>

	<div class="plays">
		{#if trick && trick.plays.length}
			{#each trick.plays as p (p.seat)}
				<figure>
					<Card card={p.faceDown ? undefined : p.card} faceDown={p.faceDown} height={72} />
					<figcaption>{nameOf(p.seat)}</figcaption>
				</figure>
			{/each}
		{:else}
			<p class="wait">waiting for the lead…</p>
		{/if}
	</div>
</div>

<style>
	.felt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1.25rem;
		min-width: min(80vw, 30rem);
		min-height: 11rem;
		border-radius: 999px / 40%;
		background: radial-gradient(circle at 50% 40%, #157a4a, #0a5c36 72%);
		box-shadow:
			inset 0 0 40px rgb(0 0 0 / 0.35),
			0 10px 30px rgb(0 0 0 / 0.3);
		color: #fff;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
		font-size: 0.72rem;
		color: rgb(255 255 255 / 0.75);
	}
	.plays {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.65rem;
	}
	.wait {
		color: rgb(255 255 255 / 0.5);
		font-size: 0.8rem;
	}
</style>
