<script lang="ts">
	let {
		myTurn,
		waitingOn,
		onpick,
		onpass
	}: {
		myTurn: boolean;
		waitingOn: string;
		onpick: () => void;
		onpass: () => void;
	} = $props();
</script>

<div class="panel">
	{#if myTurn}
		<p>Pick up the blind?</p>
		<div class="row">
			<button class="go" onclick={onpick}>Pick</button>
			<button class="no" onclick={onpass}>Pass</button>
		</div>
	{:else}
		<p class="muted">waiting for {waitingOn} to pick or pass…</p>
	{/if}
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
		gap: 0.6rem;
	}
	button {
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1.4rem;
		font-weight: 700;
		cursor: pointer;
	}
	.go {
		background: #4ade80;
		color: #052e16;
	}
	.no {
		background: rgb(255 255 255 / 0.15);
		color: #fff;
	}
	.muted {
		color: rgb(255 255 255 / 0.6);
		font-size: 0.85rem;
	}
</style>
