// Heuristic computer player. Pure functions: given a document (and a seat whose
// turn it is), return a legal action. No search, just rules of thumb — good
// enough for a friendly table, tuned in Phase F.

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

const trumpsIn = (hand: readonly Card[]) => hand.filter(isTrump);

// --- picking ------------------------------------------------------------

/** Rough "how good is this hand to play as picker" score. */
function pickStrength(hand: readonly Card[]): number {
	let s = 0;
	const trumps = trumpsIn(hand).length;
	for (const c of hand) {
		if (isTrump(c)) {
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

	// Go alone only with a monster: both black queens and a fat trump holding.
	const hasBlackQueens = hand.includes('QC') && hand.includes('QS');
	if (hasBlackQueens && trumpsIn(hand).length >= 6 && opts.some((o) => o.kind === 'alone')) {
		return { alone: true };
	}

	const failLen = (s: string) => hand.filter((c) => !isTrump(c) && suitOf(c) === s).length;
	const aces = opts.filter((o) => o.kind === 'ace');
	if (aces.length) {
		// Call into the suit we are shortest in, so the ace comes home late.
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
	const cheap = [...moves].sort((a, b) => value(a) - value(b) || strength(a) - strength(b));
	const onPickerTeam = isPickerTeam(doc, seat);

	if (t.plays.length === 0) return chooseLead(doc, cheap, onPickerTeam);

	const led = leadSuitOf(t.plays[0].card);
	const contenders = t.plays.filter((p) => !p.faceDown);
	const winning = contenders.reduce((a, b) => (beats(b.card, a.card, led) ? b : a));
	const last = t.plays.length === 4;
	const teammateWinning = winning.seat !== seat && isPickerTeam(doc, winning.seat) === onPickerTeam;
	const canBeat = moves.filter((c) => beats(c, winning.card, led));

	if (teammateWinning) {
		// Schmear generously only when the trick is safe — we are last, or the
		// teammate is winning on trump. Otherwise give a middling card.
		const safe = last || isTrump(winning.card);
		const byValue = [...moves].sort((a, b) => value(b) - value(a));
		return safe ? byValue[0] : (cheap.find((c) => value(c) > 0) ?? cheap[0]);
	}
	if (canBeat.length) {
		// Take it as cheaply as possible; don't crash a big trump on a cheap trick.
		return canBeat.sort((a, b) => value(a) - value(b) || strength(a) - strength(b))[0];
	}
	return cheap[0];
}

function chooseLead(doc: GameDoc, cheap: Card[], onPickerTeam: boolean): Card {
	const trump = cheap.filter(isTrump);
	const nonTrump = cheap.filter((c) => !isTrump(c));

	if (onPickerTeam && trump.length >= 3 && trump.length >= nonTrump.length) {
		// Pull the opponents' trump: lead a strong one.
		return [...trump].sort((a, b) => trumpRank(b) - trumpRank(a))[0];
	}

	if (!onPickerTeam) {
		// Lead a fail ace to force a trump or bleed points off the picker's side.
		const ace = nonTrump.find((c) => rankOf(c) === 'A' && c !== doc.calledCard);
		if (ace) return ace;
	}

	return nonTrump[0] ?? cheap[0];
}
