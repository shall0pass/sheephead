<script lang="ts">
	import Card from './Card.svelte';

	let {
		count = 0,
		height = 52,
		overlap = 0.55,
		vertical = false
	}: {
		/** number of face-down cards to show */
		count?: number;
		height?: number;
		/** fraction of a card to overlap neighbours */
		overlap?: number;
		/** stack the cards top-to-bottom instead of left-to-right */
		vertical?: boolean;
	} = $props();

	const cardW = $derived(height * (64 / 89));
	const stepX = $derived(cardW * (1 - overlap));
	const stepY = $derived(height * (1 - overlap));
	const indexes = $derived(Array.from({ length: Math.max(0, count) }, (_, i) => i));

	const boxW = $derived(
		indexes.length === 0 ? 0 : vertical ? cardW : stepX * (indexes.length - 1) + cardW
	);
	const boxH = $derived(
		indexes.length === 0 ? 0 : vertical ? stepY * (indexes.length - 1) + height : height
	);
</script>

<div class="relative" style:height="{boxH}px" style:width="{boxW}px">
	{#each indexes as i (i)}
		<div
			class="absolute"
			style:left={vertical ? '0' : `${i * stepX}px`}
			style:top={vertical ? `${i * stepY}px` : '0'}
		>
			<Card faceDown {height} />
		</div>
	{/each}
</div>
