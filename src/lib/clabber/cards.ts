// The 24-card Clabber deck plus the ranking and point rules.
//
// Ranks and points (from the rules):
//   Non-trump  A 10 K Q J 9   (A=11 10=10 K=4 Q=3 J=2 9=0)
//   Trump      J  9 A 10 K Q  (J=20 9=14 A=11 10=10 K=4 Q=3)
// The jack and nine of trump jump to the top and change value; nothing else
// moves. Sequences for meld always use the natural order 9 10 J Q K A.

import type { Card, Rank, Suit, TrickPlay, Seat } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9'];

export const FULL_DECK: Card[] = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}` as Card));

export const suitOf = (c: Card): Suit => c[1] as Suit;
export const rankOf = (c: Card): Rank => c[0] as Rank;

const NON_TRUMP_STRENGTH: Record<Rank, number> = { A: 6, T: 5, K: 4, Q: 3, J: 2, '9': 1 };
const TRUMP_STRENGTH: Record<Rank, number> = { J: 6, '9': 5, A: 4, T: 3, K: 2, Q: 1 };
/** Order for meld sequences: 9 < 10 < J < Q < K < A, regardless of trump. */
export const SEQUENCE_STRENGTH: Record<Rank, number> = { '9': 1, T: 2, J: 3, Q: 4, K: 5, A: 6 };

const NON_TRUMP_POINTS: Record<Rank, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, '9': 0 };
const TRUMP_POINTS: Record<Rank, number> = { J: 20, '9': 14, A: 11, T: 10, K: 4, Q: 3 };

export const isTrump = (c: Card, trump: Suit | null): boolean =>
	trump != null && suitOf(c) === trump;

export const cardPoints = (c: Card, trump: Suit | null): number =>
	isTrump(c, trump) ? TRUMP_POINTS[rankOf(c)] : NON_TRUMP_POINTS[rankOf(c)];

export const trumpStrength = (c: Card): number => TRUMP_STRENGTH[rankOf(c)];
export const nonTrumpStrength = (c: Card): number => NON_TRUMP_STRENGTH[rankOf(c)];
export const sequenceStrength = (c: Card): number => SEQUENCE_STRENGTH[rankOf(c)];

/** Does card `a` beat card `b` within one trick, given the suit `led` and the
 *  `trump` suit? Off-suit non-trump cards never beat anything. */
export function beats(a: Card, b: Card, trump: Suit | null, led: Suit): boolean {
	const at = isTrump(a, trump);
	const bt = isTrump(b, trump);
	if (at && bt) return trumpStrength(a) > trumpStrength(b);
	if (at) return true;
	if (bt) return false;
	const al = suitOf(a) === led;
	const bl = suitOf(b) === led;
	if (al && bl) return nonTrumpStrength(a) > nonTrumpStrength(b);
	return al && !bl;
}

/** Order a hand for display: trump grouped first (strongest first), then the
 *  other suits, each ordered strongest to weakest. */
export function sortHand(cards: readonly Card[], trump: Suit | null): Card[] {
	const suitRank = (s: Suit) => (s === trump ? -1 : SUITS.indexOf(s));
	return [...cards].sort((a, b) => {
		const sa = suitOf(a);
		const sb = suitOf(b);
		if (sa !== sb) return suitRank(sa) - suitRank(sb);
		const strength = sa === trump ? trumpStrength : nonTrumpStrength;
		return strength(b) - strength(a);
	});
}

/** The seat that wins a completed (or partial) trick. `plays[0]` is the lead. */
export function trickWinner(plays: TrickPlay[], trump: Suit | null): Seat {
	const led = suitOf(plays[0].card);
	let best = plays[0];
	for (let i = 1; i < plays.length; i++) {
		if (beats(plays[i].card, best.card, trump, led)) best = plays[i];
	}
	return best.seat;
}
