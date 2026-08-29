<script lang="ts">
	import type { PlayerSlot } from '$lib/clabber/types';

	let { log = [], players = [] }: { log?: string[]; players?: (PlayerSlot | null)[] } = $props();

	let open = $state(false);

	function humanise(line: string): string {
		return line.replace(/seat (\d)/g, (_, n) => players[Number(n)]?.name ?? `seat ${n}`);
	}
	const recent = $derived(log.slice(-14).map(humanise));
</script>

<div class="fixed bottom-2 left-2 z-20 text-[11px]">
	<button
		onclick={() => (open = !open)}
		class="rounded bg-green-950/70 px-2 py-1 text-white/60 ring-1 ring-white/10 hover:text-white"
		aria-expanded={open}
	>
		{open ? 'Hide log' : 'Log'}
	</button>
	{#if open}
		<ul
			class="mt-1 max-h-44 w-64 overflow-y-auto rounded bg-green-950/85 p-2 leading-snug text-white/70 ring-1 ring-white/10"
		>
			{#each recent as line, i (i)}
				<li class="py-0.5">{line}</li>
			{/each}
		</ul>
	{/if}
</div>
