// The reducer mutates its `doc` in place so it can run straight inside an
// Automerge `change` block. This checks that the mutation style — reassigning
// arrays/objects, `splice`, nested `push` — is accepted by Automerge and
// converges across two peers.

import { describe, it, expect } from 'vitest';
import * as Automerge from '@automerge/automerge';
import { reduce } from './reducer';
import { chooseBury, chooseCall, chooseCard, choosePick } from './bot';
import { createGame, SEATS } from './state';
import type { GameDoc } from './types';

const fromGame = (doc: GameDoc) => Automerge.from(doc as GameDoc & Record<string, unknown>);

describe('GameDoc inside Automerge', () => {
	it('applies reducer actions through change() and reads back the state', () => {
		let doc = fromGame(createGame('ROOM', 0));

		for (const s of SEATS) {
			doc = Automerge.change(doc, (d) => reduce(d, { type: 'SetBot', seat: s, isBot: true }));
		}
		doc = Automerge.change(doc, (d) => reduce(d, { type: 'StartHand', seed: 'am-seed' }));

		expect(doc.phase).toBe('picking');
		expect(doc.hands.map((h) => h.length)).toEqual([6, 6, 6, 6, 6]);
		expect(doc.blind).toHaveLength(2);

		const seat = doc.picking!.turn;
		doc = Automerge.change(doc, (d) => reduce(d, { type: 'Pass', seat }));
		expect(doc.picking!.passed).toContain(seat);
	});

	it('plays a full hand inside change() and converges between two peers', () => {
		let a = fromGame(createGame('ROOM', 0));
		for (const s of SEATS) {
			a = Automerge.change(a, (d) => reduce(d, { type: 'SetBot', seat: s, isBot: true }));
		}
		a = Automerge.change(a, (d) => reduce(d, { type: 'StartHand', seed: 'converge' }));

		let guard = 0;
		while (
			a.phase === 'picking' ||
			a.phase === 'bury' ||
			a.phase === 'callPartner' ||
			a.phase === 'trick'
		) {
			if (++guard > 500) throw new Error(`stuck in ${a.phase}`);
			a = Automerge.change(a, (d) => {
				switch (d.phase) {
					case 'picking': {
						const s = d.picking!.turn;
						reduce(d, choosePick(d, s) ? { type: 'Pick', seat: s } : { type: 'Pass', seat: s });
						break;
					}
					case 'bury':
						reduce(d, { type: 'Bury', seat: d.picker!, cards: chooseBury(d) });
						break;
					case 'callPartner':
						reduce(d, { type: 'CallPartner', seat: d.picker!, call: chooseCall(d) });
						break;
					case 'trick': {
						const s = d.trick!.turn;
						reduce(d, { type: 'PlayCard', seat: s, card: chooseCard(d, s) });
						break;
					}
				}
			});
		}
		expect(['handScored', 'redeal', 'gameOver']).toContain(a.phase);

		const b = Automerge.clone(a);
		const a2 = Automerge.change(a, (d) => reduce(d, { type: 'RenameSeat', seat: 0, name: 'Ada' }));
		const b2 = Automerge.change(b, (d) => reduce(d, { type: 'RenameSeat', seat: 1, name: 'Bo' }));
		const merged = Automerge.merge(a2, b2);
		expect(merged.players[0]?.name).toBe('Ada');
		expect(merged.players[1]?.name).toBe('Bo');
	});
});
