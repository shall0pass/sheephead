import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Scoreboard from './Scoreboard.svelte';
import { createGame } from '$lib/sheephead';
import type { GameDoc, Seat } from '$lib/sheephead/types';

const nameOf = (s: Seat) => `P${s}`;

function doc(overrides: Partial<GameDoc>): GameDoc {
	return { ...createGame('SB', 0), ...overrides } as GameDoc;
}

describe('Scoreboard.svelte', () => {
	it('shows the hand counter and each seat’s tally', async () => {
		render(Scoreboard, {
			doc: doc({ handNumber: 3, handsToPlay: 10, score: { tally: [2, -1, 1, -1, -1], hands: [] } }),
			nameOf,
			onnext: vi.fn()
		});
		await expect.element(page.getByText('hand 3/10')).toBeInTheDocument();
		await expect.element(page.getByText('P0: +2')).toBeInTheDocument();
		await expect.element(page.getByText('P1: -1')).toBeInTheDocument();
	});

	it('shows the hand breakdown modal on handScored and fires onnext', async () => {
		const onnext = vi.fn();
		render(Scoreboard, {
			doc: doc({
				phase: 'handScored',
				handNumber: 1,
				score: {
					tally: [2, 1, -1, -1, -1],
					hands: [
						{
							handNumber: 1,
							dealer: 0,
							picker: 0,
							partnerSeat: 1,
							alone: false,
							calledCard: 'AH',
							pickerPoints: 74,
							oppPoints: 46,
							outcome: 'pickerWin',
							awarded: [2, 1, -1, -1, -1],
							tallyAfter: [2, 1, -1, -1, -1]
						}
					]
				}
			}),
			nameOf,
			onnext
		});
		await expect.element(page.getByText('picker wins')).toBeInTheDocument();
		await expect.element(page.getByText(/picker side 74/)).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next hand' }).click();
		expect(onnext).toHaveBeenCalled();
	});
});
