import { describe, expect, it } from 'vitest';
import { deal } from './deal';
import { FULL_DECK } from './cards';

describe('deal', () => {
	it('gives six cards to each of five seats and a two-card blind', () => {
		const { hands, blind } = deal('seed-1', 0);
		expect(hands).toHaveLength(5);
		for (const h of hands) expect(h).toHaveLength(6);
		expect(blind).toHaveLength(2);
	});

	it('uses all 32 cards exactly once', () => {
		const { hands, blind } = deal('seed-2', 3);
		const all = [...hands.flat(), ...blind];
		expect(all).toHaveLength(32);
		expect(new Set(all)).toEqual(new Set(FULL_DECK));
	});

	it('is deterministic for a given seed and dealer', () => {
		expect(deal('same', 1)).toEqual(deal('same', 1));
		expect(deal('a', 1)).not.toEqual(deal('b', 1));
	});
});
