<script lang="ts">
	import type { Card } from '$lib/sheephead/types';
	import { cardPoints } from '$lib/sheephead';

	let { selected, onbury }: { selected: Card[]; onbury: () => void } = $props();

	const points = $derived(selected.reduce((n, c) => n + cardPoints(c), 0));
</script>

<div class="panel">
	<p>Bury two cards ({selected.length}/2 chosen{selected.length ? ` — ${points} points` : ''})</p>
	<button class="go" disabled={selected.length !== 2} onclick={onbury}>Bury</button>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		color: #fff;
	}
	.go {
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1.6rem;
		font-weight: 700;
		background: #4ade80;
		color: #052e16;
		cursor: pointer;
	}
	.go:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
