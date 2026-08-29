// Play a whole game with five bots. Used by the test suite to fuzz the rules
// engine and assert invariants over many random deals.

import type { GameDoc, Seat } from './types';
import { chooseBury, chooseCall, chooseCard, choosePick } from './bot';
import { legalMoves } from './play';
import { makeRng, randomSeed } from './rng';
import { reduce } from './reducer';
import { SEATS, createGame } from './state';

export interface SimResult {
	doc: GameDoc;
	handsPlayed: number;
	steps: number;
}

export function playRandomGame(seed: string, maxSteps = 200_000): SimResult {
	const rng = makeRng(seed);
	const doc = createGame('SIM', 0);
	for (const s of SEATS) reduce(doc, { type: 'SetBot', seat: s, isBot: true, botName: `Bot ${s}` });
	reduce(doc, { type: 'StartHand', seed: randomSeed(rng) });

	let steps = 0;
	while (doc.phase !== 'gameOver') {
		if (++steps > maxSteps) throw new Error(`game did not finish within ${maxSteps} steps`);
		step(doc, () => randomSeed(rng));
	}
	return { doc, handsPlayed: doc.score.hands.length, steps };
}

function step(doc: GameDoc, nextSeed: () => string): void {
	switch (doc.phase) {
		case 'picking': {
			const seat = doc.picking!.turn;
			reduce(doc, choosePick(doc, seat) ? { type: 'Pick', seat } : { type: 'Pass', seat });
			return;
		}
		case 'bury': {
			reduce(doc, { type: 'Bury', seat: doc.picker!, cards: chooseBury(doc) });
			return;
		}
		case 'callPartner': {
			reduce(doc, { type: 'CallPartner', seat: doc.picker!, call: chooseCall(doc) });
			return;
		}
		case 'trick': {
			const seat = doc.trick!.turn;
			const card = chooseCard(doc, seat);
			assertLegal(doc, seat, card);
			reduce(doc, { type: 'PlayCard', seat, card });
			return;
		}
		case 'redeal':
		case 'handScored': {
			reduce(doc, { type: 'StartHand', seed: nextSeed() });
			return;
		}
		default:
			throw new Error(`simulator reached unexpected phase ${doc.phase}`);
	}
}

function assertLegal(doc: GameDoc, seat: Seat, card: string): void {
	const legal = legalMoves(doc, seat);
	if (legal.length === 0) throw new Error(`no legal moves for seat ${seat} in phase ${doc.phase}`);
	if (!legal.includes(card as never)) {
		throw new Error(`bot picked illegal card ${card}; legal: ${legal.join(' ')}`);
	}
}
