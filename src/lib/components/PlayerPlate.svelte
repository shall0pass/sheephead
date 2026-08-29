<script lang="ts">
	import type { PlayerSlot } from '$lib/sheephead/types';

	let {
		player = null,
		online = false,
		isMe = false,
		isDealer = false,
		isTurn = false,
		isPicker = false,
		isPartner = false,
		thinking = false,
		passed = false,
		tricks = 0
	}: {
		player?: PlayerSlot | null;
		online?: boolean;
		isMe?: boolean;
		isDealer?: boolean;
		isTurn?: boolean;
		isPicker?: boolean;
		isPartner?: boolean;
		thinking?: boolean;
		passed?: boolean;
		tricks?: number;
	} = $props();
</script>

<div
	class="plate"
	class:turn={isTurn}
	class:me={isMe}
	class:partner={isPartner}
	role="group"
	aria-label={player?.name ?? 'empty seat'}
>
	<div class="row">
		<span class="dot" class:on={online} title={online ? 'online' : 'offline'}></span>
		{#if player?.isBot}
			<svg viewBox="0 0 24 24" class="bot" fill="currentColor" aria-label="computer player">
				<path
					d="M12 2a1 1 0 0 1 1 1v1h3a3 3 0 0 1 3 3v2h1a1 1 0 1 1 0 2h-1v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4H4a1 1 0 1 1 0-2h1V7a3 3 0 0 1 3-3h3V3a1 1 0 0 1 1-1Zm-2 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
				/>
			</svg>
		{/if}
		<span class="name" title={player?.name}>{player?.name ?? 'empty'}</span>
		{#if isDealer}<span class="chip" title="dealer">D</span>{/if}
	</div>
	<div class="tags">
		{#if isPicker}<span class="tag pick">picker</span>{/if}
		{#if isPartner}<span class="tag pard">partner</span>{/if}
		{#if passed}<span class="tag pass">passed</span>{/if}
		{#if thinking}<span class="tag think">thinking…</span>{/if}
		{#if tricks > 0}<span class="tag trk">{tricks} {tricks === 1 ? 'trick' : 'tricks'}</span>{/if}
	</div>
</div>

<style>
	.plate {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 6.5rem;
		max-width: 9rem;
		padding: 0.35rem 0.55rem;
		border-radius: 0.6rem;
		background: rgb(3 46 26 / 0.82);
		color: #fff;
		font-size: 0.8rem;
		outline: 2px solid transparent;
		transition: outline-color 0.2s;
	}
	.plate.turn {
		outline-color: #fbbf24;
	}
	.plate.me {
		background: rgb(6 78 44 / 0.92);
	}
	.plate.partner {
		box-shadow: 0 0 0 2px #38bdf8 inset;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.25);
		flex: none;
	}
	.dot.on {
		background: #4ade80;
	}
	.bot {
		width: 0.9rem;
		height: 0.9rem;
		opacity: 0.6;
		flex: none;
	}
	.chip {
		flex: none;
		display: grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: #fbbf24;
		color: #422006;
		font-size: 0.65rem;
		font-weight: 700;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}
	.tag {
		border-radius: 0.35rem;
		padding: 0 0.3rem;
		font-size: 0.62rem;
		background: rgb(255 255 255 / 0.12);
	}
	.tag.pick {
		background: #fbbf24;
		color: #422006;
		font-weight: 700;
	}
	.tag.pard {
		background: #38bdf8;
		color: #082f49;
		font-weight: 700;
	}
	.tag.think {
		color: #fde68a;
	}
</style>
