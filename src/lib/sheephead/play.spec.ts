import { describe, it, expect } from 'vitest';
import { legalMoves } from './play';
import { reduce } from './reducer';
import { createGame } from './state';
import type { Card, GameDoc, Seat, TrickPlay } from './types';

function trickDoc(args: {
	trump: GameDoc['trump'];
	hands: Card[][];
	turn: Seat;
	plays?: TrickPlay[];
	number?: number;
	leader?: Seat;
}): GameDoc {
	const doc = createGame('T', 0);
	doc.phase = 'trick';
	doc.trump = args.trump;
	doc.maker = 0;
	doc.hands = args.hands.map((h) => [...h]);
	doc.trick = {
		number: args.number ?? 2,
		leader: args.leader ?? 0,
		turn: args.turn,
		plays: args.plays ?? [],
		winner: null
	};
	return doc;
}

const P = (seat: Seat, card: Card): TrickPlay => ({ seat, card });

describe('legalMoves', () => {
	it('lets the leader play anything', () => {
		const doc = trickDoc({ trump: 'S', hands: [['AH', '9S', 'KD'], [], [], []], turn: 0 });
		expect(legalMoves(doc, 0).sort()).toEqual(['9S', 'AH', 'KD']);
	});

	it('requires following the led suit, with no obligation to beat it', () => {
		const doc = trickDoc({
			trump: 'S',
			hands: [[], ['9H', 'KH', '9S', 'AD'], [], []],
			turn: 1,
			plays: [P(0, 'AH')]
		});
		expect(legalMoves(doc, 1).sort()).toEqual(['9H', 'KH']);
	});

	it('forces trumping in when void of the led suit', () => {
		const doc = trickDoc({
			trump: 'S',
			hands: [[], ['9S', 'KS', 'AD', 'QC'], [], []],
			turn: 1,
			plays: [P(0, 'AH')]
		});
		expect(legalMoves(doc, 1).sort()).toEqual(['9S', 'KS']);
	});

	it('forces overtrumping the highest trump so far — even the partner’s', () => {
		// Seat 1 (partner of seat 3) trumped in with KS; seat 3 must beat it.
		const doc = trickDoc({
			trump: 'S',
			hands: [[], [], [], ['9S', 'QS', 'AD']],
			turn: 3,
			plays: [P(0, 'AH'), P(1, 'KS'), P(2, '9H')]
		});
		expect(legalMoves(doc, 3)).toEqual(['9S']); // 9 of trump outranks the king
	});

	it('allows any trump when none of them can beat the highest', () => {
		const doc = trickDoc({
			trump: 'S',
			hands: [[], [], [], ['QS', 'TS', 'AD']],
			turn: 3,
			plays: [P(0, 'AH'), P(1, 'JS'), P(2, '9H')]
		});
		expect(legalMoves(doc, 3).sort()).toEqual(['QS', 'TS']);
	});

	it('when trump is led, must follow and overtrump if able', () => {
		const doc = trickDoc({
			trump: 'S',
			hands: [[], ['9S', 'QS', 'AH'], [], []],
			turn: 1,
			plays: [P(0, 'KS')]
		});
		expect(legalMoves(doc, 1)).toEqual(['9S']);
	});

	it('lets a player throw off anything when void of the led suit and trump', () => {
		const doc = trickDoc({
			trump: 'S',
			hands: [[], ['AH', 'KD', 'QC'], [], []],
			turn: 1,
			plays: [P(0, 'KS')]
		});
		expect(legalMoves(doc, 1).sort()).toEqual(['AH', 'KD', 'QC']);
	});
});

describe('playing out a trick', () => {
	it('awards the trick to the highest card and that seat leads next', () => {
		const doc = trickDoc({
			trump: 'S',
			number: 2,
			leader: 0,
			turn: 0,
			hands: [['AH'], ['9H'], ['QS'], ['KH']]
		});
		reduce(doc, { type: 'PlayCard', seat: 0, card: 'AH' });
		reduce(doc, { type: 'PlayCard', seat: 1, card: '9H' });
		reduce(doc, { type: 'PlayCard', seat: 2, card: 'QS' }); // trumps in
		reduce(doc, { type: 'PlayCard', seat: 3, card: 'KH' });

		// the fourth card is held on screen until AdvanceTrick
		expect(doc.phase).toBe('trickDone');
		expect(doc.trick?.plays).toHaveLength(4);
		expect(doc.trick?.winner).toBe(2);
		expect(doc.wonBySeat[2]).toEqual([]);

		reduce(doc, { type: 'AdvanceTrick' });
		expect(doc.wonBySeat[2]).toEqual([['AH', '9H', 'QS', 'KH']]);
		expect(doc.lastTrickWinner).toBe(2);
		expect(doc.trick).toMatchObject({ number: 3, leader: 2, turn: 2, plays: [], winner: null });
	});

	it('rejects a card that breaks suit-following', () => {
		const doc = trickDoc({
			trump: 'S',
			turn: 1,
			hands: [[], ['9H', 'AD'], [], []],
			plays: [P(0, 'KH')]
		});
		expect(() => reduce(doc, { type: 'PlayCard', seat: 1, card: 'AD' })).toThrow();
	});
});
