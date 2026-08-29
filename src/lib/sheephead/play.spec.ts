import { describe, expect, it } from 'vitest';
import { legalMoves } from './play';
import { createGame } from './state';
import type { Call, Card, GameDoc, Seat, TrickPlay } from './types';

function trickDoc(opts: {
	hands: Partial<Record<Seat, Card[]>>;
	turn: Seat;
	plays?: TrickPlay[];
	number?: number;
	call?: Call | null;
	picker?: Seat | null;
	partnerSeat?: Seat | null;
}): GameDoc {
	const doc = createGame('T', 0);
	doc.phase = 'trick';
	doc.picker = opts.picker ?? 0;
	doc.partnerSeat = opts.partnerSeat ?? null;
	doc.call = opts.call ?? { kind: 'alone' };
	doc.calledCard = doc.call && doc.call.kind !== 'alone' ? doc.call.card : null;
	for (let s = 0 as Seat; s < 5; s = (s + 1) as Seat) doc.hands[s] = opts.hands[s] ?? [];
	const leader = (opts.plays?.[0]?.seat ?? opts.turn) as Seat;
	doc.trick = {
		number: opts.number ?? 3,
		leader,
		turn: opts.turn,
		plays: opts.plays ?? []
	};
	return doc;
}

describe('legalMoves — following suit', () => {
	it('the leader may play anything', () => {
		const doc = trickDoc({ hands: { 2: ['AS', 'QC', '7H'] }, turn: 2, plays: [] });
		expect(new Set(legalMoves(doc, 2))).toEqual(new Set(['AS', 'QC', '7H']));
	});

	it('must follow the led fail suit when able', () => {
		const doc = trickDoc({
			hands: { 1: ['AS', '9S', 'QC', 'AH'] },
			turn: 1,
			plays: [{ seat: 0, card: 'KS' }]
		});
		expect(new Set(legalMoves(doc, 1))).toEqual(new Set(['AS', '9S']));
	});

	it('a led queen or jack means trump was led — must follow with trump', () => {
		const doc = trickDoc({
			hands: { 1: ['QH', '9D', 'AS', '7C'] },
			turn: 1,
			plays: [{ seat: 0, card: 'QS' }]
		});
		expect(new Set(legalMoves(doc, 1))).toEqual(new Set(['QH', '9D']));
	});

	it('when void of the led suit, anything goes — no forced trump-in', () => {
		const doc = trickDoc({
			hands: { 1: ['QC', '9D', 'AH', '7C'] },
			turn: 1,
			plays: [{ seat: 0, card: 'KS' }]
		});
		expect(new Set(legalMoves(doc, 1))).toEqual(new Set(['QC', '9D', 'AH', '7C']));
	});

	it('no obligation to overtrump', () => {
		const doc = trickDoc({
			hands: { 2: ['QS', 'JD', '7D'] }, // all trump; a low one is fine
			turn: 2,
			plays: [
				{ seat: 0, card: '9D' },
				{ seat: 1, card: 'QH' }
			]
		});
		expect(new Set(legalMoves(doc, 2))).toEqual(new Set(['QS', 'JD', '7D']));
	});
});

describe('legalMoves — the called ace', () => {
	const call: Call = { kind: 'called', card: 'AH' };

	it('the partner must play the called ace on the first heart lead', () => {
		const doc = trickDoc({
			hands: { 3: ['AH', 'KH', '9H', 'QC'] },
			turn: 3,
			plays: [{ seat: 0, card: '8H' }],
			call,
			partnerSeat: 3
		});
		expect(legalMoves(doc, 3)).toEqual(['AH']);
	});

	it('the partner may not slough the called ace on a different lead', () => {
		const doc = trickDoc({
			hands: { 3: ['AH', '9C', 'KC'] },
			turn: 3,
			plays: [{ seat: 0, card: 'KS' }], // spade led, partner is void of spades
			call,
			partnerSeat: 3
		});
		expect(new Set(legalMoves(doc, 3))).toEqual(new Set(['9C', 'KC']));
	});

	it('the picker may not dump the called-suit fail card early', () => {
		const doc = trickDoc({
			hands: { 0: ['KH', 'QC', 'JD', '7S'] }, // KH is the retained heart
			turn: 0,
			plays: [{ seat: 4, card: 'KC' }], // club led, picker void of clubs
			call,
			picker: 0
		});
		expect(new Set(legalMoves(doc, 0))).toEqual(new Set(['QC', 'JD', '7S']));
	});

	it('both bindings lift on the last trick', () => {
		const doc = trickDoc({
			hands: { 3: ['AH'] },
			turn: 3,
			number: 6,
			plays: [{ seat: 0, card: 'KC' }],
			call,
			partnerSeat: 3
		});
		expect(legalMoves(doc, 3)).toEqual(['AH']);
		const picker = trickDoc({
			hands: { 0: ['KH'] },
			turn: 0,
			number: 6,
			plays: [{ seat: 4, card: 'KC' }],
			call,
			picker: 0
		});
		expect(legalMoves(picker, 0)).toEqual(['KH']);
	});
});
