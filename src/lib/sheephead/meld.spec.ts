import { describe, it, expect } from 'vitest';
import { compareMeldClaim, detectMelds, resolveMeld, selectBestMelds } from './meld';
import { createGame } from './state';
import type { Card, GameDoc, MeldClaim, Suit } from './types';

const kinds = (claims: MeldClaim[]) => claims.map((c) => c.kind).sort();

describe('detectMelds', () => {
	it('finds a three-card sequence (dad)', () => {
		expect(kinds(detectMelds(['9H', 'TH', 'JH', 'AS', 'KC', 'QD'], 'S'))).toEqual(['dad']);
	});

	it('finds a four-card sequence (fifty)', () => {
		const m = detectMelds(['9H', 'TH', 'JH', 'QH', 'KC', 'QD'], 'S');
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ kind: 'fifty', points: 50 });
	});

	it('finds a five-card sequence (hundred)', () => {
		const m = detectMelds(['9H', 'TH', 'JH', 'QH', 'KH', 'QD'], 'S');
		expect(m[0]).toMatchObject({ kind: 'hundred', group: 'run', points: 100 });
	});

	it('scores four aces as a hundred and four jacks as two hundred', () => {
		expect(detectMelds(['AS', 'AH', 'AD', 'AC', 'KH', 'QH'], 'S')[0]).toMatchObject({
			kind: 'hundred',
			group: 'set',
			points: 100
		});
		expect(detectMelds(['JS', 'JH', 'JD', 'JC', 'KH', 'QH'], 'S')[0]).toMatchObject({
			kind: 'twohundred',
			points: 200
		});
	});

	it('finds two dads in different suits', () => {
		const m = detectMelds(['9H', 'TH', 'JH', '9C', 'TC', 'JC'], 'S');
		expect(kinds(m)).toEqual(['dad', 'dad']);
	});

	it('recognises bella (K + Q of trump), stackable with a dad for 40', () => {
		const m = detectMelds(['JS', 'QS', 'KS', 'AH', '9D', 'TC'], 'S');
		expect(kinds(m)).toEqual(['bella', 'dad']);
		expect(selectBestMelds(m).sum).toBe(40); // dad 20 + bella 20
	});

	it('does not award bella without a trump suit', () => {
		expect(detectMelds(['KS', 'QS', 'AH', '9D', 'TC', 'JH'], null)).toHaveLength(0);
	});
});

describe('compareMeldClaim', () => {
	const dad = (suit: Suit, top: number): MeldClaim => ({
		kind: 'dad',
		group: 'run',
		suit,
		cards: [],
		points: 20,
		top
	});

	it('ranks by points first', () => {
		expect(compareMeldClaim({ ...dad('H', 3), points: 50 }, dad('C', 6), 'S')).toBeGreaterThan(0);
	});

	it('breaks equal sequences by top card', () => {
		expect(compareMeldClaim(dad('H', 5), dad('C', 3), 'S')).toBeGreaterThan(0);
	});

	it('a trump sequence beats a non-trump sequence of equal rank', () => {
		expect(compareMeldClaim(dad('S', 4), dad('H', 4), 'S')).toBeGreaterThan(0);
	});

	it('two equal non-trump sequences are a push', () => {
		expect(compareMeldClaim(dad('H', 4), dad('C', 4), 'S')).toBe(0);
	});
});

describe('resolveMeld', () => {
	function docWithDeclared(decl: (Card[] | null)[], trump: GameDoc['trump'] = 'S'): GameDoc {
		const doc = createGame('T', 0);
		doc.trump = trump;
		doc.melds.declared = decl.map((h) => (h ? detectMelds(h, trump) : null));
		return doc;
	}

	it('gives the whole meld total to the team with the highest meld', () => {
		const doc = docWithDeclared([
			['9H', 'TH', 'JH', 'QH', 'AS', 'KC'], // team 0: fifty (50)
			['9C', 'TC', 'JC', 'AD', 'KD', 'QD'], // team 1: dad in clubs (20)
			['9S', 'TD', 'KH', '9D', 'AH', 'TS'], // team 0: nothing
			['JD', 'QC', 'AC', 'KS', 'QH', '9S'] // team 1: nothing
		]);
		resolveMeld(doc);
		expect(doc.melds.scoredTeam).toBe(0);
		expect(doc.melds.points).toEqual([50, 0]);
	});

	it('a losing team still scores its bella', () => {
		const doc = docWithDeclared([
			['AS', 'AH', 'AD', 'AC', '9H', 'TH'], // team 0: four aces (100)
			['KS', 'QS', 'JH', 'TD', '9D', 'TC'], // team 1: bella only (20)
			null,
			null
		]);
		resolveMeld(doc);
		expect(doc.melds.scoredTeam).toBe(0);
		expect(doc.melds.points).toEqual([100, 20]);
	});

	it('scores nobody (except bella) when the top melds are an equal-rank push', () => {
		const doc = docWithDeclared([
			['9H', 'TH', 'JH', 'AS', 'KC', 'AD'], // team 0: dad in hearts, top J
			['9C', 'TC', 'JC', 'KD', 'QD', 'AH'], // team 1: dad in clubs, top J
			null,
			null
		]);
		resolveMeld(doc);
		expect(doc.melds.scoredTeam).toBeNull();
		expect(doc.melds.points).toEqual([0, 0]);
	});
});
