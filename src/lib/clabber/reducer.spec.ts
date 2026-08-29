import { describe, it, expect } from 'vitest';
import { RuleError, reduce } from './reducer';
import { chooseBid, chooseCard } from './bot';
import { createGame, SEATS } from './state';
import type { Card, GameDoc, MeldClaim } from './types';

function fourBots(): GameDoc {
	const doc = createGame('T', 0);
	for (const s of SEATS) reduce(doc, { type: 'SetBot', seat: s, isBot: true, botName: `Bot ${s}` });
	return doc;
}

function playOneHand(doc: GameDoc): void {
	while (doc.phase === 'bid1' || doc.phase === 'bid2') {
		const seat = doc.bidding!.turn;
		reduce(doc, { type: 'Bid', seat, bid: chooseBid(doc, seat) });
	}
	while (doc.phase === 'meld' || doc.phase === 'trick' || doc.phase === 'trickDone') {
		if (doc.phase === 'trickDone') {
			reduce(doc, { type: 'AdvanceTrick' });
			continue;
		}
		const seat = doc.trick!.turn;
		if (doc.phase === 'meld' && doc.melds.declared[seat] == null) {
			reduce(doc, { type: 'AnnounceMeld', seat });
		}
		reduce(doc, { type: 'PlayCard', seat, card: chooseCard(doc, seat) });
	}
}

describe('createGame', () => {
	it('starts in the lobby with four empty seats and no score', () => {
		const doc = createGame('ROOM', 0);
		expect(doc.phase).toBe('lobby');
		expect(doc.players).toEqual([null, null, null, null]);
		expect(doc.score.running).toEqual([0, 0]);
	});
});

describe('lobby actions', () => {
	it('seats and renames players, and lets a human take over a bot seat', () => {
		const doc = fourBots();
		reduce(doc, { type: 'JoinSeat', seat: 2, name: 'Ada', actorId: 'a1' });
		expect(doc.players[2]).toMatchObject({ name: 'Ada', isBot: false, actorId: 'a1' });

		reduce(doc, { type: 'RenameSeat', seat: 2, name: 'Ada L.' });
		expect(doc.players[2]?.name).toBe('Ada L.');
	});

	it('will not let a player take an occupied human seat', () => {
		const doc = fourBots();
		reduce(doc, { type: 'JoinSeat', seat: 0, name: 'Ada' });
		expect(() => reduce(doc, { type: 'JoinSeat', seat: 0, name: 'Bob' })).toThrow(RuleError);
	});
});

describe('StartHand', () => {
	it('refuses to deal until every seat is filled', () => {
		const doc = createGame('T', 0);
		reduce(doc, { type: 'SetBot', seat: 0, isBot: true });
		expect(() => reduce(doc, { type: 'StartHand', seed: 's' })).toThrow(RuleError);
	});

	it('deals six cards each, turns the up-card, and opens bidding to the dealer’s left', () => {
		const doc = fourBots();
		reduce(doc, { type: 'StartHand', seed: 'deal-1' });
		expect(doc.phase).toBe('bid1');
		expect(doc.dealer).toBe(0);
		expect(doc.hands.map((h) => h.length)).toEqual([6, 6, 6, 6]);
		expect(doc.upCard).toBe(doc.hands[0][5]);
		expect(doc.bidding).toMatchObject({ round: 1, turn: 1 });
	});
});

describe('guards', () => {
	it('rejects playing a card outside a hand', () => {
		const doc = fourBots();
		expect(() => reduce(doc, { type: 'PlayCard', seat: 0, card: 'AS' })).toThrow(RuleError);
	});
});

describe('a complete hand', () => {
	it('plays out six tricks and records a result totalling 162 trick points', () => {
		let doc = fourBots();
		let played = false;
		for (let i = 0; i < 25 && !played; i++) {
			doc = fourBots();
			reduce(doc, { type: 'StartHand', seed: `whole-hand-${i}` });
			playOneHand(doc);
			played = doc.phase !== 'redeal';
		}
		expect(played).toBe(true);
		expect(['handScored', 'gameOver']).toContain(doc.phase);
		expect(doc.score.hands).toHaveLength(1);

		const r = doc.score.hands[0];
		expect(r.trickPoints[0] + r.trickPoints[1]).toBe(162);
		expect(doc.hands.flat()).toHaveLength(0);
		expect(doc.wonBySeat.flat()).toHaveLength(6); // six tricks collected
	});
});

describe('ResetToLobby', () => {
	it('clears the game but keeps the seats, and only from gameOver', () => {
		const doc = fourBots();
		reduce(doc, { type: 'JoinSeat', seat: 0, name: 'Ada', actorId: 'a' });
		reduce(doc, { type: 'StartHand', seed: 'r' });
		expect(() => reduce(doc, { type: 'ResetToLobby' })).toThrow(RuleError);

		doc.phase = 'gameOver';
		doc.score.running = [510, 300];
		reduce(doc, { type: 'ResetToLobby' });

		expect(doc.phase).toBe('lobby');
		expect(doc.score.running).toEqual([0, 0]);
		expect(doc.winner).toBeNull();
		expect(doc.trick).toBeNull();
		expect(doc.players[0]).toMatchObject({ name: 'Ada' });
		expect(doc.players[1]?.isBot).toBe(true);
	});
});

describe('LeaveTable', () => {
	it('turns a human seat into a named bot and drops its actorId, in any phase', () => {
		const doc = fourBots();
		reduce(doc, { type: 'JoinSeat', seat: 2, name: 'Ada', actorId: 'ada-1' });
		reduce(doc, { type: 'StartHand', seed: 'lt' });

		reduce(doc, { type: 'LeaveTable', seat: 2, botName: 'Rainbow Goose' });

		expect(doc.players[2]).toMatchObject({ isBot: true, name: 'Rainbow Goose' });
		expect(doc.players[2]?.actorId).toBeUndefined();
		// the hand in progress is untouched
		expect(['bid1', 'bid2']).toContain(doc.phase);
	});

	it('is a no-op on an empty seat', () => {
		const doc = createGame('T', 0);
		reduce(doc, { type: 'LeaveTable', seat: 1, botName: 'Nobody' });
		expect(doc.players[1]).toBeNull();
	});
});

describe('SendChat', () => {
	function chat(doc: GameDoc, text: string) {
		reduce(doc, {
			type: 'SendChat',
			id: crypto.randomUUID(),
			from: 'c1',
			name: 'Ada',
			seat: 0,
			text,
			ts: Date.now()
		});
	}

	it('appends a message', () => {
		const doc = createGame('T', 0);
		chat(doc, 'hello all');
		expect(doc.chat).toHaveLength(1);
		expect(doc.chat[0]).toMatchObject({ from: 'c1', name: 'Ada', seat: 0, text: 'hello all' });
	});

	it('ignores blank / whitespace-only messages and trims', () => {
		const doc = createGame('T', 0);
		chat(doc, '   ');
		chat(doc, '  hi  ');
		expect(doc.chat.map((m) => m.text)).toEqual(['hi']);
	});

	it('keeps only the most recent 100 messages', () => {
		const doc = createGame('T', 0);
		for (let i = 0; i < 130; i++) chat(doc, `m${i}`);
		expect(doc.chat).toHaveLength(100);
		expect(doc.chat[0].text).toBe('m30');
		expect(doc.chat.at(-1)?.text).toBe('m129');
	});
});

describe('SetAdvanced', () => {
	it('toggles the flag in the lobby', () => {
		const doc = createGame('T', 0);
		expect(doc.advanced).toBe(false);
		reduce(doc, { type: 'SetAdvanced', on: true });
		expect(doc.advanced).toBe(true);
		reduce(doc, { type: 'SetAdvanced', on: false });
		expect(doc.advanced).toBe(false);
	});

	it('cannot be changed once a hand is dealt', () => {
		const doc = fourBots();
		reduce(doc, { type: 'StartHand', seed: 'lock' });
		expect(() => reduce(doc, { type: 'SetAdvanced', on: true })).toThrow(RuleError);
	});
});

describe('renege (Advanced mode)', () => {
	// Hearts led; seat 1 holds hearts, so QS / AD are illegal for it.
	function midTrick(): GameDoc {
		const doc = createGame('T', 0);
		doc.phase = 'trick';
		doc.trump = 'S';
		doc.maker = 0;
		doc.hands = [[], ['9H', 'KH', 'QS', 'AD'], [], []];
		doc.trick = {
			number: 3,
			leader: 0,
			turn: 1,
			plays: [{ seat: 0, card: 'AH' }],
			winner: null
		};
		return doc;
	}

	it('still rejects an illegal card without allowIllegal', () => {
		expect(() => reduce(midTrick(), { type: 'PlayCard', seat: 1, card: 'QS' })).toThrow(RuleError);
	});

	it('allowIllegal on a legal card just plays it, no renege', () => {
		const doc = midTrick();
		reduce(doc, { type: 'PlayCard', seat: 1, card: '9H', allowIllegal: true });
		expect(doc.renege).toBeNull();
		expect(doc.phase).toBe('trick');
		expect(doc.trick?.plays).toHaveLength(2);
	});

	it('rejects a card that is not in hand even with allowIllegal', () => {
		expect(() =>
			reduce(midTrick(), { type: 'PlayCard', seat: 1, card: 'TD' as Card, allowIllegal: true })
		).toThrow(RuleError);
	});

	it('an illegal card ends the hand: opponents take 162, reneging team nothing', () => {
		const doc = midTrick();
		reduce(doc, { type: 'PlayCard', seat: 1, card: 'QS', allowIllegal: true });

		expect(doc.renege).toEqual({ seat: 1, card: 'QS' });
		expect(doc.phase).toBe('handScored');
		expect(doc.score.hands).toHaveLength(1);
		const r = doc.score.hands[0];
		expect(r.renege).toBe(true);
		expect(r.awarded).toEqual([162, 0]); // team 0 (opponents) get 162; team 1 zero
		expect(doc.score.running).toEqual([162, 0]);
	});

	it('adds the opponents’ announced meld to the 162', () => {
		const doc = midTrick();
		const dad: MeldClaim = {
			kind: 'dad',
			group: 'run',
			suit: 'H',
			cards: ['9H', 'TH', 'JH'],
			points: 20,
			top: 3
		};
		doc.melds.declared[2] = [dad]; // seat 2 is on team 0
		reduce(doc, { type: 'PlayCard', seat: 1, card: 'AD', allowIllegal: true });
		expect(doc.score.hands[0].awarded).toEqual([182, 0]);
	});

	it('a renege can win the game', () => {
		const doc = midTrick();
		doc.score.running = [400, 120];
		reduce(doc, { type: 'PlayCard', seat: 1, card: 'QS', allowIllegal: true });
		expect(doc.phase).toBe('gameOver');
		expect(doc.winner).toBe(0);
	});
});
