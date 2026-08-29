import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GameOver from './GameOver.svelte';
import type { GameStore } from '$lib/repo/gameStore.svelte';

vi.mock('canvas-confetti', () => ({
	default: Object.assign(() => {}, {
		create: () => Object.assign(() => {}, { reset: () => {} })
	})
}));

function fakeStore(opts: { phase: string; mySeat: number | null; tally?: number[] }) {
	return {
		doc: {
			phase: opts.phase,
			handsToPlay: 10,
			score: { tally: opts.tally ?? [4, -1, -1, -1, -1] }
		},
		mySeat: opts.mySeat,
		tryChange: vi.fn()
	} as unknown as GameStore;
}

describe('GameOver.svelte', () => {
	it('renders nothing until the game is over', async () => {
		render(GameOver, { store: fakeStore({ phase: 'trick', mySeat: 0 }) });
		await expect.element(page.getByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
	});

	it('celebrates a positive final tally', async () => {
		render(GameOver, {
			store: fakeStore({ phase: 'gameOver', mySeat: 0, tally: [4, -1, -1, -1, -1] })
		});
		await expect.element(page.getByText('You finished up +4 🎉')).toBeInTheDocument();
	});

	it('commiserates a negative final tally', async () => {
		render(GameOver, {
			store: fakeStore({ phase: 'gameOver', mySeat: 1, tally: [4, -1, -1, -1, -1] })
		});
		await expect.element(page.getByText('You finished down -1')).toBeInTheDocument();
	});

	it('shows a neutral message for a spectator', async () => {
		render(GameOver, { store: fakeStore({ phase: 'gameOver', mySeat: null }) });
		await expect.element(page.getByText('Game over')).toBeInTheDocument();
	});

	it('Play again resets to the lobby', async () => {
		const store = fakeStore({ phase: 'gameOver', mySeat: 0 });
		render(GameOver, { store });
		await page.getByRole('button', { name: 'Play again' }).click();
		expect(store.tryChange).toHaveBeenCalledWith({ type: 'ResetToLobby' });
	});
});
