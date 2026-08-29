// Shuffling and dealing.

import type { Card, Seat } from './types';
import { FULL_DECK } from './cards';
import { makeRng, shuffle } from './rng';
import { nextSeat } from './state';

export interface DealResult {
	/** Length 4, indexed by seat. */
	hands: Card[][];
	/** The dealer's sixth card, turned face up. It stays in the dealer's hand. */
	upCard: Card;
}

export function deal(seed: string, dealer: Seat): DealResult {
	const deck = shuffle(FULL_DECK, makeRng(seed));
	const hands: Card[][] = [[], [], [], []];
	let idx = 0;
	// Six rounds of one card each, clockwise, starting to the dealer's left.
	for (let round = 0; round < 6; round++) {
		let seat = nextSeat(dealer);
		for (let i = 0; i < 4; i++) {
			hands[seat].push(deck[idx++]);
			seat = nextSeat(seat);
		}
	}
	return { hands, upCard: hands[dealer][5] };
}
