import { describe, it, expect } from 'vitest';
import { playRandomGame } from './simulate';

const seeds = Array.from({ length: 40 }, (_, i) => `game-${i}`);

describe('full-game simulation', () => {
	it('every game reaches gameOver with a valid, leading winner', () => {
		for (const seed of seeds) {
			const { doc } = playRandomGame(seed);
			expect(doc.phase).toBe('gameOver');
			expect([0, 1]).toContain(doc.winner);
			const w = doc.winner as 0 | 1;
			expect(doc.score.running[w]).toBeGreaterThanOrEqual(500);
			expect(doc.score.running[w]).toBeGreaterThanOrEqual(doc.score.running[w ^ 1]);
		}
	});

	it('every hand accounts for exactly 162 trick points', () => {
		for (const seed of seeds.slice(0, 12)) {
			const { doc } = playRandomGame(seed);
			expect(doc.score.hands.length).toBeGreaterThan(0);
			for (const h of doc.score.hands) {
				expect(h.trickPoints[0] + h.trickPoints[1]).toBe(162);
				expect(h.awarded[0]).toBeGreaterThanOrEqual(0);
				expect(h.awarded[1]).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('leaves no cards undealt or unplayed at game end', () => {
		const { doc } = playRandomGame('tidy');
		expect(doc.hands.flat()).toHaveLength(0);
	});

	it('is fully deterministic for a given seed', () => {
		const a = playRandomGame('repeat');
		const b = playRandomGame('repeat');
		expect(a.steps).toBe(b.steps);
		expect(a.handsPlayed).toBe(b.handsPlayed);
		expect(a.doc.score.running).toEqual(b.doc.score.running);
		expect(a.doc.winner).toBe(b.doc.winner);
	});
});
