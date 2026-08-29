<script lang="ts">
	import type { GameDoc, Seat } from '$lib/sheephead/types';
	import { SEATS } from '$lib/sheephead';

	let { doc, nameOf, onnext }: { doc: GameDoc; nameOf: (s: Seat) => string; onnext: () => void } =
		$props();

	const last = $derived(doc.score.hands.at(-1));
	const OUTCOME_LABEL: Record<string, string> = {
		pickerWin: 'picker wins',
		pickerWinSchneider: 'picker wins — schneider',
		pickerWinNoTrick: 'picker wins — no-tricker',
		pickerLoss: 'picker loses',
		pickerLossSchneider: 'picker loses — schneidered',
		pickerLossNoTrick: 'picker loses — no-tricker',
		redeal: 're-deal'
	};
</script>

<div class="strip">
	<span class="hand">hand {Math.min(doc.handNumber, doc.handsToPlay)}/{doc.handsToPlay}</span>
	{#each SEATS as s (s)}
		<span class="tally" class:pos={doc.score.tally[s] > 0} class:neg={doc.score.tally[s] < 0}>
			{nameOf(s)}: {doc.score.tally[s] > 0 ? '+' : ''}{doc.score.tally[s]}
		</span>
	{/each}
</div>

{#if doc.phase === 'handScored' && last}
	<div class="backdrop">
		<div class="modal">
			<h2>{OUTCOME_LABEL[last.outcome] ?? last.outcome}</h2>
			<p class="sub">
				{last.picker != null ? nameOf(last.picker) : '—'} picked{last.alone
					? ' and went alone'
					: last.partnerSeat != null
						? ` with ${nameOf(last.partnerSeat)}`
						: ''} · picker side {last.pickerPoints} — opponents {last.oppPoints}
			</p>
			<ul>
				{#each SEATS as s (s)}
					<li>
						<span>{nameOf(s)}</span>
						<span class:pos={last.awarded[s] > 0} class:neg={last.awarded[s] < 0}>
							{last.awarded[s] > 0 ? '+' : ''}{last.awarded[s]}
						</span>
					</li>
				{/each}
			</ul>
			<button onclick={onnext}>Next hand</button>
		</div>
	</div>
{/if}

<style>
	.strip {
		position: fixed;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.35rem 0.75rem;
		background: rgb(3 46 26 / 0.9);
		color: #fff;
		font-size: 0.72rem;
		border-radius: 0 0 0.6rem 0.6rem;
		z-index: 20;
	}
	.hand {
		font-weight: 700;
		opacity: 0.8;
	}
	.pos {
		color: #4ade80;
	}
	.neg {
		color: #fca5a5;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.55);
		z-index: 40;
	}
	.modal {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 18rem;
		padding: 1.5rem;
		border-radius: 1rem;
		background: #052e1a;
		color: #fff;
		text-align: center;
	}
	.modal h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.sub {
		margin: 0;
		font-size: 0.8rem;
		color: rgb(255 255 255 / 0.7);
	}
	.modal ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.modal li {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
	}
	.modal button {
		margin-top: 0.4rem;
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1.4rem;
		font-weight: 700;
		background: #4ade80;
		color: #052e16;
		cursor: pointer;
	}
</style>
