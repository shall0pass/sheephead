import { describe, expect, it } from 'vitest';
import { Repo, type DocHandle } from '@automerge/automerge-repo';
import { createGame } from '$lib/clabber';
import type { GameDoc } from '$lib/clabber/types';
import { GameStore } from './gameStore.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));

function freshStore(clientId = 'client-1') {
	const repo = new Repo({});
	const handle = repo.create(
		createGame('TEST', 0) as unknown as Record<string, unknown>
	) as unknown as DocHandle<GameDoc>;
	return new GameStore(handle, clientId);
}

describe('GameStore', () => {
	it('exposes the current doc and reacts to changes', async () => {
		const store = freshStore();
		expect(store.code).toBe('TEST');
		expect(store.mySeat).toBeNull();

		store.change({ type: 'SetBot', seat: 1, isBot: true, botName: 'Rainbow Goose' });
		await tick();
		expect(store.doc?.players[1]).toMatchObject({ isBot: true, name: 'Rainbow Goose' });
	});

	it('tracks which seat this client occupies', async () => {
		const store = freshStore('me');
		store.change({ type: 'JoinSeat', seat: 2, name: 'Ada', actorId: 'me' });
		await tick();
		expect(store.mySeat).toBe(2);

		store.change({ type: 'LeaveSeat', seat: 2 });
		await tick();
		expect(store.mySeat).toBeNull();
	});

	it('rejects illegal actions by surfacing the RuleError', () => {
		const store = freshStore();
		expect(() => store.change({ type: 'PlayCard', seat: 0, card: 'AS' })).toThrow();
	});
});
