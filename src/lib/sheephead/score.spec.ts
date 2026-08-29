import { describe, expect, it } from 'vitest';
import { scoreHand, checkGameEnd } from './score';
import { createGame } from './state';
import type { Call, Card, GameDoc, Seat } from './types';

/** Build a finished-hand doc. `won` maps a seat to the tricks it collected;
 *  only which seat holds which cards matters to scoring. */
function scoredDoc(opts: {
	picker: Seat;
	partnerSeat?: Seat | null;
	call?: Call;
	buried?: Card[];
	won: Partial<Record<Seat, Card[][]>>;
}): GameDoc {
	const doc = createGame('S', 0);
	doc.handNumber = 1;
	doc.picker = opts.picker;
	doc.partnerSeat = opts.partnerSeat ?? null;
	doc.call = opts.call ?? { kind: 'called', card: 'AH' };
	doc.calledCard = doc.call.kind === 'alone' ? null : doc.call.card;
	doc.buried = opts.buried ?? [];
	for (let s = 0 as Seat; s < 5; s = (s + 1) as Seat) doc.tricksWon[s] = opts.won[s] ?? [];
	return doc;
}

/** One card per "trick" — trick boundaries do not matter to scoring. */
const t = (cards: Card[]): Card[][] => cards.map((c) => [c]);

describe('scoreHand — partnered', () => {
	it('a plain win (61–89): picker +2, partner +1, opponents −1 each', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				won: {
					0: t(['AS', 'AH', 'AC', 'TD']), // 43
					2: t(['TS', 'TH', 'KC']), // 24  -> picker team 67
					1: t(['KS', 'KH', 'QS', 'QH', 'QC', 'QD', 'JS', 'JH', 'JC', 'JD'])
				}
			})
		);
		expect(r.pickerPoints).toBe(67);
		expect(r.oppPoints).toBe(53);
		expect(r.outcome).toBe('pickerWin');
		expect(r.awarded).toEqual([2, -1, 1, -1, -1]);
		expect(r.awarded.reduce((a, b) => a + b, 0)).toBe(0);
	});

	it('a schneider win (picker ≥ 90): +4 / +2 / −2', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				won: {
					0: t(['AS', 'AH', 'AC', 'TS', 'TH', 'TC']), // 63
					2: t(['KS', 'KH', 'KC', 'AD', 'TD']), // 33 -> 96
					1: t(['9H', '8H', '7H', '9C', '8C', '7C']) // opponents took a few tricks, no points
				}
			})
		);
		expect(r.pickerPoints).toBe(96);
		expect(r.outcome).toBe('pickerWinSchneider');
		expect(r.awarded).toEqual([4, -2, 2, -2, -2]);
	});

	it('a no-tricker win is decided by trick count, not points', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				won: { 0: [['9S'], ['8S'], ['7S']], 2: [['9H'], ['8H'], ['7H']] } // 0 points, all 6 tricks
			})
		);
		expect(r.pickerPoints).toBe(0);
		expect(r.outcome).toBe('pickerWinNoTrick');
		expect(r.awarded).toEqual([6, -3, 3, -3, -3]);
	});

	it('a plain loss (picker 31–60): −2 / −1 / +1', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				won: {
					0: t(['AS', 'TS', 'KS', 'KH', 'KC']), // 33
					2: t(['9S', '8S']), // 0
					1: t(['AH', 'TH', 'AC', 'TC', 'AD']),
					3: t(['TD', 'KD', '9D', '8D'])
				}
			})
		);
		expect(r.pickerPoints).toBe(33);
		expect(r.outcome).toBe('pickerLoss');
		expect(r.awarded).toEqual([-2, 1, -1, 1, 1]);
	});

	it('a schneider loss (picker ≤ 30): −4 / −2 / +2', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				won: {
					0: t(['KS', '9S']), // 4
					2: t(['8S', '7S']), // 0
					1: t(['AS', 'TS', 'AH', 'TH', 'KH'])
				}
			})
		);
		expect(r.pickerPoints).toBe(4);
		expect(r.outcome).toBe('pickerLossSchneider');
		expect(r.awarded).toEqual([-4, 2, -2, 2, 2]);
	});

	it('opponents take every trick: picker −9, partner 0, opponents +3', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				buried: ['KH', '9H'], // 4 points the picker still keeps
				won: { 1: [['AS'], ['AH']], 3: [['TS'], ['TH']], 4: [['KS'], ['KC']] }
			})
		);
		expect(r.outcome).toBe('pickerLossNoTrick');
		expect(r.pickerPoints).toBe(4);
		expect(r.oppPoints).toBe(116);
		expect(r.awarded).toEqual([-9, 3, 0, 3, 3]);
	});

	it('the buried cards count for the picker', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				buried: ['AS', 'AH'], // 22
				won: { 0: t(['AC', 'TC', 'KC', 'TS', 'KS']), 1: t(['AD', 'TD']) }
			})
		);
		expect(r.pickerPoints).toBe(22 + 39);
	});

	it('boundary: picker 61 wins, 60 loses', () => {
		const win = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				buried: ['AS', 'KH'], // 15
				won: { 0: t(['AH', 'AC', 'TS', 'TH', 'KC']), 1: [['9H'], ['8H']] } // 46 -> 61
			})
		);
		expect(win.pickerPoints).toBe(61);
		expect(win.outcome).toBe('pickerWin');

		const loss = scoreHand(
			scoredDoc({
				picker: 0,
				partnerSeat: 2,
				buried: ['AS', 'QH'], // 14
				won: { 0: t(['AH', 'AC', 'TS', 'TH', 'KC']), 1: [['9H'], ['8H']] } // 46 -> 60
			})
		);
		expect(loss.pickerPoints).toBe(60);
		expect(loss.outcome).toBe('pickerLoss');
	});
});

describe('scoreHand — going alone', () => {
	it('a plain win alone: picker +4, each opponent −1', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 0,
				call: { kind: 'alone' },
				won: {
					0: t(['AS', 'AH', 'AC', 'TS', 'TH', 'TC', 'KS']), // 66
					1: t(['9S', '8S', '7S']),
					2: t(['KH', 'KC', 'AD', 'TD', 'KD'])
				}
			})
		);
		expect(r.alone).toBe(true);
		expect(r.outcome).toBe('pickerWin');
		expect(r.awarded).toEqual([4, -1, -1, -1, -1]);
	});

	it('a no-tricker alone: +12 vs −3 each', () => {
		const r = scoreHand(
			scoredDoc({
				picker: 2,
				call: { kind: 'alone' },
				won: { 2: [['AS'], ['AH'], ['AC'], ['KS'], ['KH'], ['KC']] }
			})
		);
		expect(r.outcome).toBe('pickerWinNoTrick');
		expect(r.awarded).toEqual([-3, -3, 12, -3, -3]);
	});
});

describe('checkGameEnd', () => {
	it('is true once handNumber reaches handsToPlay', () => {
		const doc = createGame('G', 0);
		doc.handsToPlay = 3;
		doc.handNumber = 2;
		expect(checkGameEnd(doc)).toBe(false);
		doc.handNumber = 3;
		expect(checkGameEnd(doc)).toBe(true);
	});
});
