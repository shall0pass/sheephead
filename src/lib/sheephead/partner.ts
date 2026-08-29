// Choosing a partner after the bury.
//
// Normal case: the picker names a fail ace of a suit they still hold a non-ace
// fail card of and have not seen (not in the final hand or the blind they
// picked up). Whoever holds that ace is the secret partner.
//
// Edge cases from the rules doc:
//   - the picker holds all three fail aces        -> call a fail *ten* instead
//   - the picker's only fail cards are aces, or   -> go *under*: a face-down
//     the picker has no fail card at all             card stands in for the
//                                                    called suit
//   - `alone` is always available.

import type { Call, Card, GameDoc, Seat, Suit } from './types';
import { FAIL_SUITS, isTrump, rankOf, suitOf } from './cards';
import { SEATS } from './state';

export type CallOption =
	| { kind: 'ace'; suit: Suit }
	| { kind: 'ten'; suit: Suit }
	| { kind: 'under'; suit: Suit }
	| { kind: 'alone' };

/** Every card the picker has already seen: their final hand plus the two cards
 *  they buried (together, the eight from hand + blind). */
function seenByPicker(doc: GameDoc): Set<Card> {
	const picker = doc.picker as Seat;
	return new Set<Card>([...doc.hands[picker], ...doc.buried]);
}

export function legalCalls(doc: GameDoc): CallOption[] {
	if (doc.picker == null) return [];
	const hand = doc.hands[doc.picker];
	const seen = seenByPicker(doc);
	const failOf = (s: Suit) => hand.filter((c) => !isTrump(c) && suitOf(c) === s);
	const heldFailAces = FAIL_SUITS.filter((s) => hand.includes(`A${s}` as Card));

	const opts: CallOption[] = [];

	// Normal called ace.
	for (const s of FAIL_SUITS) {
		const ace = `A${s}` as Card;
		const hasNonAceFail = failOf(s).some((c) => rankOf(c) !== 'A');
		if (hasNonAceFail && !seen.has(ace)) opts.push({ kind: 'ace', suit: s });
	}

	if (opts.length === 0) {
		if (heldFailAces.length === 3) {
			for (const s of FAIL_SUITS) {
				if (!seen.has(`T${s}` as Card)) opts.push({ kind: 'ten', suit: s });
			}
		} else {
			for (const s of FAIL_SUITS) {
				if (!seen.has(`A${s}` as Card)) opts.push({ kind: 'under', suit: s });
			}
		}
	}

	opts.push({ kind: 'alone' });
	return opts;
}

/** The exact fail card a `{ suit }` call names, given the legal options. */
export function calledCardForSuit(opts: CallOption[], suit: Suit): Card | null {
	for (const o of opts) {
		if (o.kind === 'ace' && o.suit === suit) return `A${suit}` as Card;
		if (o.kind === 'ten' && o.suit === suit) return `T${suit}` as Card;
		if (o.kind === 'under' && o.suit === suit) return `A${suit}` as Card;
	}
	return null;
}

/** The seat holding `card`, or `null` if nobody does (should not happen for a
 *  legal call — the picker cannot name a card they have seen). */
export function seatHolding(doc: GameDoc, card: Card): Seat | null {
	for (const s of SEATS) if (doc.hands[s].includes(card)) return s;
	return null;
}

/** The called fail suit for the current hand, or `null`. */
export function calledSuit(call: Call | null): Suit | null {
	if (!call || call.kind === 'alone') return null;
	return suitOf(call.card);
}
