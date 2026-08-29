// The single entry point for changing a game. `reduce` mutates `doc` in place
// (so it drops straight into an Automerge `change` block) and throws
// `RuleError` on an illegal action. UI and bots should gate on `legalMoves` /
// `legalBids` first; the throw is the backstop.

import type { Action } from './actions';
import type { GameDoc, HandResult, Seat, Suit, TeamId } from './types';
import { suitOf, trickWinner } from './cards';
import { legalBids, sameBid, describeBid } from './bidding';
import { deal } from './deal';
import { detectMelds, resolveMeld, selectBestMelds } from './meld';
import { legalMoves } from './play';
import { checkGameEnd, scoreHand } from './score';
import { nextSeat, otherTeam, seatsOfTeam, teamOf } from './state';

export class RuleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RuleError';
	}
}

function fail(message: string): never {
	throw new RuleError(message);
}

export function reduce(doc: GameDoc, action: Action): void {
	switch (action.type) {
		case 'JoinSeat':
			return joinSeat(doc, action);
		case 'LeaveSeat':
			return leaveSeat(doc, action);
		case 'RenameSeat':
			return renameSeat(doc, action);
		case 'SetBot':
			return setBot(doc, action);
		case 'SetAdvanced':
			return setAdvanced(doc, action);
		case 'StartHand':
			return startHand(doc, action);
		case 'Bid':
			return bid(doc, action);
		case 'AnnounceMeld':
			return announceMeld(doc, action);
		case 'PlayCard':
			return playCard(doc, action);
		case 'AdvanceTrick':
			return advanceTrick(doc);
		case 'HostClaim':
			doc.hostActorId = action.actorId;
			return;
		case 'CoverSeat': {
			const p = doc.players[action.seat];
			if (p) p.isBot = action.isBot;
			return;
		}
		case 'ResetToLobby':
			return resetToLobby(doc);
		case 'LeaveTable':
			return leaveTable(doc, action);
		case 'SendChat':
			return sendChat(doc, action);
	}
}

function leaveTable(doc: GameDoc, a: Extract<Action, { type: 'LeaveTable' }>): void {
	if (!doc.players[a.seat]) return;
	const name = a.botName.trim() || `Bot ${a.seat + 1}`;
	// Replace the human with a bot; drop actorId so a fresh join can't re-seat.
	doc.players[a.seat] = {
		seat: a.seat,
		name,
		isBot: true,
		botName: name,
		lastSeen: doc.createdAt
	};
	doc.log.push(`seat ${a.seat} left; ${name} takes over`);
}

/** Newest-first cap so the chat can't grow the document without bound. */
const CHAT_LIMIT = 100;

function sendChat(doc: GameDoc, a: Extract<Action, { type: 'SendChat' }>): void {
	const text = a.text.trim().slice(0, 500);
	if (!text) return;
	if (!doc.chat) doc.chat = [];
	doc.chat.push({
		id: a.id,
		from: a.from,
		name: a.name.trim().slice(0, 40) || 'Player',
		seat: a.seat,
		text,
		ts: a.ts
	});
	if (doc.chat.length > CHAT_LIMIT) doc.chat.splice(0, doc.chat.length - CHAT_LIMIT);
}

function resetToLobby(doc: GameDoc): void {
	if (doc.phase !== 'gameOver')
		fail(`can only reset to the lobby after a game (phase ${doc.phase})`);
	doc.phase = 'lobby';
	doc.dealer = 0;
	doc.seed = '';
	doc.hands = [[], [], [], []];
	doc.upCard = null;
	doc.trump = null;
	doc.maker = null;
	doc.bidding = null;
	doc.trick = null;
	doc.wonBySeat = [[], [], [], []];
	doc.lastTrickWinner = null;
	doc.melds = {
		declared: [null, null, null, null],
		resolved: false,
		scoredTeam: null,
		points: [0, 0]
	};
	doc.renege = null;
	doc.score = { running: [0, 0], hands: [] };
	doc.winner = null;
	doc.log.push('back to the lobby for another game');
}

// --- lobby -----------------------------------------------------------------

function requireLobby(doc: GameDoc): void {
	if (doc.phase !== 'lobby') fail(`seats can only change in the lobby (phase ${doc.phase})`);
}

function joinSeat(doc: GameDoc, a: Extract<Action, { type: 'JoinSeat' }>): void {
	requireLobby(doc);
	const cur = doc.players[a.seat];
	if (cur && !cur.isBot) fail(`seat ${a.seat} is taken`);
	doc.players[a.seat] = {
		seat: a.seat,
		name: a.name.trim() || `Player ${a.seat + 1}`,
		isBot: false,
		actorId: a.actorId,
		lastSeen: doc.createdAt
	};
}

function leaveSeat(doc: GameDoc, a: Extract<Action, { type: 'LeaveSeat' }>): void {
	requireLobby(doc);
	doc.players[a.seat] = null;
}

function renameSeat(doc: GameDoc, a: Extract<Action, { type: 'RenameSeat' }>): void {
	const p = doc.players[a.seat];
	if (!p) fail(`seat ${a.seat} is empty`);
	const name = a.name.trim();
	if (!name) fail('name cannot be blank');
	p.name = name;
}

function setBot(doc: GameDoc, a: Extract<Action, { type: 'SetBot' }>): void {
	requireLobby(doc);
	if (a.isBot) {
		const name = a.botName?.trim() || `Bot ${a.seat + 1}`;
		doc.players[a.seat] = {
			seat: a.seat,
			name,
			isBot: true,
			botName: name,
			lastSeen: doc.createdAt
		};
	} else if (doc.players[a.seat]?.isBot) {
		doc.players[a.seat] = null;
	}
}

function setAdvanced(doc: GameDoc, a: Extract<Action, { type: 'SetAdvanced' }>): void {
	if (doc.phase !== 'lobby')
		fail(`Advanced mode can only change in the lobby (phase ${doc.phase})`);
	doc.advanced = a.on;
}

// --- dealing -------------------------------------------------------------

function startHand(doc: GameDoc, a: Extract<Action, { type: 'StartHand' }>): void {
	if (doc.phase !== 'lobby' && doc.phase !== 'handScored' && doc.phase !== 'redeal') {
		fail(`cannot start a hand from phase ${doc.phase}`);
	}
	if (doc.players.some((p) => p == null)) fail('all four seats must be filled');

	const dealer: Seat = doc.phase === 'handScored' ? nextSeat(doc.dealer) : doc.dealer;
	const { hands, upCard } = deal(a.seed, dealer);

	doc.dealer = dealer;
	doc.seed = a.seed;
	doc.hands = hands;
	doc.upCard = upCard;
	doc.trump = null;
	doc.maker = null;
	doc.trick = null;
	doc.wonBySeat = [[], [], [], []];
	doc.lastTrickWinner = null;
	doc.melds = {
		declared: [null, null, null, null],
		resolved: false,
		scoredTeam: null,
		points: [0, 0]
	};
	doc.renege = null;
	doc.bidding = { round: 1, turn: nextSeat(dealer), passes: [], passedSuit: null };
	doc.phase = 'bid1';
	doc.log.push(`seat ${dealer} deals; up-card ${upCard}`);
}

// --- bidding ------------------------------------------------------------

function bid(doc: GameDoc, a: Extract<Action, { type: 'Bid' }>): void {
	if (doc.phase !== 'bid1' && doc.phase !== 'bid2') fail(`no bidding in phase ${doc.phase}`);
	const b = doc.bidding;
	if (!b) fail('no bidding in progress');
	if (a.seat !== b.turn) fail(`it is not seat ${a.seat}'s turn to bid`);
	if (!legalBids(doc, a.seat).some((o) => sameBid(o, a.bid))) {
		fail(`illegal bid: ${describeBid(a.bid)}`);
	}

	if (a.bid === 'pass') {
		b.passes.push(a.seat);
		if (b.passes.length < 4) {
			b.turn = nextSeat(a.seat);
			return;
		}
		if (b.round === 1) {
			doc.bidding = {
				round: 2,
				turn: nextSeat(doc.dealer),
				passes: [],
				passedSuit: suitOf(doc.upCard as NonNullable<GameDoc['upCard']>)
			};
			doc.phase = 'bid2';
			doc.log.push('all passed; second round of bidding');
		} else {
			doc.bidding = null;
			doc.phase = 'redeal';
			doc.log.push('all passed twice; the same dealer re-deals');
		}
		return;
	}

	const trump =
		a.bid === 'accept' ? suitOf(doc.upCard as NonNullable<GameDoc['upCard']>) : a.bid.suit;
	doc.trump = trump;
	doc.maker = teamOf(a.seat);
	doc.bidding = null;
	doc.upCard = null;
	const leader = nextSeat(doc.dealer);
	doc.trick = { number: 1, leader, turn: leader, plays: [], winner: null };
	doc.phase = 'meld';
	doc.log.push(`seat ${a.seat} makes ${trump} trump`);
}

// --- meld + trick play -----------------------------------------------------

function announceMeld(doc: GameDoc, a: Extract<Action, { type: 'AnnounceMeld' }>): void {
	if (doc.phase !== 'meld') fail('meld may only be announced during the first trick');
	const t = doc.trick;
	if (!t) fail('no trick in progress');
	if (t.plays.some((p) => p.seat === a.seat)) {
		fail(`seat ${a.seat} has already played to the first trick`);
	}
	doc.melds.declared[a.seat] = detectMelds(doc.hands[a.seat], doc.trump);
}

function playCard(doc: GameDoc, a: Extract<Action, { type: 'PlayCard' }>): void {
	if (doc.phase !== 'meld' && doc.phase !== 'trick')
		fail(`cannot play a card in phase ${doc.phase}`);
	const t = doc.trick;
	if (!t) fail('no trick in progress');
	if (a.seat !== t.turn) fail(`it is not seat ${a.seat}'s turn`);

	const hand = doc.hands[a.seat];
	if (!hand.includes(a.card)) fail(`card not in hand: ${a.card}`);

	if (!legalMoves(doc, a.seat).includes(a.card)) {
		if (!a.allowIllegal) fail(`illegal card: ${a.card}`);
		// Advanced mode: an illegal card is a renege — the hand ends now.
		hand.splice(hand.indexOf(a.card), 1);
		t.plays.push({ seat: a.seat, card: a.card });
		doc.renege = { seat: a.seat, card: a.card };
		doc.log.push(`seat ${a.seat} reneged (played ${a.card})`);
		finishRenegedHand(doc, a.seat);
		return;
	}

	hand.splice(hand.indexOf(a.card), 1);
	t.plays.push({ seat: a.seat, card: a.card });

	if (t.plays.length < 4) {
		t.turn = nextSeat(a.seat);
		return;
	}

	// Fourth card played: freeze the trick on screen. `AdvanceTrick` collects it.
	t.winner = trickWinner(t.plays, doc.trump);
	doc.phase = 'trickDone';
	doc.log.push(`trick ${t.number} to seat ${t.winner}`);
}

function advanceTrick(doc: GameDoc): void {
	if (doc.phase !== 'trickDone') fail(`no completed trick to advance (phase ${doc.phase})`);
	const t = doc.trick;
	if (!t || t.winner == null) fail('trick is not complete');

	const winner = t.winner;
	doc.wonBySeat[winner].push(t.plays.map((p) => p.card));
	doc.lastTrickWinner = winner;
	const n = t.number;

	if (n === 1) resolveMeld(doc);
	if (n === 6) {
		finishHand(doc); // sets phase to handScored / gameOver and trick to null
		return;
	}
	doc.trick = { number: n + 1, leader: winner, turn: winner, plays: [], winner: null };
	doc.phase = 'trick';
}

function finishHand(doc: GameDoc): void {
	settleHand(doc, scoreHand(doc));
}

/** Renege: the play stops and the opponents of the reneging team score 162
 *  (all trick points) plus their own announced meld. The reneging team scores
 *  nothing. */
function finishRenegedHand(doc: GameDoc, renegingSeat: Seat): void {
	const guilty = teamOf(renegingSeat);
	const opp = otherTeam(guilty);
	const [a, b] = seatsOfTeam(opp);
	const oppMeld =
		selectBestMelds(doc.melds.declared[a] ?? []).sum +
		selectBestMelds(doc.melds.declared[b] ?? []).sum;

	const meldPoints: [number, number] = [0, 0];
	meldPoints[opp] = oppMeld;
	doc.melds.points = [...meldPoints];
	doc.melds.scoredTeam = oppMeld > 0 ? opp : null;
	doc.melds.resolved = true;

	const awarded: [number, number] = [0, 0];
	awarded[opp] = 162 + oppMeld;

	settleHand(doc, {
		dealer: doc.dealer,
		trump: doc.trump as Suit,
		maker: doc.maker as TeamId,
		trickPoints: [0, 0],
		meldPoints,
		set: false,
		renege: true,
		awarded,
		runningAfter: [0, 0]
	});
}

function settleHand(doc: GameDoc, result: HandResult): void {
	doc.score.running[0] += result.awarded[0];
	doc.score.running[1] += result.awarded[1];
	result.runningAfter = [doc.score.running[0], doc.score.running[1]];
	doc.score.hands.push(result);
	doc.trick = null;

	const w = checkGameEnd(doc.score.running);
	if (w != null) {
		doc.winner = w;
		doc.phase = 'gameOver';
		doc.log.push(`team ${w} wins ${doc.score.running[w]}–${doc.score.running[w ^ 1]}`);
	} else {
		doc.phase = 'handScored';
		doc.log.push(
			`hand scored: team 0 ${doc.score.running[0]}, team 1 ${doc.score.running[1]}` +
				(result.renege ? ' (renege)' : result.set ? ' (makers set)' : '')
		);
	}
}
