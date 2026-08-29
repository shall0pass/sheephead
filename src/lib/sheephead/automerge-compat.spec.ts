// The reducer mutates its `doc` in place so it can run straight inside an
// Automerge `change` block (Phase 3). This checks that the mutation style —
// reassigning arrays/objects, `splice`, nested `push` — is actually accepted by
// Automerge and converges across two peers.

import { describe, it, expect } from 'vitest';
import * as Automerge from '@automerge/automerge';
import { reduce } from './reducer';
import { createGame, SEATS } from './state';
import type { GameDoc } from './types';

// `Automerge.from` constrains its argument to `Record<string, unknown>`; our
// `GameDoc` is a precise interface without an index signature. The Phase 3 repo
// layer will own this bridge; here a tiny cast keeps the test readable.
const fromGame = (doc: GameDoc) => Automerge.from(doc as GameDoc & Record<string, unknown>);

describe('GameDoc inside Automerge', () => {
	it('applies reducer actions through change() and reads back the state', () => {
		let doc = fromGame(createGame('ROOM', 0));

		for (const s of SEATS) {
			doc = Automerge.change(doc, (d) => reduce(d, { type: 'SetBot', seat: s, isBot: true }));
		}
		doc = Automerge.change(doc, (d) => reduce(d, { type: 'StartHand', seed: 'am-seed' }));

		expect(doc.phase).toBe('bid1');
		expect(doc.hands.map((h) => h.length)).toEqual([6, 6, 6, 6]);

		const seat = doc.bidding!.turn;
		doc = Automerge.change(doc, (d) => reduce(d, { type: 'Bid', seat, bid: 'pass' }));
		expect(doc.bidding!.passes).toContain(seat);
	});

	it('converges between two peers after independent-looking changes', () => {
		let a = fromGame(createGame('ROOM', 0));
		for (const s of SEATS) {
			a = Automerge.change(a, (d) => reduce(d, { type: 'SetBot', seat: s, isBot: true }));
		}
		let b = Automerge.clone(a);

		a = Automerge.change(a, (d) => reduce(d, { type: 'RenameSeat', seat: 0, name: 'Ada' }));
		b = Automerge.change(b, (d) => reduce(d, { type: 'RenameSeat', seat: 1, name: 'Bo' }));

		const merged = Automerge.merge(a, b);
		expect(merged.players[0]?.name).toBe('Ada');
		expect(merged.players[1]?.name).toBe('Bo');
	});
});
