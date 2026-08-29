import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GameOver from './GameOver.svelte';
import type { GameStore } from '$lib/repo/gameStore.svelte';

// The fireworks canvas isn't what we're testing here.
vi.mock('canvas-confetti', () => ({
	default: Object.assign(() => {}, {
		create: () => Object.assign(() => {}, { reset: () => {} })
	})
}));

function fakeStore(opts: {
	winner: 0 | 1 | null;
	mySeat: number | null;
	running?: [number, number];
}) {
	return {
		doc: { winner: opts.winner, score: { running: opts.running ?? [510, 320] } },
		mySeat: opts.mySeat,
		tryChange: vi.fn()
	} as unknown as GameStore;
}

describe('GameOver.svelte', () => {
	it('renders nothing until there is a winner', async () => {
		render(GameOver, { store: fakeStore({ winner: null, mySeat: 0 }) });
		await expect.element(page.getByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
	});

	it('celebrates when your team won', async () => {
		render(GameOver, { store: fakeStore({ winner: 0, mySeat: 0 }) });
		await expect.element(page.getByText('We won!')).toBeInTheDocument();
	});

	it('commiserates when your team lost', async () => {
		render(GameOver, { store: fakeStore({ winner: 1, mySeat: 0 }) });
		await expect.element(page.getByText('We lost')).toBeInTheDocument();
	});

	it('names the winning team for a spectator', async () => {
		render(GameOver, { store: fakeStore({ winner: 1, mySeat: null }) });
		await expect.element(page.getByText('Team 2 wins')).toBeInTheDocument();
	});

	it('Play again resets to the lobby', async () => {
		const store = fakeStore({ winner: 0, mySeat: 0 });
		render(GameOver, { store });
		await page.getByRole('button', { name: 'Play again' }).click();
		expect(store.tryChange).toHaveBeenCalledWith({ type: 'ResetToLobby' });
	});
});
