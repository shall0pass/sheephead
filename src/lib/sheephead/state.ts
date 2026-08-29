// Seat helpers and the initial document.

import type { GameDoc, Seat } from './types';

export const SEATS: readonly Seat[] = [0, 1, 2, 3, 4];
export const NUM_SEATS = 5;

export const nextSeat = (s: Seat): Seat => ((s + 1) % NUM_SEATS) as Seat;
export const prevSeat = (s: Seat): Seat => ((s + NUM_SEATS - 1) % NUM_SEATS) as Seat;
/** The eldest hand — the player to the dealer's left — who picks first and
 *  leads the first trick. */
export const eldest = (dealer: Seat): Seat => nextSeat(dealer);

/** The seats on the picker's team: the picker plus the (resolved) partner, or
 *  just the picker when alone. Empty in the lobby / on a re-deal. */
export function pickerTeamSeats(doc: GameDoc): Seat[] {
	if (doc.picker == null) return [];
	const team: Seat[] = [doc.picker];
	if (doc.partnerSeat != null && doc.partnerSeat !== doc.picker) team.push(doc.partnerSeat);
	return team;
}

export function isPickerTeam(doc: GameDoc, seat: Seat): boolean {
	return pickerTeamSeats(doc).includes(seat);
}

export function createGame(code: string, now: number = Date.now()): GameDoc {
	return {
		version: 1,
		code,
		createdAt: now,
		hostActorId: '',
		players: [null, null, null, null, null],
		phase: 'lobby',
		dealer: 0,
		seed: '',
		handNumber: 0,
		handsToPlay: 10,
		hands: [[], [], [], [], []],
		blind: [],
		picking: null,
		picker: null,
		buried: [],
		call: null,
		calledCard: null,
		partnerSeat: null,
		partnerRevealed: false,
		trick: null,
		tricksWon: [[], [], [], [], []],
		lastTrickWinner: null,
		score: { tally: [0, 0, 0, 0, 0], hands: [] },
		winners: null,
		log: [],
		chat: []
	};
}
