<script lang="ts">
	import type { Card } from '$lib/clabber/types';
	import { BACK_SHEET, CARD_RATIO, FACE_GRID, FACE_SHEET, facePosition } from '$lib/cards/sprite';

	let {
		card = undefined,
		faceDown = false,
		height = 96,
		class: klass = ''
	}: {
		/** The card to show. Omit (or set `faceDown`) to render a back. */
		card?: Card;
		faceDown?: boolean;
		/** Rendered height in px; width follows the card aspect ratio. */
		height?: number;
		class?: string;
	} = $props();

	const showBack = $derived(faceDown || card === undefined);
	const pos = $derived(showBack || card === undefined ? { col: 0, row: 0 } : facePosition(card));
	const width = $derived(height * CARD_RATIO);
</script>

<div
	class="card {klass}"
	class:back={showBack}
	role="img"
	aria-label={showBack ? 'face-down card' : card}
	style:width="{width}px"
	style:height="{height}px"
	style:background-image="url({showBack ? BACK_SHEET : FACE_SHEET})"
	style:background-size={showBack
		? `${width}px ${height}px`
		: `${width * FACE_GRID.cols}px ${height * FACE_GRID.rows}px`}
	style:background-position="{-pos.col * width}px {-pos.row * height}px"
></div>

<style>
	.card {
		flex: none;
		border-radius: 6%;
		background-color: #fff;
		background-repeat: no-repeat;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
	}
	.card.back {
		background-color: transparent;
	}
</style>
