<script lang="ts">
	import { teamOf } from '$lib/clabber/state';
	import { SUIT_NAME } from '$lib/cards/display';
	import type { GameStore } from '$lib/repo/gameStore.svelte';

	let { store, onNextHand }: { store: GameStore; onNextHand?: () => void } = $props();

	const doc = $derived(store.doc);
	const mySeat = $derived(store.mySeat);
	const myTeam = $derived(mySeat != null ? teamOf(mySeat) : 0);
	const running = $derived(doc?.score.running ?? [0, 0]);
	// "We" / "They" are relative to the local player's team; a spectator has no
	// side, so they see neutral team labels.
	const usLabel = $derived(mySeat != null ? 'We' : 'Team 1');
	const themLabel = $derived(mySeat != null ? 'They' : 'Team 2');
	const us = $derived(running[myTeam]);
	const them = $derived(running[myTeam ^ 1]);

	const last = $derived(doc?.score.hands.at(-1));
	const showModal = $derived(doc?.phase === 'handScored' && last != null);
	const makerLabel = $derived(
		mySeat == null
			? last?.maker === 0
				? 'Team 1'
				: 'Team 2'
			: last?.maker === myTeam
				? 'We'
				: 'They'
	);
</script>

<div class="rounded-xl bg-green-950/80 px-3 py-2 text-sm ring-1 ring-white/10">
	<span class="font-semibold">{usLabel} {us}</span>
	<span class="text-white/40"> — </span>
	<span class="font-semibold">{themLabel} {them}</span>
	<span class="ml-1 text-[11px] text-white/40">to 500</span>
</div>

{#if showModal && last}
	<div class="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-2xl bg-green-950 p-6 text-white ring-1 ring-white/15">
			<h2 class="mb-1 text-lg font-bold">{last.renege ? 'Renege!' : 'Hand scored'}</h2>
			<p class="mb-4 text-sm text-white/60">
				{#if last.renege}
					A player reneged — the other team takes 162 plus their meld.
				{:else}
					{makerLabel} made {SUIT_NAME[last.trump]}{last.set ? ' — and went set.' : '.'}
				{/if}
			</p>

			<table class="w-full text-sm">
				<thead class="text-white/40">
					<tr>
						<th class="text-left font-normal"></th>
						<th class="text-right font-normal">{usLabel}</th>
						<th class="text-right font-normal">{themLabel}</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="py-0.5 text-white/60">Tricks</td>
						<td class="text-right">{last.trickPoints[myTeam]}</td>
						<td class="text-right">{last.trickPoints[myTeam ^ 1]}</td>
					</tr>
					<tr>
						<td class="py-0.5 text-white/60">Meld</td>
						<td class="text-right">{last.meldPoints[myTeam]}</td>
						<td class="text-right">{last.meldPoints[myTeam ^ 1]}</td>
					</tr>
					<tr class="border-t border-white/10 font-semibold">
						<td class="py-1">Awarded</td>
						<td class="text-right">{last.awarded[myTeam]}</td>
						<td class="text-right">{last.awarded[myTeam ^ 1]}</td>
					</tr>
					<tr class="text-white/70">
						<td class="py-0.5">Game</td>
						<td class="text-right">{last.runningAfter[myTeam]}</td>
						<td class="text-right">{last.runningAfter[myTeam ^ 1]}</td>
					</tr>
				</tbody>
			</table>

			{#if onNextHand}
				<button
					onclick={onNextHand}
					class="mt-5 w-full rounded-lg bg-green-500 py-2 font-semibold text-green-950 hover:bg-green-400"
				>
					Next hand
				</button>
				<p class="mt-2 text-center text-[11px] text-white/35">
					(the table deals automatically in a few seconds)
				</p>
			{/if}
		</div>
	</div>
{/if}
