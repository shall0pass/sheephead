// The bury: after taking the blind the picker discards exactly two cards. Any
// two distinct cards from the picker's eight are legal — the partner call step
// always has a fallback (go under, or go alone).

import type { Card, GameDoc } from './types';

/** The cards the picker may choose from, or `[]` when it is not the bury. */
export function legalBury(doc: GameDoc): Card[] {
	if (doc.phase !== 'bury' || doc.picker == null) return [];
	return doc.hands[doc.picker].slice();
}

export function isLegalBury(doc: GameDoc, cards: readonly Card[]): boolean {
	if (doc.picker == null || cards.length !== 2) return false;
	const [a, b] = cards;
	if (a === b) return false;
	const hand = doc.hands[doc.picker];
	return hand.includes(a) && hand.includes(b);
}
