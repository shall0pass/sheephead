// Core Clabber types. Everything here is plain JSON so a `GameDoc` can live
// directly inside an Automerge document (Phase 3).

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9';
export type Card = `${Rank}${Suit}`;

/** Seats are clockwise. The local player renders at the bottom (seat handling
 *  lives in the UI); seats 0 & 2 are one team, seats 1 & 3 the other. */
export type Seat = 0 | 1 | 2 | 3;
export type TeamId = 0 | 1;

/** A bidding decision: pass, accept the up-card's suit (round 1 only), or name
 *  a suit (round 2 only). */
export type Bid = 'pass' | 'accept' | { suit: Suit };

export type Phase =
	| 'lobby'
	| 'bid1' // round 1 — play or pass the up-card suit
	| 'bid2' // round 2 — name any other suit, or pass
	| 'redeal' // everyone passed twice; the same dealer deals again
	| 'meld' // first trick in progress; meld announcements still open
	| 'trick' // tricks 2..6
	| 'trickDone' // all four cards played; held on screen before it is collected
	| 'handScored' // hand finished, showing the breakdown
	| 'gameOver';

export type MeldKind = 'dad' | 'fifty' | 'hundred' | 'twohundred' | 'bella';
/** `run` = sequence in one suit, `set` = four of a kind, `bella` = K+Q trump. */
export type MeldGroup = 'run' | 'set' | 'bella';

export interface PlayerSlot {
	seat: Seat;
	name: string;
	isBot: boolean;
	botName?: string;
	/** Automerge actor id of the human occupying this seat (Phase 3). */
	actorId?: string;
	/** Epoch ms of the last presence heartbeat (Phase 3). */
	lastSeen: number;
}

export interface BiddingState {
	round: 1 | 2;
	turn: Seat;
	passes: Seat[];
	/** The suit passed by everyone in round 1 — forbidden as trump in round 2. */
	passedSuit: Suit | null;
}

export interface TrickPlay {
	seat: Seat;
	card: Card;
}

export interface TrickState {
	number: number; // 1..6
	leader: Seat;
	turn: Seat;
	plays: TrickPlay[];
	/** Set once the fourth card is played (phase `trickDone`); null while in play. */
	winner: Seat | null;
}

export interface MeldClaim {
	kind: MeldKind;
	group: MeldGroup;
	/** The suit for a `run`/`bella`; `null` for a `set` (spans all suits). */
	suit: Suit | null;
	cards: Card[];
	points: number;
	/** Sequence-order rank (9=1 … A=6) of the meld's highest card, for tie-breaks. */
	top: number;
}

export interface MeldState {
	/** Per seat: the melds announced before that seat's first trick-1 card, or
	 *  `null` if the seat never announced (meld is then forfeit). */
	declared: (MeldClaim[] | null)[];
	resolved: boolean;
	/** Team that won the meld comparison and scores its full meld total; `null`
	 *  when nobody has meld or the comparison is a push. */
	scoredTeam: TeamId | null;
	/** Final meld points awarded to each team (includes bella). */
	points: [number, number];
}

export interface ChatMessage {
	id: string;
	/** clientId (per-tab identity) of the sender. */
	from: string;
	/** display name at the time the message was sent. */
	name: string;
	/** seat 0..3 of the sender, or `null` for a spectator. */
	seat: Seat | null;
	text: string;
	/** epoch ms. */
	ts: number;
}

export interface HandResult {
	dealer: Seat;
	trump: Suit;
	maker: TeamId;
	trickPoints: [number, number];
	meldPoints: [number, number];
	/** The making team failed to out-score their opponents (they are "set"). */
	set: boolean;
	/** The hand ended on a renege — the opponents scored 162 + their meld. */
	renege: boolean;
	awarded: [number, number];
	runningAfter: [number, number];
}

export interface GameDoc {
	version: 1;
	code: string;
	createdAt: number;
	hostActorId: string;

	/** Length 4, indexed by seat; `null` is an empty seat. */
	players: (PlayerSlot | null)[];

	phase: Phase;
	/** Advanced (renege) mode — chosen in the lobby, then locked for the game.
	 *  When on, a player may play any card in hand; an illegal one is a renege. */
	advanced: boolean;
	dealer: Seat;
	/** Seed of the current deal (kept for replay / debugging). */
	seed: string;

	/** Length 4, indexed by seat. */
	hands: Card[][];
	upCard: Card | null;
	trump: Suit | null;
	maker: TeamId | null;

	bidding: BiddingState | null;
	trick: TrickState | null;

	/** `wonBySeat[seat]` is the list of 4-card tricks that seat won. */
	wonBySeat: Card[][][];
	lastTrickWinner: Seat | null;

	melds: MeldState;

	/** Set when a player played an illegal card in Advanced mode; the hand is
	 *  then scored as a renege. */
	renege: { seat: Seat; card: Card } | null;

	score: {
		running: [number, number];
		hands: HandResult[];
	};

	winner: TeamId | null;
	log: string[];

	/** Table chat, oldest first. Capped to the most recent messages. */
	chat: ChatMessage[];
}
