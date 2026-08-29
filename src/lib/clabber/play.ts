// Trick-play legality.
//
// Rules of play:
//   - Follow the led suit if you can.
//   - If void of the led suit, you must play a trump ("trumping in") if you
//     hold one.
//   - Any trump you play must beat the highest trump already in the trick when
//     you are able to — even if your partner played that highest trump.
//   - When a non-trump is led and you can follow, you are under no obligation
//     to beat what is already there.
//   - Otherwise you may play anything.

import type { Card, GameDoc, Seat } from './types';
import { isTrump, suitOf, trumpStrength } from './cards';

/** The cards `seat` may legally play right now. Empty if it is not their turn. */
export function legalMoves(doc: GameDoc, seat: Seat): Card[] {
	const t = doc.trick;
	if (!t || t.turn !== seat) return [];
	const hand = doc.hands[seat];
	const trump = doc.trump;

	if (t.plays.length === 0) return hand.slice(); // leader plays anything

	const led = suitOf(t.plays[0].card);
	const inLed = hand.filter((c) => suitOf(c) === led);
	const trumps = trump ? hand.filter((c) => suitOf(c) === trump) : [];
	const trumpsPlayed = t.plays.map((p) => p.card).filter((c) => isTrump(c, trump));
	const highTrump = trumpsPlayed.length
		? trumpsPlayed.reduce((a, b) => (trumpStrength(b) > trumpStrength(a) ? b : a))
		: null;

	if (trump && led === trump) {
		// Trump led: must follow with trump, overtrumping if possible.
		if (trumps.length === 0) return hand.slice();
		return mustBeat(trumps, highTrump);
	}

	// Non-trump led.
	if (inLed.length) return inLed; // follow suit, no rank obligation
	if (trumps.length) return mustBeat(trumps, highTrump); // must trump in
	return hand.slice(); // void of led suit and trump: throw off
}

/** Among `trumps`, the ones that beat `highTrump`; or all of them if none can. */
function mustBeat(trumps: Card[], highTrump: Card | null): Card[] {
	if (!highTrump) return trumps;
	const over = trumps.filter((c) => trumpStrength(c) > trumpStrength(highTrump));
	return over.length ? over : trumps;
}
