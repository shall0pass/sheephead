// Shuffling and dealing.
//
// Six cards to every player, dealt three at a time clockwise from the dealer's
// left; the two-card blind goes to the middle after the first round of three.
// 3×5 + 2 + 3×5 = 32.

import type { Card, Seat } from './types';
import { FULL_DECK } from './cards';
import { makeRng, shuffle } from './rng';
import { nextSeat } from './state';

export interface DealResult {
	/** Length 5, indexed by seat. */
	hands: Card[][];
	/** The two down cards in the middle. */
	blind: Card[];
}

export function deal(seed: string, dealer: Seat): DealResult {
	const deck = shuffle(FULL_DECK, makeRng(seed));
	const hands: Card[][] = [[], [], [], [], []];

	const order: Seat[] = [];
	let seat = nextSeat(dealer);
	for (let i = 0; i < 5; i++) {
		order.push(seat);
		seat = nextSeat(seat);
	}

	let idx = 0;
	for (const s of order) for (let k = 0; k < 3; k++) hands[s].push(deck[idx++]);
	const blind = [deck[idx++], deck[idx++]];
	for (const s of order) for (let k = 0; k < 3; k++) hands[s].push(deck[idx++]);

	return { hands, blind };
}
