import { describe, expect, it } from 'vitest';
import { RuleError, reduce } from './reducer';
import { createGame } from './state';
import { legalCalls } from './partner';
import { legalMoves } from './play';
import { chooseBury, chooseCall, chooseCard, choosePick } from './bot';
import type { Action } from './actions';
import type { GameDoc, Seat } from './types';

function lobbyWithFiveBots(): GameDoc {
	const doc = createGame('R', 0);
	for (let s = 0 as Seat; s < 5; s = (s + 1) as Seat) {
		reduce(doc, { type: 'SetBot', seat: s, isBot: true, botName: `Bot ${s}` });
	}
	return doc;
}

describe('lobby', () => {
	it('seats five players and refuses to deal until all are filled', () => {
		const doc = createGame('R', 0);
		reduce(doc, { type: 'JoinSeat', seat: 0, name: 'Ada', actorId: 'a' });
		expect(() => reduce(doc, { type: 'StartHand', seed: 's' })).toThrow(RuleError);
		for (const s of [1, 2, 3, 4] as Seat[]) reduce(doc, { type: 'SetBot', seat: s, isBot: true });
		reduce(doc, { type: 'StartHand', seed: 's' });
		expect(doc.phase).toBe('picking');
	});

	it('a human cannot take an occupied seat', () => {
		const doc = createGame('R', 0);
		reduce(doc, { type: 'JoinSeat', seat: 2, name: 'Ada', actorId: 'a' });
		expect(() => reduce(doc, { type: 'JoinSeat', seat: 2, name: 'Bo', actorId: 'b' })).toThrow();
	});
});

describe('dealing', () => {
	it('deals six each, a two-card blind, and opens picking with the dealer’s left', () => {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed: 'deal' });
		expect(doc.hands.every((h) => h.length === 6)).toBe(true);
		expect(doc.blind).toHaveLength(2);
		expect(doc.handNumber).toBe(1);
		expect(doc.picking?.turn).toBe(1); // dealer 0 -> eldest 1
	});
});

describe('picking', () => {
	it('a pick absorbs the blind and moves to the bury', () => {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed: 'deal' });
		reduce(doc, { type: 'Pick', seat: 1 });
		expect(doc.picker).toBe(1);
		expect(doc.hands[1]).toHaveLength(8);
		expect(doc.blind).toHaveLength(0);
		expect(doc.phase).toBe('bury');
	});

	it('passes go clockwise; five passes re-deal with the same dealer', () => {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed: 'deal' });
		for (const s of [1, 2, 3, 4, 0] as Seat[]) reduce(doc, { type: 'Pass', seat: s });
		expect(doc.phase).toBe('redeal');
		expect(doc.dealer).toBe(0);
		reduce(doc, { type: 'StartHand', seed: 'again' });
		expect(doc.dealer).toBe(0); // unchanged on a re-deal
		expect(doc.handNumber).toBe(1); // not advanced by a re-deal
	});

	it('rejects a pick out of turn', () => {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed: 'deal' });
		expect(() => reduce(doc, { type: 'Pick', seat: 3 })).toThrow();
	});
});

describe('bury + call', () => {
	function toBury(seed: string): GameDoc {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed });
		reduce(doc, { type: 'Pick', seat: 1 });
		return doc;
	}

	it('buries exactly two held cards, then opens the partner call', () => {
		const doc = toBury('bury-1');
		const [a, b] = doc.hands[1].slice(0, 2);
		reduce(doc, { type: 'Bury', seat: 1, cards: [a, b] });
		expect(doc.hands[1]).toHaveLength(6);
		expect(doc.buried).toEqual([a, b]);
		expect(doc.phase).toBe('callPartner');
	});

	it('rejects burying a card not held, or the same card twice', () => {
		const doc = toBury('bury-2');
		const held = doc.hands[1][0];
		const notHeld = (['AS', 'AH', 'AC', 'AD'] as const).find((c) => !doc.hands[1].includes(c))!;
		expect(() => reduce(doc, { type: 'Bury', seat: 1, cards: [held, notHeld] })).toThrow();
		expect(() => reduce(doc, { type: 'Bury', seat: 1, cards: [held, held] })).toThrow();
	});

	it('always offers going alone, and resolves a called ace to its holder', () => {
		const doc = toBury('call-1');
		reduce(doc, { type: 'Bury', seat: 1, cards: chooseBury(doc) });
		const opts = legalCalls(doc);
		expect(opts.some((o) => o.kind === 'alone')).toBe(true);

		reduce(doc, { type: 'CallPartner', seat: 1, call: chooseCall(doc) });
		expect(doc.phase).toBe('trick');
		expect(doc.trick?.number).toBe(1);
		expect(doc.trick?.leader).toBe(1); // eldest hand leads
		if (doc.call?.kind !== 'alone') {
			expect(doc.calledCard).not.toBeNull();
			expect(doc.hands[doc.partnerSeat as Seat]).toContain(doc.calledCard);
			expect(doc.partnerRevealed).toBe(false);
		}
	});

	it('going alone leaves no partner and is public immediately', () => {
		const doc = toBury('alone-1');
		reduce(doc, { type: 'Bury', seat: 1, cards: chooseBury(doc) });
		reduce(doc, { type: 'CallPartner', seat: 1, call: { alone: true } });
		expect(doc.call).toEqual({ kind: 'alone' });
		expect(doc.partnerSeat).toBeNull();
		expect(doc.partnerRevealed).toBe(true);
	});
});

describe('a full hand', () => {
	/** Drive five bots through one dealt hand until it scores. */
	function playHand(doc: GameDoc): void {
		let guard = 0;
		while (doc.phase !== 'handScored' && doc.phase !== 'gameOver' && doc.phase !== 'redeal') {
			if (++guard > 500) throw new Error(`stuck in ${doc.phase}`);
			let action: Action;
			switch (doc.phase) {
				case 'picking': {
					const seat = doc.picking!.turn;
					action = choosePick(doc, seat) ? { type: 'Pick', seat } : { type: 'Pass', seat };
					break;
				}
				case 'bury':
					action = { type: 'Bury', seat: doc.picker!, cards: chooseBury(doc) };
					break;
				case 'callPartner':
					action = { type: 'CallPartner', seat: doc.picker!, call: chooseCall(doc) };
					break;
				case 'trick': {
					const seat = doc.trick!.turn;
					const card = chooseCard(doc, seat);
					expect(legalMoves(doc, seat)).toContain(card);
					action = { type: 'PlayCard', seat, card };
					break;
				}
				default:
					throw new Error(`unexpected ${doc.phase}`);
			}
			reduce(doc, action);
		}
	}

	it('conserves 120 card points and produces a zero-sum result', () => {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed: 'full-hand-7' });
		playHand(doc);
		if (doc.phase === 'redeal') return; // everyone passed; nothing to score
		const r = doc.score.hands.at(-1)!;
		expect(r.pickerPoints + r.oppPoints).toBe(120);
		expect(r.awarded.reduce((a, b) => a + b, 0)).toBe(0);
		expect(doc.score.tally.reduce((a, b) => a + b, 0)).toBe(0);
		// every card ends up in exactly one trick pile or the bury
		const placed = doc.tricksWon.flat(2).length + doc.buried.length;
		expect(placed).toBe(32);
	});

	it('ends the game after handsToPlay hands and names the winners', () => {
		const doc = lobbyWithFiveBots();
		doc.handsToPlay = 2;
		let guard = 0;
		while (doc.phase !== 'gameOver') {
			if (++guard > 50) throw new Error('game did not end');
			if (doc.phase === 'lobby' || doc.phase === 'handScored' || doc.phase === 'redeal') {
				reduce(doc, { type: 'StartHand', seed: `g-${guard}` });
			} else {
				playHand(doc);
			}
		}
		expect(doc.winners).not.toBeNull();
		expect(doc.score.tally.reduce((a, b) => a + b, 0)).toBe(0);
		expect(doc.winners!.every((s) => doc.score.tally[s] > 0)).toBe(true);
	});
});

describe('ResetToLobby', () => {
	it('clears the board and the tally but only after a game', () => {
		const doc = lobbyWithFiveBots();
		reduce(doc, { type: 'StartHand', seed: 'x' });
		expect(() => reduce(doc, { type: 'ResetToLobby' })).toThrow();

		doc.phase = 'gameOver';
		doc.score.tally = [3, -1, -1, -1, 0];
		reduce(doc, { type: 'ResetToLobby' });
		expect(doc.phase).toBe('lobby');
		expect(doc.handNumber).toBe(0);
		expect(doc.score.tally).toEqual([0, 0, 0, 0, 0]);
		expect(doc.players.every((p) => p != null)).toBe(true); // seats kept
	});
});
