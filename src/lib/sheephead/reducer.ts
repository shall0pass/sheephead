// The single entry point for changing a game. `reduce` mutates `doc` in place
// (so it drops straight into an Automerge `change` block) and throws
// `RuleError` on an illegal action. UI and bots should gate on the `legal*`
// helpers first; the throw is the backstop.

import type { Action, CallPayload } from './actions';
import type { Call, Card, GameDoc, Seat } from './types';
import { trickWinner } from './cards';
import { deal } from './deal';
import { isLegalBury } from './bury';
import { legalCalls, calledCardForSuit, seatHolding, type CallOption } from './partner';
import { legalMoves } from './play';
import { legalPickChoices } from './picking';
import { checkGameEnd, scoreHand } from './score';
import { SEATS, eldest, nextSeat } from './state';

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
		case 'StartHand':
			return startHand(doc, action);
		case 'Pick':
			return pick(doc, action.seat);
		case 'Pass':
			return pass(doc, action.seat);
		case 'Bury':
			return bury(doc, action.seat, action.cards);
		case 'CallPartner':
			return callPartner(doc, action.seat, action.call);
		case 'PlayCard':
			return playCard(doc, action.seat, action.card);
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

// --- lobby ---------------------------------------------------------------

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

function leaveTable(doc: GameDoc, a: Extract<Action, { type: 'LeaveTable' }>): void {
	if (!doc.players[a.seat]) return;
	const name = a.botName.trim() || `Bot ${a.seat + 1}`;
	doc.players[a.seat] = { seat: a.seat, name, isBot: true, botName: name, lastSeen: doc.createdAt };
	doc.log.push(`seat ${a.seat} left; ${name} takes over`);
}

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
	doc.handNumber = 0;
	clearHand(doc);
	doc.score = { tally: [0, 0, 0, 0, 0], hands: [] };
	doc.winners = null;
	doc.log.push('back to the lobby for another game');
}

/** Reset everything that belongs to a single hand. */
function clearHand(doc: GameDoc): void {
	doc.hands = [[], [], [], [], []];
	doc.blind = [];
	doc.picking = null;
	doc.picker = null;
	doc.buried = [];
	doc.call = null;
	doc.calledCard = null;
	doc.partnerSeat = null;
	doc.partnerRevealed = false;
	doc.trick = null;
	doc.tricksWon = [[], [], [], [], []];
	doc.lastTrickWinner = null;
}

// --- dealing -----------------------------------------------------------

function startHand(doc: GameDoc, a: Extract<Action, { type: 'StartHand' }>): void {
	if (doc.phase !== 'lobby' && doc.phase !== 'handScored' && doc.phase !== 'redeal') {
		fail(`cannot start a hand from phase ${doc.phase}`);
	}
	if (doc.players.some((p) => p == null)) fail('all five seats must be filled');

	const dealer: Seat = doc.phase === 'handScored' ? nextSeat(doc.dealer) : doc.dealer;
	if (doc.phase !== 'redeal') doc.handNumber += 1;

	const { hands, blind } = deal(a.seed, dealer);
	clearHand(doc);
	doc.dealer = dealer;
	doc.seed = a.seed;
	doc.hands = hands;
	doc.blind = blind;
	doc.picking = { turn: eldest(dealer), passed: [] };
	doc.phase = 'picking';
	doc.log.push(`hand ${doc.handNumber}: seat ${dealer} deals`);
}

// --- picking ---------------------------------------------------------------

function pick(doc: GameDoc, seat: Seat): void {
	if (!legalPickChoices(doc, seat).includes('pick')) fail(`seat ${seat} cannot pick now`);
	const picker = seat;
	doc.picker = picker;
	doc.hands[picker].push(...doc.blind);
	doc.blind = [];
	doc.picking = null;
	doc.phase = 'bury';
	doc.log.push(`seat ${picker} picks up the blind`);
}

function pass(doc: GameDoc, seat: Seat): void {
	if (!legalPickChoices(doc, seat).includes('pass')) fail(`seat ${seat} cannot pass now`);
	const p = doc.picking as NonNullable<GameDoc['picking']>;
	p.passed.push(seat);
	if (p.passed.length === 5) {
		doc.picking = null;
		doc.phase = 'redeal';
		doc.log.push('everyone passed; the same dealer re-deals');
		return;
	}
	p.turn = nextSeat(seat);
}

// --- bury ----------------------------------------------------------------

function bury(doc: GameDoc, seat: Seat, cards: [Card, Card]): void {
	if (doc.phase !== 'bury') fail(`cannot bury in phase ${doc.phase}`);
	if (seat !== doc.picker) fail(`seat ${seat} is not the picker`);
	if (!isLegalBury(doc, cards)) fail(`illegal bury: ${cards.join(' ')}`);
	const hand = doc.hands[seat];
	for (const c of cards) hand.splice(hand.indexOf(c), 1);
	doc.buried = [...cards];
	doc.phase = 'callPartner';
	doc.log.push(`seat ${seat} buries two cards`);
}

// --- call partner --------------------------------------------------------

function callPartner(doc: GameDoc, seat: Seat, payload: CallPayload): void {
	if (doc.phase !== 'callPartner') fail(`cannot call a partner in phase ${doc.phase}`);
	if (seat !== doc.picker) fail(`seat ${seat} is not the picker`);
	const opts = legalCalls(doc);

	let call: Call;
	if ('alone' in payload) {
		if (!opts.some((o) => o.kind === 'alone')) fail('cannot go alone now');
		call = { kind: 'alone' };
	} else if ('under' in payload) {
		if (!opts.some((o: CallOption) => o.kind === 'under' && o.suit === payload.suit)) {
			fail(`cannot go under on ${payload.suit}`);
		}
		if (!doc.hands[seat].includes(payload.hole)) fail(`hole card not in hand: ${payload.hole}`);
		call = { kind: 'under', card: `A${payload.suit}` as Card, hole: payload.hole };
	} else {
		const card = calledCardForSuit(opts, payload.suit);
		if (!card) fail(`cannot call ${payload.suit}`);
		call = { kind: 'called', card };
	}

	doc.call = call;
	if (call.kind === 'alone') {
		doc.calledCard = null;
		doc.partnerSeat = null;
		doc.partnerRevealed = true;
		doc.log.push(`seat ${seat} goes alone`);
	} else {
		doc.calledCard = call.card;
		doc.partnerSeat = seatHolding(doc, call.card);
		doc.partnerRevealed = false;
		doc.log.push(`seat ${seat} calls ${call.card}${call.kind === 'under' ? ' (under)' : ''}`);
	}

	const lead = eldest(doc.dealer);
	doc.trick = { number: 1, leader: lead, turn: lead, plays: [] };
	doc.phase = 'trick';
}

// --- trick play --------------------------------------------------------

function playCard(doc: GameDoc, seat: Seat, card: Card): void {
	if (doc.phase !== 'trick') fail(`cannot play a card in phase ${doc.phase}`);
	const t = doc.trick;
	if (!t) fail('no trick in progress');
	if (seat !== t.turn) fail(`it is not seat ${seat}'s turn`);
	if (!doc.hands[seat].includes(card)) fail(`card not in hand: ${card}`);
	if (!legalMoves(doc, seat).includes(card)) fail(`illegal card: ${card}`);

	const hand = doc.hands[seat];
	hand.splice(hand.indexOf(card), 1);

	const faceDown = doc.call?.kind === 'under' && seat === doc.picker && card === doc.call.hole;
	t.plays.push(faceDown ? { seat, card, faceDown: true } : { seat, card });

	if (doc.calledCard && card === doc.calledCard) doc.partnerRevealed = true;

	if (t.plays.length < 5) {
		t.turn = nextSeat(seat);
		return;
	}

	const contenders = t.plays.filter((p) => !p.faceDown);
	const winner = trickWinner(contenders);
	doc.tricksWon[winner].push(t.plays.map((p) => p.card));
	doc.lastTrickWinner = winner;
	doc.log.push(`trick ${t.number} to seat ${winner}`);

	if (t.number === 6) {
		finishHand(doc);
		return;
	}
	doc.trick = { number: t.number + 1, leader: winner, turn: winner, plays: [] };
}

function finishHand(doc: GameDoc): void {
	const result = scoreHand(doc);
	for (const s of SEATS) doc.score.tally[s] += result.awarded[s];
	doc.score.hands.push(result);
	doc.trick = null;
	doc.partnerRevealed = true;

	if (checkGameEnd(doc)) {
		doc.winners = SEATS.filter((s) => doc.score.tally[s] > 0);
		doc.phase = 'gameOver';
		doc.log.push(`game over after ${doc.handNumber} hands`);
	} else {
		doc.phase = 'handScored';
		doc.log.push(
			`hand ${doc.handNumber} scored (${result.outcome}); ` +
				`picker ${result.pickerPoints} / opp ${result.oppPoints}`
		);
	}
}
