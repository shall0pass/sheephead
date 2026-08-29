// The 32-card Sheephead deck plus the ranking and point rules.
//
// Trump is fixed: every Queen, every Jack, and every Diamond — 14 cards,
// ordered high→low:
//   QC QS QH QD  JC JS JH JD  AD TD KD 9D 8D 7D
// The three fail suits (Spades, Hearts, Clubs) each rank A T K 9 8 7.
//
// Point values (A=11 T=10 K=4 Q=3 J=2, nines/eights/sevens=0) total 120.
// There is no last-trick bonus.

import type { Card, Rank, Suit, TrickPlay, Seat } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', 'T', 'K', 'Q', 'J', '9', '8', '7'];
/** The suits that are *not* trump. Diamonds are always trump. */
export const FAIL_SUITS: Suit[] = ['S', 'H', 'C'];

export const FULL_DECK: Card[] = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}` as Card));

/** The pip suit printed on the card (Q♠ returns `'S'`, even though it is trump). */
export const suitOf = (c: Card): Suit => c[1] as Suit;
export const rankOf = (c: Card): Rank => c[0] as Rank;

/** In Sheephead the trump "suit" is Queens + Jacks + every Diamond. */
export const isTrump = (c: Card): boolean =>
	rankOf(c) === 'Q' || rankOf(c) === 'J' || suitOf(c) === 'D';

/** The suit that matters for following: `'T'` for any trump, else the fail
 *  suit. A led trump means "trump was led"; a led fail card means that fail
 *  suit was led. */
export type LeadSuit = 'T' | 'S' | 'H' | 'C';
export const leadSuitOf = (c: Card): LeadSuit => (isTrump(c) ? 'T' : (suitOf(c) as LeadSuit));

const TRUMP_ORDER: Card[] = [
	'QC',
	'QS',
	'QH',
	'QD',
	'JC',
	'JS',
	'JH',
	'JD',
	'AD',
	'TD',
	'KD',
	'9D',
	'8D',
	'7D'
];
/** 14 (QC) … 1 (7D); 0 for a non-trump card. */
const TRUMP_RANK: Record<string, number> = Object.fromEntries(
	TRUMP_ORDER.map((c, i) => [c, TRUMP_ORDER.length - i])
);
/** Fail-suit strength: A 6, T 5, K 4, 9 3, 8 2, 7 1. Queens/Jacks never rank as
 *  fail cards (they are trump). */
const FAIL_RANK: Record<Rank, number> = { A: 6, T: 5, K: 4, '9': 3, '8': 2, '7': 1, Q: 0, J: 0 };

const POINTS: Record<Rank, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };

export const cardPoints = (c: Card): number => POINTS[rankOf(c)];
/** Rank of a trump card within the trump order (0 for a non-trump). */
export const trumpRank = (c: Card): number => TRUMP_RANK[c] ?? 0;
/** Rank of a fail card within its suit (0 for a trump). */
export const failRank = (c: Card): number => (isTrump(c) ? 0 : FAIL_RANK[rankOf(c)]);

/** Does `a` beat `b` inside one trick, given the lead suit? A non-trump card
 *  off the led suit beats nothing. */
export function beats(a: Card, b: Card, led: LeadSuit): boolean {
	const at = isTrump(a);
	const bt = isTrump(b);
	if (at && bt) return trumpRank(a) > trumpRank(b);
	if (at) return true;
	if (bt) return false;
	const al = leadSuitOf(a) === led;
	const bl = leadSuitOf(b) === led;
	if (al && bl) return failRank(a) > failRank(b);
	return al && !bl;
}

/** Order a hand for display: trump first (strongest first), then the fail
 *  suits, each ordered strongest to weakest. */
export function sortHand(cards: readonly Card[]): Card[] {
	return [...cards].sort((a, b) => {
		const at = isTrump(a);
		const bt = isTrump(b);
		if (at && bt) return trumpRank(b) - trumpRank(a);
		if (at !== bt) return at ? -1 : 1;
		const sa = suitOf(a);
		const sb = suitOf(b);
		if (sa !== sb) return FAIL_SUITS.indexOf(sa) - FAIL_SUITS.indexOf(sb);
		return failRank(b) - failRank(a);
	});
}

/** The seat that wins a trick. Face-down `under` cards are passed in already
 *  filtered out — they cannot win. `plays[0]` is the lead. */
export function trickWinner(plays: TrickPlay[]): Seat {
	const led = leadSuitOf(plays[0].card);
	let best = plays[0];
	for (let i = 1; i < plays.length; i++) {
		if (beats(plays[i].card, best.card, led)) best = plays[i];
	}
	return best.seat;
}
