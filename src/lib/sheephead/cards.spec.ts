import { describe, expect, it } from 'vitest';
import {
	FULL_DECK,
	beats,
	cardPoints,
	failRank,
	isTrump,
	leadSuitOf,
	sortHand,
	trickWinner,
	trumpRank
} from './cards';
import type { Card } from './types';

describe('the deck', () => {
	it('has 32 distinct cards', () => {
		expect(FULL_DECK).toHaveLength(32);
		expect(new Set(FULL_DECK).size).toBe(32);
	});

	it('is worth 120 points in total', () => {
		expect(FULL_DECK.reduce((n, c) => n + cardPoints(c), 0)).toBe(120);
	});

	it('scores A=11 T=10 K=4 Q=3 J=2, nothing else', () => {
		expect(cardPoints('AS')).toBe(11);
		expect(cardPoints('TH')).toBe(10);
		expect(cardPoints('KC')).toBe(4);
		expect(cardPoints('QD')).toBe(3);
		expect(cardPoints('JS')).toBe(2);
		expect(cardPoints('9H')).toBe(0);
		expect(cardPoints('7C')).toBe(0);
	});
});

describe('trump', () => {
	it('is every queen, every jack and every diamond', () => {
		for (const c of ['QC', 'QS', 'QH', 'QD', 'JC', 'JS', 'JH', 'JD'] as Card[]) {
			expect(isTrump(c)).toBe(true);
		}
		for (const c of ['AD', 'TD', 'KD', '9D', '8D', '7D'] as Card[]) expect(isTrump(c)).toBe(true);
		expect(FULL_DECK.filter(isTrump)).toHaveLength(14);
	});

	it('treats a queen or jack as trump, not as its pip suit', () => {
		expect(leadSuitOf('QS')).toBe('T');
		expect(leadSuitOf('JC')).toBe('T');
		expect(leadSuitOf('AS')).toBe('S');
	});

	it('orders the 14 trump QC > QS > QH > QD > JC ... > 7D', () => {
		const order: Card[] = [
			'QC',
			'QS',
			'QH',
			'QD',
			'JC',
			'JS',
			'JH',
			'JD',
			'AD',
			'TD',
			'KD',
			'9D',
			'8D',
			'7D'
		];
		for (let i = 1; i < order.length; i++) {
			expect(trumpRank(order[i - 1])).toBeGreaterThan(trumpRank(order[i]));
		}
		expect(trumpRank('AS')).toBe(0);
	});

	it('ranks fail suits A T K 9 8 7', () => {
		const order: Card[] = ['AS', 'TS', 'KS', '9S', '8S', '7S'];
		for (let i = 1; i < order.length; i++) {
			expect(failRank(order[i - 1])).toBeGreaterThan(failRank(order[i]));
		}
		expect(failRank('QS')).toBe(0);
	});
});

describe('beats / trickWinner', () => {
	it('any trump beats any fail card', () => {
		expect(beats('7D', 'AS', 'S')).toBe(true);
		expect(beats('AS', '7D', 'S')).toBe(false);
	});

	it('the ten outranks the king in a fail suit', () => {
		expect(beats('TS', 'KS', 'S')).toBe(true);
	});

	it('a fail card off the led suit beats nothing', () => {
		expect(beats('AH', 'KS', 'S')).toBe(false); // hearts thrown on a spade lead
	});

	it('picks the highest trump, else the highest of the led fail suit', () => {
		expect(
			trickWinner([
				{ seat: 0, card: 'AS' },
				{ seat: 1, card: 'TS' },
				{ seat: 2, card: 'JH' }, // trump
				{ seat: 3, card: 'QS' }, // higher trump
				{ seat: 4, card: '9S' }
			])
		).toBe(3);
		expect(
			trickWinner([
				{ seat: 0, card: '9S' },
				{ seat: 1, card: 'AS' },
				{ seat: 2, card: 'KS' },
				{ seat: 3, card: '8H' },
				{ seat: 4, card: '7C' }
			])
		).toBe(1);
	});
});

describe('sortHand', () => {
	it('groups trump first (strongest first), then fail suits by rank', () => {
		const sorted = sortHand(['7S', 'AH', 'JD', 'QC', 'KS', '9D', 'AS']);
		expect(sorted).toEqual(['QC', 'JD', '9D', 'AS', 'KS', '7S', 'AH']);
	});
});
