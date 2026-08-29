// Heuristic computer player. Pure functions: given a document and a seat whose
// turn it is, return a legal action. No search, just sensible rules of thumb.

import type { Bid, Card, GameDoc, Seat, Suit } from './types';
import { cardPoints, isTrump, nonTrumpStrength, rankOf, suitOf, trumpStrength } from './cards';
import { legalBids } from './bidding';
import { legalMoves } from './play';
import { partnerSeat } from './state';

export function chooseBid(doc: GameDoc, seat: Seat): Bid {
	const b = doc.bidding;
	if (!b) return 'pass';
	const opts = legalBids(doc, seat);
	const hand = doc.hands[seat];

	if (b.round === 1) {
		const suit = suitOf(doc.upCard as NonNullable<GameDoc['upCard']>);
		if (opts.some((o) => o === 'accept') && handStrength(hand, suit) >= 26) return 'accept';
		return 'pass';
	}

	// Round 2. Name the strongest holdable suit; the dealer must not pass the
	// deal away if they have any legal call.
	const suited = opts.filter((o): o is { suit: Suit } => typeof o === 'object');
	if (suited.length) {
		const best = suited.reduce((x, y) =>
			handStrength(hand, y.suit) >= handStrength(hand, x.suit) ? y : x
		);
		if (seat === doc.dealer || handStrength(hand, best.suit) >= 22) return best;
	}
	return 'pass';
}

function handStrength(hand: Card[], trump: Suit): number {
	let score = 0;
	let trumps = 0;
	for (const c of hand) {
		if (suitOf(c) === trump) {
			trumps++;
			score += 4 + trumpStrength(c);
			if (rankOf(c) === 'J') score += 6;
			else if (rankOf(c) === '9') score += 3;
		} else if (rankOf(c) === 'A') {
			score += 4;
		} else if (rankOf(c) === 'T') {
			score += 1;
		}
	}
	if (trumps >= 3) score += 6;
	if (trumps >= 4) score += 8;
	if (trumps === 0) score -= 20;
	return score;
}

export function chooseCard(doc: GameDoc, seat: Seat): Card {
	const moves = legalMoves(doc, seat);
	if (moves.length === 1) return moves[0];
	const trump = doc.trump;
	const t = doc.trick;
	if (!t) return moves[0];

	const value = (c: Card) => cardPoints(c, trump);
	const cheapest = [...moves].sort(
		(a, b) => value(a) - value(b) || rawStrength(a, trump) - rawStrength(b, trump)
	);

	if (t.plays.length === 0) {
		// Lead: a low non-trump if possible, keeping trump in reserve.
		const nonTrump = cheapest.filter((c) => !isTrump(c, trump));
		return nonTrump[0] ?? cheapest[0];
	}

	const led = suitOf(t.plays[0].card);
	const winning = t.plays.reduce((a, b) =>
		trickStrength(b.card, trump, led) > trickStrength(a.card, trump, led) ? b : a
	);
	const partnerWinning = winning.seat === partnerSeat(seat);
	const beating = moves.filter(
		(c) => trickStrength(c, trump, led) > trickStrength(winning.card, trump, led)
	);

	if (partnerWinning) {
		// Partner has it — throw them the most points we safely can.
		return [...moves].sort((a, b) => value(b) - value(a))[0];
	}
	if (beating.length) {
		// Take the trick as cheaply as possible.
		return beating.sort(
			(a, b) => value(a) - value(b) || rawStrength(a, trump) - rawStrength(b, trump)
		)[0];
	}
	// Can't win — discard the least valuable card.
	return cheapest[0];
}

function rawStrength(c: Card, trump: Suit | null): number {
	return isTrump(c, trump) ? 100 + trumpStrength(c) : nonTrumpStrength(c);
}

function trickStrength(c: Card, trump: Suit | null, led: Suit): number {
	if (isTrump(c, trump)) return 200 + trumpStrength(c);
	if (suitOf(c) === led) return 100 + nonTrumpStrength(c);
	return nonTrumpStrength(c);
}
