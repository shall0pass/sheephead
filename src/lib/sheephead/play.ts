// Trick-play legality.
//
// Rules of play:
//   - Follow the led suit if you can (trump counts as one suit — a led Queen,
//     Jack or Diamond means "trump was led").
//   - If void of the led suit you may play anything. Sheephead has no forced
//     trump-in and no obligation to overtrump.
//   - The called ace binds two players until its suit is first led (both
//     bindings lift on the last trick):
//       * the partner must play the called card on that lead and may not slough
//         it on any other trick;
//       * the picker must keep a fail card of the called suit and may only play
//         it when that suit is led;
//       * an `under` hole card is played face-down on the called-suit lead and
//         may not be played on any other trick.

import type { Card, GameDoc, Seat } from './types';
import { isTrump, leadSuitOf, suitOf } from './cards';
import { calledSuit } from './partner';

/** The cards `seat` may legally play right now. `[]` if it is not their turn. */
export function legalMoves(doc: GameDoc, seat: Seat): Card[] {
	const t = doc.trick;
	if (doc.phase !== 'trick' || !t || t.turn !== seat) return [];

	const hand = doc.hands[seat];
	const base = followSuit(hand, t.plays.length ? leadSuitOf(t.plays[0].card) : null);
	if (t.number === 6) return base; // last trick — every binding is off

	const call = doc.call;
	if (!call || call.kind === 'alone') return base;

	const cs = calledSuit(call); // a fail suit
	const calledSuitLed = t.plays.length > 0 && leadSuitOf(t.plays[0].card) === cs;

	// The partner must play the called card on its suit's first lead, and may
	// not discard it anywhere else.
	if (call.kind === 'called' && seat === doc.partnerSeat && hand.includes(call.card)) {
		if (calledSuitLed) return [call.card];
		return exclude(base, (c) => c === call.card);
	}

	// The picker keeps a fail card of the called suit until it is led.
	if (call.kind === 'called' && seat === doc.picker && !calledSuitLed) {
		return exclude(base, (c) => !isTrump(c) && suitOf(c) === cs);
	}

	// The picker's `under` hole card: forced on the called-suit lead, forbidden
	// otherwise.
	if (call.kind === 'under' && seat === doc.picker && hand.includes(call.hole)) {
		if (calledSuitLed) return [call.hole];
		return exclude(base, (c) => c === call.hole);
	}

	return base;
}

function followSuit(hand: readonly Card[], led: ReturnType<typeof leadSuitOf> | null): Card[] {
	if (led == null) return hand.slice();
	const inLed = hand.filter((c) => leadSuitOf(c) === led);
	return inLed.length ? inLed : hand.slice();
}

/** `base` minus the cards matching `drop`, unless that would leave nothing. */
function exclude(base: Card[], drop: (c: Card) => boolean): Card[] {
	const kept = base.filter((c) => !drop(c));
	return kept.length ? kept : base;
}
