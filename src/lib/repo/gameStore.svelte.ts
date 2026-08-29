// A Svelte-reactive wrapper around one game's Automerge `DocHandle`.
//
//   store.doc      - the current GameDoc snapshot ($state; updates on sync)
//   store.change() - apply a rules-engine Action inside handle.change()
//   store.mySeat   - which seat this tab occupies, or null

import type { AnyDocumentId, DocHandle } from '@automerge/automerge-repo';
import type { Action } from '$lib/clabber/actions';
import type { GameDoc, Seat } from '$lib/clabber/types';
import { createGame, reduce } from '$lib/clabber';
import { claimCode, makeCode, resolveCode } from './directory';
import { getRepo } from './repo';

const CLIENT_ID_KEY = 'clabber:clientId';

/** A per-tab identity, stable across reloads. Determines which seat is "me". */
export function getClientId(): string {
	try {
		let id = sessionStorage.getItem(CLIENT_ID_KEY);
		if (!id) {
			id = crypto.randomUUID();
			sessionStorage.setItem(CLIENT_ID_KEY, id);
		}
		return id;
	} catch {
		return crypto.randomUUID();
	}
}

export class GameStore {
	#handle: DocHandle<GameDoc>;
	readonly clientId: string;
	doc = $state<GameDoc | undefined>(undefined);

	constructor(handle: DocHandle<GameDoc>, clientId: string = getClientId()) {
		this.#handle = handle;
		this.clientId = clientId;
		this.doc = handle.doc();
		handle.on('change', (payload) => {
			this.doc = payload.doc as GameDoc;
		});
	}

	get handle(): DocHandle<GameDoc> {
		return this.#handle;
	}

	get url(): string {
		return this.#handle.url;
	}

	get code(): string {
		return this.doc?.code ?? '';
	}

	/** The seat this tab occupies, or null if it is only spectating. */
	get mySeat(): Seat | null {
		const players = this.doc?.players ?? [];
		const i = players.findIndex((p) => p != null && p.actorId === this.clientId);
		return i >= 0 ? (i as Seat) : null;
	}

	change(action: Action): void {
		this.#handle.change((d) => reduce(d as unknown as GameDoc, action));
	}

	/** Apply an action, swallowing a `RuleError` (e.g. a bot raced us to the
	 *  move). Returns whether it applied. For UI-initiated actions. */
	tryChange(action: Action): boolean {
		try {
			this.change(action);
			return true;
		} catch {
			return false;
		}
	}
}

// --- create / join -------------------------------------------------------

type Init = Parameters<ReturnType<typeof getRepo>['create']>[0];

/** Create a brand-new game. Registers a short join code if a registry is
 *  reachable; otherwise the shareable identifier is the document id and the
 *  game is joined by invite link. */
export async function createNewGame(): Promise<GameStore> {
	const repo = getRepo();
	const handle = repo.create(createGame(makeCode()) as Init) as DocHandle<GameDoc>;
	await handle.whenReady();

	for (let attempt = 0; attempt < 6; attempt++) {
		const code = makeCode();
		let claimed: boolean;
		try {
			claimed = await claimCode(code, handle.url);
		} catch {
			break; // no reachable registry — fall back to the document id
		}
		if (claimed) {
			handle.change((d) => (d.code = code));
			return new GameStore(handle);
		}
		// otherwise: astronomically rare collision, try another code
	}

	handle.change((d) => (d.code = handle.url.replace(/^automerge:/, '')));
	return new GameStore(handle);
}

/** Join the game a code points at, or `null` if the code is unknown. */
export async function joinExistingGame(code: string): Promise<GameStore | null> {
	const url = await resolveCode(code);
	if (!url) return null;
	const handle = (await getRepo().find(url as AnyDocumentId)) as DocHandle<GameDoc>;
	await handle.whenReady();
	return new GameStore(handle);
}
