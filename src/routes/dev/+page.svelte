<script lang="ts">
	import { dev } from '$app/environment';
	import Card from '$lib/components/Card.svelte';
	import type { Card as CardT, Rank, Suit } from '$lib/clabber/types';

	const SUITS: { id: Suit; name: string }[] = [
		{ id: 'S', name: 'Spades' },
		{ id: 'H', name: 'Hearts' },
		{ id: 'D', name: 'Diamonds' },
		{ id: 'C', name: 'Clubs' }
	];
	const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9'];

	let height = $state(120);
</script>

{#if dev}
	<main>
		<h1>Card gallery</h1>
		<label>
			size
			<input type="range" min="60" max="240" bind:value={height} />
			{Math.round(height)}px
		</label>

		<p>The 24 cards used in Clabber (A K Q J 10 9 of each suit):</p>
		{#each SUITS as suit (suit.id)}
			<section>
				<h2>{suit.name}</h2>
				<div class="row">
					{#each RANKS as rank (rank)}
						{@const c = `${rank}${suit.id}` as CardT}
						<figure>
							<Card card={c} {height} />
							<figcaption>{c}</figcaption>
						</figure>
					{/each}
				</div>
			</section>
		{/each}

		<section>
			<h2>Back</h2>
			<div class="row">
				<figure>
					<Card faceDown {height} />
					<figcaption>face-down</figcaption>
				</figure>
			</div>
		</section>
	</main>
{:else}
	<p style="padding:2rem;font-family:system-ui">
		The dev gallery is only available in development.
	</p>
{/if}

<style>
	main {
		padding: 1.5rem;
		font-family: system-ui, sans-serif;
		background: #0a5c36;
		color: #fff;
		min-height: 100vh;
	}
	h1 {
		margin-top: 0;
	}
	section {
		margin: 1.5rem 0;
	}
	h2 {
		font-size: 1rem;
		opacity: 0.85;
		margin: 0 0 0.5rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	figure {
		margin: 0;
		text-align: center;
		font-size: 0.75rem;
	}
	figcaption {
		margin-top: 0.25rem;
		opacity: 0.8;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
</style>
