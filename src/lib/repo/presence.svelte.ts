// Lightweight presence over Automerge ephemeral messages (which are NOT written
// into the document history). Each tab broadcasts a heartbeat every few
// seconds; peers keep a last-seen time per client id. A tab that closes
// cleanly also broadcasts a "bye" so peers drop it immediately.

import type { DocHandle } from '@automerge/automerge-repo';
import type { GameDoc } from '$lib/clabber/types';

const BEAT_MS = 4000;
/** Missing this many ms of heartbeats ⇒ treated as gone (3 missed beats). */
export const STALE_MS = 12000;

type PresenceMessage = { t: 'hb' | 'bye'; clientId: string };

export class Presence {
	#handle: DocHandle<GameDoc>;
	#clientId: string;
	#timer: ReturnType<typeof setInterval> | undefined;
	#onUnload = () => this.stop();
	/** clientId -> last-seen epoch ms. */
	seen = $state<Record<string, number>>({});

	constructor(handle: DocHandle<GameDoc>, clientId: string) {
		this.#handle = handle;
		this.#clientId = clientId;
	}

	start(): void {
		if (this.#timer) return;
		this.#handle.on('ephemeral-message', ({ message }) => {
			const m = message as Partial<PresenceMessage>;
			if (typeof m?.clientId !== 'string' || m.clientId === this.#clientId) return;
			if (m.t === 'bye') {
				delete this.seen[m.clientId];
				return;
			}
			if (m.t !== 'hb') return;
			const isNew = !this.seen[m.clientId];
			this.seen[m.clientId] = Date.now();
			// Answer a newcomer straight away so presence converges in one round trip.
			if (isNew) this.#beat();
		});
		this.#beat();
		this.#timer = setInterval(() => this.#beat(), BEAT_MS);
		if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.#onUnload);
	}

	stop(): void {
		if (!this.#timer) return;
		clearInterval(this.#timer);
		this.#timer = undefined;
		if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.#onUnload);
		try {
			this.#handle.broadcast({ t: 'bye', clientId: this.#clientId });
		} catch {
			/* handle may already be torn down */
		}
	}

	isOnline(clientId: string | undefined | null): boolean {
		return !!clientId && Date.now() - (this.seen[clientId] ?? 0) < STALE_MS;
	}

	#beat(): void {
		this.#handle.broadcast({ t: 'hb', clientId: this.#clientId });
		this.seen[this.#clientId] = Date.now();
		const cutoff = Date.now() - STALE_MS;
		for (const id of Object.keys(this.seen)) {
			if (this.seen[id] < cutoff) delete this.seen[id];
		}
	}
}
