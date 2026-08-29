// Every mutation to a `GameDoc` goes through `reduce` as one of these actions.

import type { Card, Seat, Suit } from './types';

/** The payload of a `CallPartner` action: a normal called suit, an `under`
 *  (with the face-down hole card), or going alone. */
export type CallPayload =
	{ suit: Suit } | { under: true; suit: Suit; hole: Card } | { alone: true };

export type Action =
	| { type: 'JoinSeat'; seat: Seat; name: string; actorId?: string }
	| { type: 'LeaveSeat'; seat: Seat }
	| { type: 'RenameSeat'; seat: Seat; name: string }
	| { type: 'SetBot'; seat: Seat; isBot: boolean; botName?: string }
	/** Deal the next hand. From `handScored` the deal advances to the next
	 *  dealer and the hand counter; from `redeal` (or the first hand) it keeps
	 *  the current dealer and does not advance the counter. */
	| { type: 'StartHand'; seed: string }
	| { type: 'Pick'; seat: Seat }
	| { type: 'Pass'; seat: Seat }
	| { type: 'Bury'; seat: Seat; cards: [Card, Card] }
	| { type: 'CallPartner'; seat: Seat; call: CallPayload }
	| { type: 'PlayCard'; seat: Seat; card: Card }
	/** Claim the "bot runner" role. Which client should claim (and when) is
	 *  decided client-side; the reducer just records the winner. */
	| { type: 'HostClaim'; actorId: string }
	/** Hand a seated human's seat to (or back from) the bot AI mid-game when
	 *  they drop out. Keeps the name and `actorId` so they resume on return. */
	| { type: 'CoverSeat'; seat: Seat; isBot: boolean }
	/** After a game ends: back to the lobby, keeping seats, names and the code. */
	| { type: 'ResetToLobby' }
	/** A human walks away for good: their seat becomes a bot (named `botName`)
	 *  and loses its `actorId`, so a later re-join won't reclaim it. Works in
	 *  any phase — a hand in progress is played out by the bot. */
	| { type: 'LeaveTable'; seat: Seat; botName: string }
	/** Post a message to the table chat. `id` / `ts` are supplied by the caller
	 *  so the reducer stays pure. */
	| {
			type: 'SendChat';
			id: string;
			from: string;
			name: string;
			seat: Seat | null;
			text: string;
			ts: number;
	  };

export type ActionType = Action['type'];
