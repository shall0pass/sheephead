<script lang="ts">
	import type { Card as CardT } from '$lib/sheephead/types';
	import { sortHand } from '$lib/sheephead';
	import Card from './Card.svelte';

	let {
		cards,
		legal = null,
		height = 104,
		selectable = false,
		selected = [],
		onplay,
		ontoggle
	}: {
		cards: CardT[];
		/** When non-null, only these cards are playable; the rest are dimmed. */
		legal?: CardT[] | null;
		height?: number;
		/** Bury mode: cards toggle-select instead of playing. */
		selectable?: boolean;
		selected?: CardT[];
		onplay?: (card: CardT) => void;
		ontoggle?: (card: CardT) => void;
	} = $props();

	const ordered = $derived(sortHand(cards));
	const canPlay = (c: CardT) => (legal ? legal.includes(c) : false);

	let root = $state<HTMLDivElement>();
	let focusedFor = '';
	// When your turn starts (a fresh set of legal cards), move focus to the
	// first one — but only once per turn, so we don't steal focus repeatedly.
	$effect(() => {
		const key = legal ? legal.join(',') : '';
		if (key && key !== focusedFor) {
			focusedFor = key;
			root?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
		} else if (!key) {
			focusedFor = '';
		}
	});
</script>

<div class="hand" role="group" aria-label="your hand" bind:this={root}>
	{#each ordered as c (c)}
		<button
			class="slot"
			class:playable={selectable || canPlay(c)}
			class:dim={!selectable && legal != null && !canPlay(c)}
			class:sel={selectable && selected.includes(c)}
			disabled={selectable ? false : !canPlay(c)}
			onclick={() => (selectable ? ontoggle?.(c) : onplay?.(c))}
			aria-pressed={selectable ? selected.includes(c) : undefined}
		>
			<Card card={c} {height} />
		</button>
	{/each}
</div>

<style>
	.hand {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.5rem;
	}
	.slot {
		background: none;
		border: none;
		padding: 0;
		cursor: default;
		transition:
			transform 0.12s,
			filter 0.12s;
	}
	.slot.playable {
		cursor: pointer;
	}
	.slot.playable:hover,
	.slot.playable:focus-visible {
		transform: translateY(-0.6rem);
		outline: none;
	}
	.slot.sel {
		transform: translateY(-0.6rem);
		filter: drop-shadow(0 0 0.4rem #fbbf24);
	}
	.slot.dim {
		filter: saturate(0.4) brightness(0.7);
	}
</style>
