// End-of-hand scoring.
//
// Each team totals the card points in the tricks it won, +10 for taking the
// last trick (162 points available in tricks), plus its meld. If the making
// team's total (tricks + meld) is strictly greater than their opponents', both
// teams score what they made. Otherwise the makers are "set": they score
// nothing (meld included) and the opponents score their own total.
//
// The game ends when a team reaches 500. If both cross 500 in the same hand the
// higher total wins; an exact tie at/over 500 plays another hand.

import type { GameDoc, HandResult, Suit, TeamId } from './types';
import { cardPoints } from './cards';
import { SEATS, otherTeam, teamOf } from './state';

export function scoreHand(doc: GameDoc): HandResult {
	const trump = doc.trump as Suit;
	const maker = doc.maker as TeamId;
	const opp = otherTeam(maker);

	const trickPoints: [number, number] = [0, 0];
	for (const seat of SEATS) {
		for (const won of doc.wonBySeat[seat]) {
			for (const card of won) trickPoints[teamOf(seat)] += cardPoints(card, trump);
		}
	}
	if (doc.lastTrickWinner != null) trickPoints[teamOf(doc.lastTrickWinner)] += 10;

	const meldPoints: [number, number] = [doc.melds.points[0], doc.melds.points[1]];
	const makerTotal = trickPoints[maker] + meldPoints[maker];
	const oppTotal = trickPoints[opp] + meldPoints[opp];
	const set = !(makerTotal > oppTotal);

	const awarded: [number, number] = [0, 0];
	if (set) {
		awarded[opp] = oppTotal;
	} else {
		awarded[maker] = makerTotal;
		awarded[opp] = oppTotal;
	}

	return {
		dealer: doc.dealer,
		trump,
		maker,
		trickPoints,
		meldPoints,
		set,
		renege: false,
		awarded,
		runningAfter: [0, 0]
	};
}

/** Trick points each team has banked so far this hand (no last-trick bonus,
 *  no meld) — for the live scoreboard during play. */
export function trickPointsSoFar(doc: GameDoc): [number, number] {
	const pts: [number, number] = [0, 0];
	for (const seat of SEATS) {
		for (const won of doc.wonBySeat[seat]) {
			for (const card of won) pts[teamOf(seat)] += cardPoints(card, doc.trump);
		}
	}
	return pts;
}

/** The winning team once a hand's scores are in `running`, or `null` if the
 *  game continues. */
export function checkGameEnd(running: readonly [number, number]): TeamId | null {
	const [a, b] = running;
	if (a < 500 && b < 500) return null;
	if (a >= 500 && b >= 500) {
		if (a === b) return null;
		return a > b ? 0 : 1;
	}
	return a >= 500 ? 0 : 1;
}
