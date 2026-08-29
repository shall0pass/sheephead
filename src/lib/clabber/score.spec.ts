import { describe, it, expect } from 'vitest';
import { checkGameEnd, scoreHand, trickPointsSoFar } from './score';
import { cardPoints } from './cards';
import { createGame } from './state';
import type { Card, GameDoc, TeamId } from './types';

// Team 0 (seats 0 & 2) takes every trump and every ace/ten; team 1 gets the rest.
const TEAM0: Card[] = ['AS', 'KS', 'QS', 'JS', 'TS', '9S', 'AH', 'TH', 'AD', 'TD', 'AC', 'TC'];
const TEAM1: Card[] = ['KH', 'QH', 'JH', '9H', 'KD', 'QD', 'JD', '9D', 'KC', 'QC', 'JC', '9C'];

function tricks(cards: Card[]): Card[][] {
	return [cards.slice(0, 4), cards.slice(4, 8), cards.slice(8, 12)];
}

function scoredDoc(maker: TeamId, meldPoints: [number, number] = [0, 0]): GameDoc {
	const doc = createGame('T', 0);
	doc.trump = 'S';
	doc.maker = maker;
	doc.wonBySeat = [tricks(TEAM0), tricks(TEAM1), [], []];
	doc.lastTrickWinner = 0; // team 0 takes the last trick
	doc.melds.points = meldPoints;
	return doc;
}

const team0Trick = TEAM0.reduce((n, c) => n + cardPoints(c, 'S'), 0) + 10; // + last trick
const team1Trick = TEAM1.reduce((n, c) => n + cardPoints(c, 'S'), 0);

describe('scoreHand', () => {
	it('the 152 card points plus the last-trick 10 total 162', () => {
		expect(team0Trick + team1Trick).toBe(162);
	});

	it('when the makers out-score their opponents, both teams keep their points', () => {
		const r = scoreHand(scoredDoc(0));
		expect(r.set).toBe(false);
		expect(r.awarded).toEqual([team0Trick, team1Trick]);
	});

	it('when the makers fall short they are set and score nothing', () => {
		const r = scoreHand(scoredDoc(1));
		expect(r.set).toBe(true);
		expect(r.awarded).toEqual([team0Trick, 0]);
	});

	it('a big meld can save the makers from being set', () => {
		const r = scoreHand(scoredDoc(1, [0, 200])); // four jacks
		expect(r.set).toBe(false);
		expect(r.awarded).toEqual([team0Trick, team1Trick + 200]);
	});

	it('a meld that still leaves the makers behind does not save them', () => {
		const r = scoreHand(scoredDoc(1, [0, 100]));
		expect(r.set).toBe(true);
		expect(r.awarded).toEqual([team0Trick, 0]); // the 100 meld is lost too
	});
});

describe('checkGameEnd', () => {
	it('keeps playing below 500', () => {
		expect(checkGameEnd([499, 300])).toBeNull();
	});
	it('ends when one team reaches 500', () => {
		expect(checkGameEnd([500, 300])).toBe(0);
		expect(checkGameEnd([300, 512])).toBe(1);
	});
	it('gives it to the higher score when both cross 500', () => {
		expect(checkGameEnd([510, 505])).toBe(0);
	});
	it('plays another hand on an exact tie at or above 500', () => {
		expect(checkGameEnd([500, 500])).toBeNull();
		expect(checkGameEnd([520, 520])).toBeNull();
	});
});

describe('trickPointsSoFar', () => {
	it('sums card points per team, with no last-trick bonus', () => {
		const doc = createGame('T', 0);
		doc.trump = 'S';
		doc.wonBySeat = [
			[['AS', 'KH']], // seat 0 (team 0): 11 + 4
			[['9H', 'QC']], // seat 1 (team 1): 0 + 3
			[],
			[]
		];
		expect(trickPointsSoFar(doc)).toEqual([15, 3]);
	});

	it('is [0, 0] before any trick is taken', () => {
		expect(trickPointsSoFar(createGame('T', 0))).toEqual([0, 0]);
	});
});
