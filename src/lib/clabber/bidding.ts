// Declaring trump. Two rounds, each starting to the dealer's left and going
// clockwise. Round 1: play or pass the up-card's suit. Round 2 (only if all
// four passed): name any suit except the one passed in round 1, or pass. A
// player may only name/accept a suit they hold at least one card of.

import type { Bid, GameDoc, Seat } from './types';
import { SUITS, suitOf } from './cards';

export function legalBids(doc: GameDoc, seat: Seat): Bid[] {
	const b = doc.bidding;
	if (!b || b.turn !== seat) return [];
	const hand = doc.hands[seat];
	const out: Bid[] = ['pass'];
	if (b.round === 1) {
		// `upCard` is always present during round 1.
		const s = suitOf(doc.upCard as NonNullable<GameDoc['upCard']>);
		if (hand.some((c) => suitOf(c) === s)) out.push('accept');
	} else {
		for (const s of SUITS) {
			if (s === b.passedSuit) continue;
			if (hand.some((c) => suitOf(c) === s)) out.push({ suit: s });
		}
	}
	return out;
}

export function sameBid(a: Bid, b: Bid): boolean {
	if (typeof a === 'string' || typeof b === 'string') return a === b;
	return a.suit === b.suit;
}

export function describeBid(bid: Bid): string {
	if (bid === 'pass') return 'pass';
	if (bid === 'accept') return 'accept up-card';
	return `trump ${bid.suit}`;
}
