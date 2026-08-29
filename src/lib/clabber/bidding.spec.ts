import { describe, it, expect } from 'vitest';
import { legalBids } from './bidding';
import { RuleError, reduce } from './reducer';
import { createGame, nextSeat, SEATS } from './state';
import type { Card, GameDoc, Seat } from './types';

// Six spades are split so seat 2 holds none (it cannot make spades trump).
const HANDS: Card[][] = [
	['JS', 'AS', 'TS', 'KS', '9C', '9D'], // seat 0 (dealer) — holds the up-card
	['QS', '9S', 'AH', 'KH', 'QH', 'JH'], // seat 1
	['AD', 'KD', 'QD', 'JD', 'TD', '9H'], // seat 2 — no spades
	['AC', 'KC', 'QC', 'JC', 'TC', 'TH'] // seat 3
];

function atBidding(dealer: Seat = 0, upCard: Card = 'JS'): GameDoc {
	const doc = createGame('T', 0);
	for (const s of SEATS) reduce(doc, { type: 'SetBot', seat: s, isBot: true });
	reduce(doc, { type: 'StartHand', seed: 'x' });
	doc.hands = HANDS.map((h) => [...h]);
	doc.upCard = upCard;
	doc.dealer = dealer;
	doc.bidding = { round: 1, turn: nextSeat(dealer), passes: [], passedSuit: null };
	doc.phase = 'bid1';
	return doc;
}

describe('round 1', () => {
	it('accepting the up-card makes its suit trump and starts the first trick', () => {
		const doc = atBidding();
		reduce(doc, { type: 'Bid', seat: 1, bid: 'accept' });
		expect(doc.trump).toBe('S');
		expect(doc.maker).toBe(1);
		expect(doc.phase).toBe('meld');
		expect(doc.upCard).toBeNull();
		expect(doc.trick).toMatchObject({ number: 1, leader: 1, turn: 1, plays: [] });
	});

	it('will not let a player accept a suit they hold no card of', () => {
		const doc = atBidding();
		reduce(doc, { type: 'Bid', seat: 1, bid: 'pass' });
		expect(legalBids(doc, 2)).toEqual(['pass']);
		expect(() => reduce(doc, { type: 'Bid', seat: 2, bid: 'accept' })).toThrow(RuleError);
	});

	it('rejects a bid out of turn', () => {
		const doc = atBidding();
		expect(() => reduce(doc, { type: 'Bid', seat: 2, bid: 'pass' })).toThrow(RuleError);
	});

	it('after four passes, moves to round 2 and forbids the passed suit', () => {
		const doc = atBidding();
		for (const s of [1, 2, 3, 0] as Seat[]) reduce(doc, { type: 'Bid', seat: s, bid: 'pass' });
		expect(doc.phase).toBe('bid2');
		expect(doc.bidding).toMatchObject({ round: 2, turn: 1, passes: [], passedSuit: 'S' });
	});
});

describe('round 2', () => {
	const toRound2 = () => {
		const doc = atBidding();
		for (const s of [1, 2, 3, 0] as Seat[]) reduce(doc, { type: 'Bid', seat: s, bid: 'pass' });
		return doc;
	};

	it('lets a player name any suit they hold except the passed one', () => {
		const doc = toRound2();
		expect(legalBids(doc, 1)).toEqual(['pass', { suit: 'H' }]);
		reduce(doc, { type: 'Bid', seat: 1, bid: { suit: 'H' } });
		expect(doc.trump).toBe('H');
		expect(doc.maker).toBe(1);
		expect(doc.phase).toBe('meld');
	});

	it('rejects naming the suit passed in round 1', () => {
		const doc = toRound2();
		expect(() => reduce(doc, { type: 'Bid', seat: 1, bid: { suit: 'S' } })).toThrow(RuleError);
	});

	it('re-deals with the same dealer when everyone passes twice', () => {
		const doc = toRound2();
		for (const s of [1, 2, 3, 0] as Seat[]) reduce(doc, { type: 'Bid', seat: s, bid: 'pass' });
		expect(doc.phase).toBe('redeal');
		expect(doc.bidding).toBeNull();

		const dealerBefore = doc.dealer;
		reduce(doc, { type: 'StartHand', seed: 'y' });
		expect(doc.dealer).toBe(dealerBefore);
		expect(doc.phase).toBe('bid1');
	});
});
