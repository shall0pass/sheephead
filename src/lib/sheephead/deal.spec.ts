import { describe, it, expect } from 'vitest';
import { deal } from './deal';
import { FULL_DECK } from './cards';
import type { Seat } from './types';

describe('deal', () => {
	it('gives every seat six cards and uses the whole deck once', () => {
		const { hands } = deal('seed-1', 0);
		expect(hands.map((h) => h.length)).toEqual([6, 6, 6, 6]);
		expect(new Set(hands.flat()).size).toBe(24);
		expect([...hands.flat()].sort()).toEqual([...FULL_DECK].sort());
	});

	it("turns the dealer's sixth card face up", () => {
		for (const dealer of [0, 1, 2, 3] as Seat[]) {
			const { hands, upCard } = deal('seed-x', dealer);
			expect(upCard).toBe(hands[dealer][5]);
			expect(hands[dealer]).toContain(upCard);
		}
	});

	it('is deterministic for a given seed and dealer', () => {
		expect(deal('abc', 2)).toEqual(deal('abc', 2));
	});

	it('produces different deals for different seeds', () => {
		expect(deal('abc', 0).hands).not.toEqual(deal('xyz', 0).hands);
	});
});
