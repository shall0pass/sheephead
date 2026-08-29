<script lang="ts">
	let { onleave, class: klass = '' }: { onleave: () => void; class?: string } = $props();

	let confirming = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function arm() {
		confirming = true;
		clearTimeout(timer);
		timer = setTimeout(() => (confirming = false), 4000);
	}
	function cancel() {
		confirming = false;
		clearTimeout(timer);
	}
</script>

{#if confirming}
	<span
		class="inline-flex items-center gap-1 rounded-lg bg-green-950/85 px-2 py-1 text-[11px] ring-1 ring-white/10 {klass}"
	>
		<span class="text-white/60">Leave? A computer takes your seat.</span>
		<button
			onclick={onleave}
			class="rounded bg-red-500/80 px-1.5 py-0.5 font-semibold text-white hover:bg-red-500"
		>
			Leave
		</button>
		<button onclick={cancel} class="rounded px-1.5 py-0.5 text-white/60 hover:text-white"
			>Stay</button
		>
	</span>
{:else}
	<button
		onclick={arm}
		class="rounded-lg bg-green-950/70 px-2 py-1 text-[11px] text-white/50 ring-1 ring-white/10 transition hover:text-white {klass}"
	>
		Leave table
	</button>
{/if}
