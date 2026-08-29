<script lang="ts">
	import type { PlayerSlot } from '$lib/clabber/types';

	let {
		player = null,
		online = false,
		isMe = false,
		relation = 'opponent',
		canSit = false,
		canMove = false,
		onsit,
		onleave,
		onrename,
		onremovebot
	}: {
		player?: PlayerSlot | null;
		online?: boolean;
		isMe?: boolean;
		relation?: 'you' | 'partner' | 'opponent';
		canSit?: boolean;
		canMove?: boolean;
		onsit?: () => void;
		onleave?: () => void;
		onrename?: (name: string) => void;
		onremovebot?: () => void;
	} = $props();

	let editing = $state(false);
	let draft = $state('');

	function startEdit() {
		draft = player?.name ?? '';
		editing = true;
	}
	function commit() {
		const name = draft.trim();
		if (name && name !== player?.name) onrename?.(name);
		editing = false;
	}

	const ring = $derived(
		relation === 'you'
			? 'ring-green-400'
			: relation === 'partner'
				? 'ring-sky-400'
				: 'ring-white/15'
	);
</script>

<div
	class="flex w-40 flex-col items-center gap-1.5 rounded-xl bg-green-950/70 p-3 text-center ring-2 {ring}"
>
	{#if player}
		<div class="flex items-center gap-1.5">
			<span
				class="inline-block h-2 w-2 rounded-full {online ? 'bg-green-400' : 'bg-white/25'}"
				title={online ? 'online' : 'offline'}
			></span>

			{#if player.isBot}
				<!-- robot -->
				<svg
					viewBox="0 0 24 24"
					class="h-4 w-4 text-white/60"
					fill="currentColor"
					aria-label="computer player"
				>
					<path
						d="M12 2a1 1 0 0 1 1 1v1h3a3 3 0 0 1 3 3v2h1a1 1 0 1 1 0 2h-1v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4H4a1 1 0 1 1 0-2h1V7a3 3 0 0 1 3-3h3V3a1 1 0 0 1 1-1Zm-2 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
					/>
				</svg>
			{/if}

			{#if editing}
				<input
					bind:value={draft}
					onblur={commit}
					onkeydown={(e) => {
						if (e.key === 'Enter') commit();
						if (e.key === 'Escape') editing = false;
					}}
					class="w-24 rounded bg-white/15 px-1.5 py-0.5 text-sm text-white focus:ring-2 focus:ring-green-400 focus:outline-none"
				/>
			{:else}
				<span class="max-w-[7rem] truncate text-sm font-semibold" title={player.name}>
					{player.name}
				</span>
				{#if isMe}
					<button onclick={startEdit} class="text-white/50 hover:text-white" aria-label="edit name">
						<!-- pencil -->
						<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
							<path
								d="M14.06 6.19 17.81 9.94 8.5 19.25l-3.75.5.5-3.75 8.81-9.81Zm5.53-1.06-1.72-1.72a1.5 1.5 0 0 0-2.12 0l-1.4 1.4 3.75 3.75 1.49-1.31a1.5 1.5 0 0 0 0-2.12Z"
							/>
						</svg>
					</button>
				{/if}
			{/if}
		</div>

		<div class="text-[10px] tracking-wide text-white/40 uppercase">
			{relation === 'you' ? 'you' : relation === 'partner' ? 'partner' : 'opponent'}
		</div>

		{#if isMe && onleave}
			<button onclick={onleave} class="text-[11px] text-white/50 hover:text-white">stand up</button>
		{:else if player.isBot && onremovebot}
			<button onclick={onremovebot} class="text-[11px] text-white/40 hover:text-white"
				>remove</button
			>
		{/if}
	{:else}
		<div class="py-1 text-xs text-white/30">empty seat</div>
		{#if canSit}
			<button
				onclick={onsit}
				class="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-semibold text-green-950 hover:bg-green-400"
			>
				{canMove ? 'Move here' : 'Sit here'}
			</button>
		{/if}
	{/if}
</div>
