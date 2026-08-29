import { describe, expect, it } from 'vitest';
import { chooseBury, chooseCall, chooseCard, choosePick } from './bot';
import { legalCalls } from './partner';
import { legalMoves } from './play';
import { createGame } from './state';
import type { Call, Card, GameDoc, Seat } from './types';

function pickingDoc(
	hand: Card[],
	seat: Seat,
	opts: { dealer?: Seat; passed?: Seat[] } = {}
): GameDoc {
	const doc = createGame('B', 0);
	doc.phase = 'picking';
	doc.dealer = opts.dealer ?? 0;
	doc.hands[seat] = hand;
	doc.picking = { turn: seat, passed: opts.passed ?? [] };
	return doc;
}

describe('choosePick', () => {
	it('picks a fat trump hand and passes a weak one', () => {
		const strong: Card[] = ['QC', 'QS', 'JC', 'JD', 'AD', 'KH'];
		const weak: Card[] = ['AS', 'KS', '9S', '8H', '7H', '9C'];
		expect(choosePick(pickingDoc(strong, 1), 1)).toBe(true);
		expect(choosePick(pickingDoc(weak, 1), 1)).toBe(false);
	});

	it('always picks when it is the last seat and everyone has passed', () => {
		const weak: Card[] = ['AS', 'KS', '9S', '8H', '7H', '9C'];
		const doc = pickingDoc(weak, 0, { dealer: 0, passed: [1, 2, 3, 4] });
		expect(choosePick(doc, 0)).toBe(true);
	});
});

describe('chooseBury', () => {
	it('returns two distinct held cards, keeping trump', () => {
		const doc = createGame('B', 0);
		doc.phase = 'bury';
		doc.picker = 2;
		doc.hands[2] = ['QC', 'JD', 'AD', '9D', 'AS', '7H', '8C', 'KC'];
		const [a, b] = chooseBury(doc);
		expect(a).not.toBe(b);
		expect(doc.hands[2]).toContain(a);
		expect(doc.hands[2]).toContain(b);
		expect([a, b].some((c) => ['QC', 'JD', 'AD', '9D'].includes(c))).toBe(false);
	});
});

describe('chooseCall', () => {
	it('goes alone with both black queens and a fat trump hand', () => {
		const doc = createGame('B', 0);
		doc.phase = 'callPartner';
		doc.picker = 0;
		doc.hands[0] = ['QC', 'QS', 'QH', 'JC', 'JS', 'AD'];
		expect(chooseCall(doc)).toEqual({ alone: true });
	});

	it('otherwise calls a fail ace it is short in', () => {
		const doc = createGame('B', 0);
		doc.phase = 'callPartner';
		doc.picker = 0;
		doc.hands[0] = ['QC', 'JD', 'AD', '9D', 'KS', '8H'];
		const call = chooseCall(doc);
		expect('suit' in call).toBe(true);
		const opts = legalCalls(doc);
		expect(opts.some((o) => o.kind === 'ace' && 'suit' in call && o.suit === call.suit)).toBe(true);
	});
});

describe('chooseCard', () => {
	function trickDoc(
		hands: Partial<Record<Seat, Card[]>>,
		turn: Seat,
		plays: { seat: Seat; card: Card }[],
		call: Call,
		picker: Seat,
		partnerSeat: Seat | null
	): GameDoc {
		const doc = createGame('B', 0);
		doc.phase = 'trick';
		doc.picker = picker;
		doc.partnerSeat = partnerSeat;
		doc.call = call;
		doc.calledCard = call.kind === 'alone' ? null : call.card;
		for (let s = 0 as Seat; s < 5; s = (s + 1) as Seat) doc.hands[s] = hands[s] ?? [];
		doc.trick = { number: 3, leader: plays[0]?.seat ?? turn, turn, plays };
		return doc;
	}

	it('always returns a legal card', () => {
		const doc = trickDoc(
			{ 2: ['AS', 'KS', 'QC', '7H'] },
			2,
			[{ seat: 1, card: '9S' }],
			{ kind: 'called', card: 'AH' },
			0,
			3
		);
		expect(legalMoves(doc, 2)).toContain(chooseCard(doc, 2));
	});

	it('schmears a big card onto a partner who has already won the trick', () => {
		// seat 0 (picker) leads and wins with a queen; seat 2 (partner) is last.
		const doc = trickDoc(
			{ 2: ['AS', '7S', '9H'] },
			2,
			[
				{ seat: 0, card: 'QC' },
				{ seat: 1, card: '9S' },
				{ seat: 3, card: '8S' },
				{ seat: 4, card: '7C' }
			],
			{ kind: 'called', card: 'AH' },
			0,
			2
		);
		expect(chooseCard(doc, 2)).toBe('AS');
	});
});
