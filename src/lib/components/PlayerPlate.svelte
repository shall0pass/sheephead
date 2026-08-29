<script lang="ts">
	import type { PlayerSlot } from '$lib/clabber/types';

	let {
		player = null,
		relation = 'opponent',
		side = 'top',
		isDealer = false,
		isTurn = false,
		isThinking = false,
		justWon = false,
		online = true,
		lastBid = '',
		tricks = 0
	}: {
		player?: PlayerSlot | null;
		relation?: 'you' | 'partner' | 'opponent';
		/** which edge of the table this plate sits on */
		side?: 'top' | 'bottom' | 'left' | 'right';
		isDealer?: boolean;
		isTurn?: boolean;
		isThinking?: boolean;
		/** briefly true right after this player takes a trick */
		justWon?: boolean;
		online?: boolean;
		/** "pass" / "♠" / "" — shown during bidding. */
		lastBid?: string;
		/** tricks this player's team has taken this hand. */
		tricks?: number;
	} = $props();

	const ringColor = $derived(
		isTurn ? 'ring-amber-300' : relation === 'partner' ? 'ring-sky-400/60' : 'ring-white/10'
	);

	// On a narrow screen the left/right plates are turned sideways and sit
	// outboard of the cards, so a long name has vertical room instead of being
	// squeezed into a tiny horizontal pill.
	const vertical = $derived(side === 'left' || side === 'right');
	const rotClass = $derived(
		side === 'left' ? 'max-sm:-rotate-90' : side === 'right' ? 'max-sm:rotate-90' : ''
	);
</script>

<div class={vertical ? 'grid place-items-center max-sm:w-8' : 'contents'}>
	<div
		class="flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-green-950/80 px-2 py-1.5 text-sm ring-2 sm:gap-2 sm:px-3 {ringColor} {rotClass}
			{vertical ? 'max-sm:max-w-none' : ''}
			{isTurn ? 'shadow-[0_0_16px_rgba(252,211,77,0.5)]' : ''}"
		class:won={justWon}
	>
		<span
			class="inline-block h-2 w-2 shrink-0 rounded-full {online ? 'bg-green-400' : 'bg-white/25'}"
		></span>

		{#if player?.isBot}
			<svg viewBox="0 0 24 24" class="h-3.5 w-3.5 shrink-0 text-white/60" fill="currentColor">
				<path
					d="M12 2a1 1 0 0 1 1 1v1h3a3 3 0 0 1 3 3v2h1a1 1 0 1 1 0 2h-1v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4H4a1 1 0 1 1 0-2h1V7a3 3 0 0 1 3-3h3V3a1 1 0 0 1 1-1Zm-2 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
				/>
			</svg>
		{/if}

		<span
			class="truncate font-semibold {vertical
				? 'max-w-32 max-sm:max-w-none'
				: 'max-w-24 sm:max-w-32'}">{player?.name ?? 'empty'}</span
		>

		{#if isDealer}
			<span
				class="rounded bg-white/15 px-1 text-[10px] font-bold tracking-wide text-white/70"
				title="dealer">D</span
			>
		{/if}

		{#if isThinking}
			<span class="text-xs text-amber-300">thinking…</span>
		{:else if lastBid}
			<span class="text-xs text-white/70">{lastBid}</span>
		{/if}

		{#if tricks > 0}
			<span class="ml-auto text-[11px] whitespace-nowrap text-white/45"
				>{tricks} {tricks === 1 ? 'trick' : 'tricks'}</span
			>
		{/if}
	</div>
</div>

<style>
	.won {
		animation: wonpulse 0.8s ease-out;
	}
	@keyframes wonpulse {
		0% {
			box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
		}
		100% {
			box-shadow: 0 0 0 14px rgba(74, 222, 128, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.won {
			animation: none;
		}
	}
</style>
