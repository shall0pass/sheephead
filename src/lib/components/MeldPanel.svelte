<script lang="ts">
	import { detectMelds, selectBestMelds } from '$lib/clabber/meld';
	import { SUIT_SYMBOL } from '$lib/cards/display';
	import type { GameStore } from '$lib/repo/gameStore.svelte';
	import type { MeldClaim, MeldKind, Seat } from '$lib/clabber/types';

	let { store }: { store: GameStore } = $props();

	const doc = $derived(store.doc);
	const mySeat = $derived(store.mySeat);
	const iPlayed = $derived(
		mySeat != null && (doc?.trick?.plays.some((p) => p.seat === mySeat) ?? false)
	);
	const alreadyDeclared = $derived(mySeat != null && doc?.melds.declared[mySeat] != null);
	const show = $derived(doc?.phase === 'meld' && mySeat != null && !iPlayed && !alreadyDeclared);

	const claims = $derived(
		show && doc && mySeat != null ? detectMelds(doc.hands[mySeat], doc.trump) : []
	);
	const total = $derived(selectBestMelds(claims).sum);

	const KIND_LABEL: Record<MeldKind, string> = {
		dad: 'Dad',
		fifty: 'Fifty',
		hundred: 'Hundred',
		twohundred: 'Two hundred',
		bella: 'Bella'
	};
	function describe(c: MeldClaim): string {
		const where = c.suit ? SUIT_SYMBOL[c.suit] : '';
		return `${KIND_LABEL[c.kind]} ${where}`.trim();
	}

	function announce() {
		if (mySeat != null) store.tryChange({ type: 'AnnounceMeld', seat: mySeat as Seat });
	}
</script>

{#if show}
	<div
		class="flex flex-col items-center gap-2 rounded-2xl bg-green-950/85 p-4 ring-1 ring-white/10"
	>
		{#if claims.length}
			<div class="text-sm text-white/70">Announce your meld before playing:</div>
			<ul class="flex flex-wrap justify-center gap-2 text-xs">
				{#each claims as c (describe(c) + c.points)}
					<li class="rounded bg-white/10 px-2 py-1">{describe(c)} — {c.points}</li>
				{/each}
			</ul>
			<button
				onclick={announce}
				class="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-green-950 hover:bg-amber-200"
			>
				Announce {total}
			</button>
			<div class="text-[11px] text-white/40">…or just play a card to skip it.</div>
		{:else}
			<div class="text-sm text-white/55">No meld this hand — play when ready.</div>
		{/if}
	</div>
{/if}
