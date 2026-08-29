import { describe, it, expect } from 'vitest';
import {
	FULL_DECK,
	beats,
	cardPoints,
	nonTrumpStrength,
	sortHand,
	trickWinner,
	trumpStrength
} from './cards';
import type { Card, TrickPlay } from './types';

describe('the deck', () => {
	it('has 24 distinct cards, six per suit', () => {
		expect(FULL_DECK).toHaveLength(24);
		expect(new Set(FULL_DECK).size).toBe(24);
		for (const s of ['S', 'H', 'D', 'C']) {
			expect(FULL_DECK.filter((c) => c[1] === s)).toHaveLength(6);
		}
	});
});

describe('card points', () => {
	it('scores non-trump cards A11 10-10 K4 Q3 J2 9-0', () => {
		expect(cardPoints('AH', 'S')).toBe(11);
		expect(cardPoints('TH', 'S')).toBe(10);
		expect(cardPoints('KH', 'S')).toBe(4);
		expect(cardPoints('QH', 'S')).toBe(3);
		expect(cardPoints('JH', 'S')).toBe(2);
		expect(cardPoints('9H', 'S')).toBe(0);
	});

	it('scores trump cards J20 9-14 A11 10-10 K4 Q3', () => {
		expect(cardPoints('JS', 'S')).toBe(20);
		expect(cardPoints('9S', 'S')).toBe(14);
		expect(cardPoints('AS', 'S')).toBe(11);
		expect(cardPoints('TS', 'S')).toBe(10);
		expect(cardPoints('KS', 'S')).toBe(4);
		expect(cardPoints('QS', 'S')).toBe(3);
	});

	it('totals 162 with the last-trick bonus', () => {
		const cards = 24;
		expect(cards).toBe(FULL_DECK.length);
		const total = FULL_DECK.reduce((n, c) => n + cardPoints(c, 'S'), 0);
		expect(total).toBe(152);
		expect(total + 10).toBe(162);
	});
});

describe('rank order', () => {
	it('ranks non-trump A 10 K Q J 9 high to low', () => {
		const order: Card[] = ['AH', 'TH', 'KH', 'QH', 'JH', '9H'];
		const sorted = [...order].sort((a, b) => nonTrumpStrength(b) - nonTrumpStrength(a));
		expect(sorted).toEqual(order);
	});

	it('ranks trump J 9 A 10 K Q high to low', () => {
		const order: Card[] = ['JS', '9S', 'AS', 'TS', 'KS', 'QS'];
		const sorted = [...order].sort((a, b) => trumpStrength(b) - trumpStrength(a));
		expect(sorted).toEqual(order);
	});
});

describe('beats / trickWinner', () => {
	const w = (cards: Card[], trump: Parameters<typeof beats>[2]) =>
		trickWinner(
			cards.map((card, i) => ({ seat: i as TrickPlay['seat'], card })),
			trump
		);

	it('highest card of the led suit wins when there is no trump', () => {
		expect(w(['9H', 'AH', 'KH', 'QH'], 'S')).toBe(1); // AH
	});

	it('off-suit discards never win', () => {
		// Clubs are trump; AS and AD are thrown off on a heart lead.
		expect(w(['KH', 'AS', 'AD', '9H'], 'C')).toBe(0); // KH still wins
	});

	it('any trump beats any non-trump', () => {
		expect(beats('9S', 'AH', 'S', 'H')).toBe(true);
		expect(beats('AH', '9S', 'S', 'H')).toBe(false);
	});

	it('among trumps the jack then nine are highest', () => {
		expect(w(['AS', 'TS', '9S', 'JS'], 'S')).toBe(3); // JS
		expect(w(['AS', 'TS', '9S', 'KS'], 'S')).toBe(2); // 9S
	});

	it('a trump played on a non-trump lead takes the trick', () => {
		expect(w(['AH', 'KH', 'QS', '9H'], 'S')).toBe(2); // QS
	});
});

describe('sortHand', () => {
	it('puts trump first (strongest first), then the other suits strongest first', () => {
		const hand: Card[] = ['9H', 'AH', 'KS', 'JS', '9S', 'AC'];
		// trump = spades: J,9,K (trump order J>9>K); then hearts A>9; then clubs A
		expect(sortHand(hand, 'S')).toEqual(['JS', '9S', 'KS', 'AH', '9H', 'AC']);
	});

	it('with no trump, groups by suit and orders A 10 K Q J 9', () => {
		const hand: Card[] = ['9S', 'AS', 'KH', 'AH', 'TH'];
		expect(sortHand(hand, null)).toEqual(['AS', '9S', 'AH', 'TH', 'KH']);
	});

	it('does not mutate the input', () => {
		const hand: Card[] = ['9S', 'AS'];
		sortHand(hand, 'S');
		expect(hand).toEqual(['9S', 'AS']);
	});
});
