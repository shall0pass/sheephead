// Core Sheephead types. Everything here is plain JSON so a `GameDoc` can live
// directly inside an Automerge document.

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'T' | 'K' | 'Q' | 'J' | '9' | '8' | '7';
export type Card = `${Rank}${Suit}`;

/** Seats are clockwise; the local player renders at the bottom (seat rotation
 *  lives in the UI). There is no fixed partnership — the picker's partner is
 *  chosen each hand by the called ace (see `Call`). */
export type Seat = 0 | 1 | 2 | 3 | 4;

export type Phase =
	| 'lobby'
	| 'picking' // eldest hand → dealer each choose Pick or Pass
	| 'bury' // the picker holds the blind and discards two cards
	| 'callPartner' // the picker names a called ace / goes under / goes alone
	| 'redeal' // everyone passed → the same dealer re-deals
	| 'trick' // trick play, tricks 1..6
	| 'handScored' // hand finished, showing the breakdown
	| 'gameOver';

export interface PlayerSlot {
	seat: Seat;
	name: string;
	isBot: boolean;
	botName?: string;
	/** Automerge actor id of the human occupying this seat. */
	actorId?: string;
	/** Epoch ms of the last presence heartbeat. */
	lastSeen: number;
}

/** How the picker chose their partner this hand.
 *  - `called`  — a normal called ace (or a called ten when the picker holds all
 *                three fail aces). `card` is the exact fail card; its holder is
 *                the secret partner.
 *  - `under`   — the picker had no callable fail card, so a face-down `hole`
 *                card stands in for the called suit; `card` is still the called
 *                fail ace and its holder is the partner.
 *  - `alone`   — no partner; the picker plays one-against-four. */
export type Call =
	{ kind: 'called'; card: Card } | { kind: 'under'; card: Card; hole: Card } | { kind: 'alone' };

export interface TrickPlay {
	seat: Seat;
	card: Card;
	/** An `under` hole card, played face-down: it counts for the trick winner
	 *  but never wins the trick. */
	faceDown?: boolean;
}

export interface TrickState {
	number: number; // 1..6
	leader: Seat;
	turn: Seat;
	plays: TrickPlay[];
}

export interface PickingState {
	turn: Seat;
	passed: Seat[];
}

export type HandOutcome =
	| 'redeal'
	| 'pickerWin'
	| 'pickerWinSchneider'
	| 'pickerWinNoTrick'
	| 'pickerLoss'
	| 'pickerLossSchneider'
	| 'pickerLossNoTrick';

export interface HandResult {
	handNumber: number;
	dealer: Seat;
	picker: Seat | null;
	partnerSeat: Seat | null;
	alone: boolean;
	/** The called fail ace/ten, or `null` when the picker went alone / re-deal. */
	calledCard: Card | null;
	/** Card points in the picker's team's tricks, plus the buried cards (0..120). */
	pickerPoints: number;
	oppPoints: number;
	outcome: HandOutcome;
	/** This hand's game points, one per seat; always sums to 0. */
	awarded: number[];
	/** Cumulative tally after this hand, one per seat. */
	tallyAfter: number[];
}

export interface ChatMessage {
	id: string;
	/** clientId (per-tab identity) of the sender. */
	from: string;
	/** display name at the time the message was sent. */
	name: string;
	/** seat 0..4 of the sender, or `null` for a spectator. */
	seat: Seat | null;
	text: string;
	/** epoch ms. */
	ts: number;
}

export interface GameDoc {
	version: 1;
	code: string;
	createdAt: number;
	hostActorId: string;

	/** Length 5, indexed by seat; `null` is an empty seat. */
	players: (PlayerSlot | null)[];

	phase: Phase;
	dealer: Seat;
	/** Seed of the current deal (kept for replay / debugging). */
	seed: string;

	/** 0 in the lobby, then 1.. once a hand is dealt. A re-deal does not advance
	 *  it. The game ends after `handsToPlay` scored hands. */
	handNumber: number;
	handsToPlay: number;

	/** Length 5, indexed by seat. Six cards each; eight for the picker between
	 *  the blind pickup and the bury. */
	hands: Card[][];
	/** The two down cards; emptied into the picker's hand on Pick. */
	blind: Card[];
	picking: PickingState | null;

	picker: Seat | null;
	/** The picker's two discards; they score for the picker's team at hand end. */
	buried: Card[];
	call: Call | null;
	/** The resolved called fail card (from `call`), or `null` when alone. */
	calledCard: Card | null;
	/** The seat holding the called card — the secret partner. Stored but the UI
	 *  only surfaces it once `partnerRevealed` is true. `null` when alone. */
	partnerSeat: Seat | null;
	partnerRevealed: boolean;

	trick: TrickState | null;
	/** `tricksWon[seat]` is the list of 5-card tricks that seat won. */
	tricksWon: Card[][][];
	lastTrickWinner: Seat | null;

	score: {
		/** Cumulative game points, one per seat; always sums to 0. */
		tally: number[];
		hands: HandResult[];
	};

	/** Set at `gameOver`: the seats that finished with a positive tally. */
	winners: Seat[] | null;

	log: string[];
	/** Table chat, oldest first. Capped to the most recent messages. */
	chat: ChatMessage[];
}
