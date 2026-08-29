<script lang="ts">
	import type { GameStore } from '$lib/repo/gameStore.svelte';
	import Fireworks from './Fireworks.svelte';
	import Tears from './Tears.svelte';

	let { store }: { store: GameStore } = $props();

	const doc = $derived(store.doc);
	const mySeat = $derived(store.mySeat);
	const tally = $derived(doc?.score.tally ?? [0, 0, 0, 0, 0]);
	const myScore = $derived(mySeat != null ? tally[mySeat] : 0);
	const iLost = $derived(mySeat != null && myScore < 0);
	const iWon = $derived(mySeat != null && myScore > 0);

	function playAgain() {
		store.tryChange({ type: 'ResetToLobby' });
	}
</script>

{#if doc?.phase === 'gameOver'}
	{#if iLost}
		<Tears />
	{:else}
		<Fireworks />
	{/if}

	<div class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 text-center text-white">
		<div class="rounded-2xl bg-green-950/95 p-8 shadow-2xl ring-1 ring-white/15">
			<h2 class="text-3xl font-bold">
				{#if mySeat == null}
					Game over
				{:else if iWon}
					You finished up +{myScore} 🎉
				{:else if iLost}
					You finished down {myScore}
				{:else}
					You finished even
				{/if}
			</h2>
			<p class="mt-2 text-sm text-white/60">
				after {doc.handsToPlay} hands
			</p>
			<button
				onclick={playAgain}
				class="mt-6 rounded-lg bg-green-500 px-6 py-2 font-semibold text-green-950 hover:bg-green-400"
			>
				Play again
			</button>
		</div>
	</div>
{/if}
