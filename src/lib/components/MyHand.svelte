<script lang="ts">
	import Card from './Card.svelte';
	import type { Card as CardT } from '$lib/clabber/types';

	let {
		cards,
		legal = [],
		active = false,
		advanced = false,
		height = 118,
		onplay
	}: {
		/** already sorted for display */
		cards: CardT[];
		/** the subset that may be played right now */
		legal?: CardT[];
		/** whether it is this player's turn to play a card */
		active?: boolean;
		/** Advanced mode: every card in hand is playable (an illegal one reneges) */
		advanced?: boolean;
		height?: number;
		onplay?: (card: CardT) => void;
	} = $props();

	const legalSet = $derived(new Set(legal));
	const width = $derived(height * (64 / 89));
	const step = $derived(width * 0.62);

	function playable(c: CardT) {
		return active && (advanced || legalSet.has(c));
	}
	function reneging(c: CardT) {
		return active && advanced && !legalSet.has(c);
	}

	let container = $state<HTMLDivElement>();

	// Touch/pen: drag across the fan and whichever card is under the finger
	// lifts up; lift your finger on it to play it, or drag off the fan and
	// release to cancel. Mouse and keyboard keep the plain click on each card.
	let activeIdx = $state<number | null>(null);
	let dragging = false;
	// The play happens on pointerup, so swallow the click the browser then
	// synthesises or the card would be played twice.
	let swallowClick = false;

	function idxAt(clientX: number, clientY: number): number | null {
		const el = container;
		if (!el || cards.length === 0) return null;
		const r = el.getBoundingClientRect();
		if (clientX < r.left - 24 || clientX > r.right + 24) return null;
		if (clientY < r.top - 90 || clientY > r.bottom + 48) return null;
		const i = Math.floor((clientX - r.left) / step);
		return Math.min(Math.max(i, 0), cards.length - 1);
	}

	function onpointerdown(e: PointerEvent) {
		if (!active || e.pointerType === 'mouse') return;
		dragging = true;
		swallowClick = false;
		activeIdx = idxAt(e.clientX, e.clientY);
		try {
			container?.setPointerCapture(e.pointerId);
		} catch {
			/* not capturable — geometry still works */
		}
	}

	function onpointermove(e: PointerEvent) {
		if (!dragging) return;
		activeIdx = idxAt(e.clientX, e.clientY);
	}

	function endDrag(e: PointerEvent, play: boolean) {
		if (!dragging) return;
		dragging = false;
		try {
			container?.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
		const i = play ? idxAt(e.clientX, e.clientY) : null;
		if (i != null && playable(cards[i])) {
			swallowClick = true;
			setTimeout(() => (swallowClick = false), 500);
			onplay?.(cards[i]);
		}
		activeIdx = null;
	}

	function clickCard(card: CardT) {
		if (swallowClick) {
			swallowClick = false;
			return;
		}
		if (!playable(card)) return;
		onplay?.(card);
	}

	// When it becomes this player's turn, move keyboard focus to the first
	// playable card so it can be played without reaching for the mouse.
	let wasActive = false;
	$effect(() => {
		if (active && !wasActive) {
			container?.querySelector<HTMLButtonElement>('button[data-playable="true"]')?.focus();
		}
		if (!active) activeIdx = null;
		wasActive = active;
	});
</script>

<div
	bind:this={container}
	class="relative mx-auto {active ? 'touch-none' : ''}"
	style:height="{height + 20}px"
	style:width="{cards.length ? step * (cards.length - 1) + width : 0}px"
	role="group"
	aria-label="your hand"
	{onpointerdown}
	{onpointermove}
	onpointerup={(e) => endDrag(e, true)}
	onpointercancel={(e) => endDrag(e, false)}
>
	{#each cards as card, i (card)}
		<button
			type="button"
			data-playable={playable(card)}
			class="absolute bottom-0 rounded-[6%] transition-all duration-150 focus:outline-none
				{playable(card)
				? 'cursor-pointer hover:-translate-y-4 focus-visible:-translate-y-4 focus-visible:ring-2 focus-visible:ring-amber-300'
				: active
					? 'cursor-not-allowed opacity-40'
					: 'cursor-default'}
				{activeIdx === i && playable(card)
				? `z-10 -translate-y-6! ring-2 ${reneging(card) ? 'ring-red-400' : 'ring-amber-300'}`
				: activeIdx === i
					? 'ring-2 ring-white/40'
					: ''}
				{activeIdx != null && activeIdx !== i && playable(card) ? 'opacity-60' : ''}
				{reneging(card) && activeIdx !== i ? 'ring-2 ring-red-500/70' : ''}"
			style:left="{i * step}px"
			tabindex={playable(card) ? 0 : -1}
			aria-disabled={!playable(card)}
			aria-label={reneging(card) ? `${card} (renege)` : card}
			onclick={() => clickCard(card)}
		>
			<Card {card} {height} />
		</button>
	{/each}
</div>
