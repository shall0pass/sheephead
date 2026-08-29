// The picking round: eldest hand → dealer, each choosing Pick or Pass.

import type { GameDoc, Seat } from './types';

export type PickChoice = 'pick' | 'pass';

/** `['pick','pass']` when it is `seat`'s turn to decide, else `[]`. */
export function legalPickChoices(doc: GameDoc, seat: Seat): PickChoice[] {
	if (doc.phase !== 'picking' || !doc.picking || doc.picking.turn !== seat) return [];
	return ['pick', 'pass'];
}

/** Whether `seat` is the last player who could still pick this deal (everyone
 *  before them has passed). Used by the bot so a table of weak hands does not
 *  re-deal forever. */
export function isLastToDecide(doc: GameDoc, seat: Seat): boolean {
	return doc.picking?.turn === seat && doc.picking.passed.length === 4;
}
