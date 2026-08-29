// Heuristic computer player. Pure functions: given a document (and a seat whose
// turn it is), return a legal action. No search, just rules of thumb. Phase F
// tunes these; here they only need to always produce a legal move.

import type { CallPayload } from './actions';
import type { Card, GameDoc, Seat } from './types';
import {
	beats,
	cardPoints,
	failRank,
	isTrump,
	leadSuitOf,
	rankOf,
	suitOf,
	trumpRank
} from './cards';
import { legalCalls } from './partner';
import { isLastToDecide } from './picking';
import { legalMoves } from './play';
import { isPickerTeam } from './state';

// --- picking ------------------------------------------------------------

/** Rough "how good is this hand to play as picker" score. */
function pickStrength(hand: readonly Card[]): number {
	let s = 0;
	let trumps = 0;
	for (const c of hand) {
		if (isTrump(c)) {
			trumps++;
			s += 2 + trumpRank(c) / 3;
			if (rankOf(c) === 'Q') s += 3;
		} else if (rankOf(c) === 'A') {
			s += 1.5;
		}
	}
	if (trumps >= 4) s += 4;
	if (trumps <= 1) s -= 8;
	return s;
}

export function choosePick(doc: GameDoc, seat: Seat): boolean {
	// Never leave a re-deal on the table when you are the last to decide — a
	// weak-hand stalemate would loop forever.
	if (isLastToDecide(doc, seat)) return true;
	const threshold = seat === doc.dealer ? 9 : 11;
	return pickStrength(doc.hands[seat]) >= threshold;
}

// --- bury -------------------------------------------------------------

/** Lower is a better bury: shed low points, and prefer to void a short fail
 *  suit so those tricks can be trumped. */
function buryBadness(c: Card, suitLen: (s: string) => number): number {
	if (isTrump(c)) return 1000 + trumpRank(c); // keep trump unless forced
	return cardPoints(c) * 4 + suitLen(suitOf(c)) * 2 + failRank(c);
}

export function chooseBury(doc: GameDoc): [Card, Card] {
	const hand = doc.hands[doc.picker as Seat];
	const lenBySuit = new Map<string, number>();
	for (const c of hand)
		if (!isTrump(c)) lenBySuit.set(suitOf(c), (lenBySuit.get(suitOf(c)) ?? 0) + 1);
	const suitLen = (s: string) => lenBySuit.get(s) ?? 0;
	const sorted = [...hand].sort((a, b) => buryBadness(a, suitLen) - buryBadness(b, suitLen));
	return [sorted[0], sorted[1]];
}

// --- call partner ----------------------------------------------------

export function chooseCall(doc: GameDoc): CallPayload {
	const opts = legalCalls(doc);
	const hand = doc.hands[doc.picker as Seat];
	const failLen = (s: string) => hand.filter((c) => !isTrump(c) && suitOf(c) === s).length;

	const aces = opts.filter((o) => o.kind === 'ace');
	if (aces.length) {
		const best = aces.reduce((x, y) => (failLen(y.suit) < failLen(x.suit) ? y : x));
		return { suit: best.suit };
	}
	const tens = opts.filter((o) => o.kind === 'ten');
	if (tens.length) return { suit: tens[0].suit };
	const unders = opts.filter((o) => o.kind === 'under');
	if (unders.length) {
		const hole = [...hand].sort(
			(a, b) => cardPoints(a) - cardPoints(b) || trumpRank(a) - trumpRank(b)
		)[0];
		return { under: true, suit: unders[0].suit, hole };
	}
	return { alone: true };
}

// --- trick play ----------------------------------------------------

function strength(c: Card): number {
	return isTrump(c) ? 100 + trumpRank(c) : failRank(c);
}

export function chooseCard(doc: GameDoc, seat: Seat): Card {
	const moves = legalMoves(doc, seat);
	if (moves.length <= 1) return moves[0];
	const t = doc.trick;
	if (!t) return moves[0];

	const value = (c: Card) => cardPoints(c);
	const cheapest = [...moves].sort((a, b) => value(a) - value(b) || strength(a) - strength(b));

	if (t.plays.length === 0) {
		const nonTrump = cheapest.filter((c) => !isTrump(c));
		return nonTrump[0] ?? cheapest[0];
	}

	const led = leadSuitOf(t.plays[0].card);
	const contenders = t.plays.filter((p) => !p.faceDown);
	const winning = contenders.reduce((a, b) => (beats(b.card, a.card, led) ? b : a));
	const teammateWinning =
		winning.seat !== seat && isPickerTeam(doc, winning.seat) === isPickerTeam(doc, seat);
	const canBeat = moves.filter((c) => beats(c, winning.card, led));

	if (teammateWinning) {
		// Schmear: hand the most points we safely can.
		return [...moves].sort((a, b) => value(b) - value(a))[0];
	}
	if (canBeat.length) {
		return canBeat.sort((a, b) => value(a) - value(b) || strength(a) - strength(b))[0];
	}
	return cheapest[0];
}
