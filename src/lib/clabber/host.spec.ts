import { describe, it, expect } from 'vitest';
import { nextBotAction, pickHost } from './host';
import { reduce } from './reducer';
import { createGame, SEATS } from './state';
import type { GameDoc } from './types';

function fourBots(): GameDoc {
	const doc = createGame('T', 0);
	for (const s of SEATS) reduce(doc, { type: 'SetBot', seat: s, isBot: true });
	return doc;
}

describe('pickHost', () => {
	it('is the lexicographically smallest id', () => {
		expect(pickHost([])).toBeNull();
		expect(pickHost(['only'])).toBe('only');
		expect(pickHost(['m', 'a', 'z'])).toBe('a');
	});
});

describe('HostClaim', () => {
	it('records the claimant and allows takeover', () => {
		const doc = createGame('T', 0);
		expect(doc.hostActorId).toBe('');
		reduce(doc, { type: 'HostClaim', actorId: 'alice' });
		expect(doc.hostActorId).toBe('alice');
		reduce(doc, { type: 'HostClaim', actorId: 'bob' });
		expect(doc.hostActorId).toBe('bob');
	});
});

describe('CoverSeat', () => {
	it('flips a seated player between human and bot, keeping name and actorId', () => {
		const doc = createGame('T', 0);
		reduce(doc, { type: 'JoinSeat', seat: 1, name: 'Ada', actorId: 'ada' });
		reduce(doc, { type: 'CoverSeat', seat: 1, isBot: true });
		expect(doc.players[1]).toMatchObject({ name: 'Ada', actorId: 'ada', isBot: true });
		reduce(doc, { type: 'CoverSeat', seat: 1, isBot: false });
		expect(doc.players[1]).toMatchObject({ name: 'Ada', actorId: 'ada', isBot: false });
	});

	it('is a no-op on an empty seat', () => {
		const doc = createGame('T', 0);
		reduce(doc, { type: 'CoverSeat', seat: 2, isBot: true });
		expect(doc.players[2]).toBeNull();
	});
});

describe('nextBotAction', () => {
	it('does nothing in the lobby or once the game is over', () => {
		expect(nextBotAction(createGame('T', 0))).toBeNull();
		const doc = fourBots();
		reduce(doc, { type: 'StartHand', seed: 's' });
		doc.phase = 'gameOver';
		expect(nextBotAction(doc)).toBeNull();
	});

	it('bids for the bot whose turn it is', () => {
		const doc = fourBots();
		reduce(doc, { type: 'StartHand', seed: 's' });
		const a = nextBotAction(doc);
		expect(a?.type).toBe('Bid');
		expect(a && 'seat' in a && a.seat).toBe(doc.bidding!.turn);
	});

	it('returns null when it is a human seat’s turn', () => {
		const doc = createGame('T', 0);
		reduce(doc, { type: 'JoinSeat', seat: 1, name: 'H', actorId: 'h' });
		for (const s of [0, 2, 3] as const) reduce(doc, { type: 'SetBot', seat: s, isBot: true });
		reduce(doc, { type: 'StartHand', seed: 's' });
		expect(doc.bidding!.turn).toBe(1); // left of dealer 0 — the human
		expect(nextBotAction(doc)).toBeNull();
	});

	it('announces meld before playing to the first trick', () => {
		let doc = fourBots();
		// Search seeds until a hand actually reaches the meld phase.
		for (let i = 0; i < 20; i++) {
			doc = fourBots();
			reduce(doc, { type: 'StartHand', seed: `meld-${i}` });
			while (doc.phase === 'bid1' || doc.phase === 'bid2' || doc.phase === 'redeal') {
				reduce(doc, nextBotAction(doc)!);
			}
			if (doc.phase === 'meld') break;
		}
		expect(doc.phase).toBe('meld');
		const first = nextBotAction(doc)!;
		expect(first.type).toBe('AnnounceMeld');
		reduce(doc, first);
		expect(nextBotAction(doc)!.type).toBe('PlayCard');
	});

	it('drives four bots through a whole game', () => {
		const doc = fourBots();
		reduce(doc, { type: 'StartHand', seed: 'whole-game' });
		let guard = 0;
		while (doc.phase !== 'gameOver') {
			if (++guard > 100_000) throw new Error('game did not finish');
			const a = nextBotAction(doc);
			if (!a) throw new Error(`no action for phase ${doc.phase}`);
			reduce(doc, a);
		}
		expect([0, 1]).toContain(doc.winner);
		expect(Math.max(...doc.score.running)).toBeGreaterThanOrEqual(500);
	});
});
