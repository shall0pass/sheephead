import { describe, it, expect } from 'vitest';
import { playRandomGame } from './simulate';

const seeds = Array.from({ length: 40 }, (_, i) => `game-${i}`);

describe('full-game simulation', () => {
	it('every game reaches gameOver after handsToPlay scored hands with named winners', () => {
		for (const seed of seeds) {
			const { doc } = playRandomGame(seed);
			expect(doc.phase).toBe('gameOver');
			expect(doc.score.hands).toHaveLength(doc.handsToPlay);
			expect(doc.winners).not.toBeNull();
			expect(doc.winners!.every((s) => doc.score.tally[s] > 0)).toBe(true);
		}
	});

	it('every hand conserves 120 card points and is zero-sum', () => {
		for (const seed of seeds.slice(0, 12)) {
			const { doc } = playRandomGame(seed);
			for (const h of doc.score.hands) {
				expect(h.pickerPoints + h.oppPoints).toBe(120);
				expect(h.awarded.reduce((a, b) => a + b, 0)).toBe(0);
			}
			expect(doc.score.tally.reduce((a, b) => a + b, 0)).toBe(0);
		}
	});

	it('leaves no cards in hand at game end', () => {
		const { doc } = playRandomGame('tidy');
		expect(doc.hands.flat()).toHaveLength(0);
		expect(doc.blind).toHaveLength(0);
	});

	it('is fully deterministic for a given seed', () => {
		const a = playRandomGame('repeat');
		const b = playRandomGame('repeat');
		expect(a.steps).toBe(b.steps);
		expect(a.handsPlayed).toBe(b.handsPlayed);
		expect(a.doc.score.tally).toEqual(b.doc.score.tally);
		expect(a.doc.winners).toEqual(b.doc.winners);
	});
});
