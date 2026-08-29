<script lang="ts">
	import Card from './Card.svelte';

	let { count = 0, height = 54 }: { count?: number; height?: number } = $props();
	const spread = $derived(Math.min(18, 120 / Math.max(count, 1)));
</script>

<div class="fan" style:height="{height}px">
	{#each Array(count), i (i)}
		<div style:margin-left={i === 0 ? '0' : `-${height * 0.62 - spread}px`}>
			<Card faceDown {height} />
		</div>
	{/each}
</div>

<style>
	.fan {
		display: flex;
		align-items: center;
	}
</style>
