// End-of-hand scoring.
//
// The picker's team needs 61+ card points (buried cards included) to win; the
// opposition wins with 60 or fewer left to the picker. Schneider doubles the
// stake when the losing side is held to 30 or fewer (i.e. the winning side
// takes 90+); a "no-tricker" triples it when one side takes all six tricks.
// Scoring is zero-sum game points, not card points — see the table below.
//
// The game ends after `handsToPlay` scored hands; the seats that finish with a
// positive tally are the winners (fireworks), a negative tally loses (tears).

import type { GameDoc, HandOutcome, HandResult } from './types';
import { cardPoints } from './cards';
import { SEATS, isPickerTeam } from './state';

const TOTAL_POINTS = 120;

export function scoreHand(doc: GameDoc): HandResult {
	let pickerPoints = 0;
	let pickerTricks = 0;
	let oppTricks = 0;
	for (const seat of SEATS) {
		const mine = isPickerTeam(doc, seat);
		for (const trick of doc.tricksWon[seat]) {
			if (mine) {
				pickerTricks++;
				for (const c of trick) pickerPoints += cardPoints(c);
			} else {
				oppTricks++;
			}
		}
	}
	// The buried cards always count for the picker's team.
	for (const c of doc.buried) pickerPoints += cardPoints(c);
	const oppPoints = TOTAL_POINTS - pickerPoints;

	const alone = doc.call?.kind === 'alone';
	const outcome = classify(pickerPoints, pickerTricks, oppTricks);
	const awarded = award(doc, outcome, alone);

	const sum = awarded.reduce((a, b) => a + b, 0);
	if (sum !== 0) throw new Error(`hand score does not sum to zero: [${awarded}]`);

	return {
		handNumber: doc.handNumber,
		dealer: doc.dealer,
		picker: doc.picker,
		partnerSeat: alone ? null : doc.partnerSeat,
		alone,
		calledCard: doc.calledCard,
		pickerPoints,
		oppPoints,
		outcome,
		awarded,
		tallyAfter: SEATS.map((s) => doc.score.tally[s] + awarded[s])
	};
}

/** Trick / no-trick cases turn on the trick count (the picker keeps the buried
 *  cards regardless); schneider turns on card points. */
function classify(pickerPoints: number, pickerTricks: number, oppTricks: number): HandOutcome {
	if (oppTricks === 0) return 'pickerWinNoTrick';
	if (pickerTricks === 0) return 'pickerLossNoTrick';
	if (pickerPoints >= 90) return 'pickerWinSchneider';
	if (pickerPoints >= 61) return 'pickerWin';
	if (pickerPoints <= 30) return 'pickerLossSchneider';
	return 'pickerLoss';
}

/** `[picker, partner, eachOpponent]` game points for the outcome. The alone
 *  column (no partner column in play) keeps the same per-player amounts spread
 *  over four opponents; the doc has no alone table, this is the standard
 *  zero-sum convention. */
const TABLE: Record<HandOutcome, { partnered: [number, number, number]; alone: [number, number] }> =
	{
		redeal: { partnered: [0, 0, 0], alone: [0, 0] },
		pickerWin: { partnered: [2, 1, -1], alone: [4, -1] },
		pickerWinSchneider: { partnered: [4, 2, -2], alone: [8, -2] },
		pickerWinNoTrick: { partnered: [6, 3, -3], alone: [12, -3] },
		pickerLoss: { partnered: [-2, -1, 1], alone: [-4, 1] },
		pickerLossSchneider: { partnered: [-4, -2, 2], alone: [-8, 2] },
		pickerLossNoTrick: { partnered: [-9, 0, 3], alone: [-12, 3] }
	};

function award(doc: GameDoc, outcome: HandOutcome, alone: boolean): number[] {
	const a = [0, 0, 0, 0, 0];
	const picker = doc.picker;
	if (picker == null) return a;
	const partner = alone ? null : doc.partnerSeat;
	const row = TABLE[outcome];

	if (alone) {
		const [pickerAmt, oppAmt] = row.alone;
		a[picker] = pickerAmt;
		for (const s of SEATS) if (s !== picker) a[s] = oppAmt;
	} else {
		const [pickerAmt, partnerAmt, oppAmt] = row.partnered;
		a[picker] = pickerAmt;
		if (partner != null) a[partner] = partnerAmt;
		for (const s of SEATS) if (s !== picker && s !== partner) a[s] = oppAmt;
	}
	return a;
}

/** Card points the picker's team has banked so far this hand (buried included),
 *  for the live scoreboard during play. */
export function pickerPointsSoFar(doc: GameDoc): number {
	let pts = 0;
	for (const seat of SEATS) {
		if (!isPickerTeam(doc, seat)) continue;
		for (const trick of doc.tricksWon[seat]) for (const c of trick) pts += cardPoints(c);
	}
	for (const c of doc.buried) pts += cardPoints(c);
	return pts;
}

/** Whether the game is over (enough hands played). The caller sets `winners`. */
export function checkGameEnd(doc: GameDoc): boolean {
	return doc.handNumber >= doc.handsToPlay;
}
