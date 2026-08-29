// Full-game integration test: the real Table UI + engine + Host, with one
// "human" (this client, seat 0) driven by clicking the rendered controls and
// the other four seats driven by the Host's bot runner. Plays a whole game
// (the default four hands) from the deal to gameOver.

import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Repo, type DocHandle } from '@automerge/automerge-repo';
import { createGame } from '$lib/sheephead';
import type { GameDoc } from '$lib/sheephead/types';
import { GameStore } from '$lib/repo/gameStore.svelte';
import { Presence } from '$lib/repo/presence.svelte';
import { Host } from '$lib/repo/host';
import Table from './Table.svelte';

vi.mock('canvas-confetti', () => ({
	default: Object.assign(() => {}, {
		create: () => Object.assign(() => {}, { reset: () => {} })
	})
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup() {
	const repo = new Repo({});
	const handle = repo.create(
		createGame('E2E', 0) as unknown as Record<string, unknown>
	) as unknown as DocHandle<GameDoc>;
	const store = new GameStore(handle, 'me');
	const presence = new Presence(handle, 'me');
	const host = new Host(store, presence, {
		minDelayMs: 0,
		maxDelayMs: 0,
		trickDelayMs: 0,
		interHandDelayMs: 0,
		redealDelayMs: 0,
		electionIntervalMs: 100,
		seatGraceMs: 100000
	});
	return { store, presence, host };
}

/** Click the first enabled `<button>` matching `selector`, or return false. */
function clickFirst(selector: string): boolean {
	const btn = document.querySelector<HTMLButtonElement>(selector);
	if (!btn || btn.disabled) return false;
	btn.click();
	return true;
}

describe('Table.svelte — full game', () => {
	it('a seated human clicks through a whole game to gameOver', async () => {
		const { store, presence, host } = setup();
		store.change({ type: 'JoinSeat', seat: 0, name: 'You', actorId: 'me' });
		for (const s of [1, 2, 3, 4] as const) store.change({ type: 'SetBot', seat: s, isBot: true });
		presence.seen['me'] = Date.now();
		host.start();
		store.change({ type: 'StartHand', seed: 'e2e-seed' });

		render(Table, { store, presence, onleave: () => {} });

		const deadline = Date.now() + 25_000;
		let lastPhase = '';
		while (store.doc?.phase !== 'gameOver' && Date.now() < deadline) {
			const doc = store.doc!;
			presence.seen['me'] = Date.now(); // stay "online" so the Host never covers seat 0
			const phase = doc.phase;
			if (phase !== lastPhase) lastPhase = phase;

			const myTurn =
				(phase === 'picking' && doc.picking?.turn === 0) ||
				((phase === 'bury' || phase === 'callPartner') && doc.picker === 0) ||
				(phase === 'trick' && doc.trick?.turn === 0);

			if (myTurn) {
				if (phase === 'picking') {
					clickFirst('.dock button'); // "Pick" is the first PickPanel button
				} else if (phase === 'bury') {
					// pick two cards, then Bury
					const cards = [...document.querySelectorAll<HTMLButtonElement>('.hand button')];
					cards[0]?.click();
					cards[1]?.click();
					await wait(10);
					clickFirst('.dock button');
				} else if (phase === 'callPartner') {
					// simplest deterministic path: go alone
					const alone = [...document.querySelectorAll<HTMLButtonElement>('.dock button')].find(
						(b) => b.textContent?.trim() === 'Go alone'
					);
					alone?.click();
				} else if (phase === 'trick') {
					clickFirst('.hand button:not([disabled])');
				}
			}
			await wait(20);
		}
		host.stop();

		expect(store.doc?.phase).toBe('gameOver');
		expect(store.doc?.score.hands).toHaveLength(store.doc!.handsToPlay);
		expect(store.doc?.score.tally.reduce((a, b) => a + b, 0)).toBe(0);
		await expect.element(page.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
	});
});
