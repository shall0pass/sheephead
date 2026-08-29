// The bot runner. Exactly one connected client ("the host") drives every bot
// seat through bidding, meld and trick play, starts each new hand, and covers
// for humans who drop out.
//
// Election: the online client with the smallest id claims the host role by
// writing `hostActorId` into the doc (see `pickHost`). A live host is left
// alone; a host that presence hasn't heard from is taken over. Automerge's
// last-writer-wins resolves a concurrent claim to one value that every peer
// then agrees on, so at most one client sees `isHost === true`.
//
// Every move is applied through `reduce`, which rejects anything illegal for
// the current position — so a brief double-host during a handover cannot
// double-play: the losing write just throws and is swallowed.

import type { GameStore } from './gameStore.svelte';
import type { Presence } from './presence.svelte';
import { HOST_STALE_MS, nextBotAction, pickHost } from '$lib/clabber/host';
import { SEATS } from '$lib/clabber/state';
import type { Seat } from '$lib/clabber/types';

export interface HostOptions {
	/** Humanising think-time bounds for a bot move (ms). */
	minDelayMs?: number;
	maxDelayMs?: number;
	/** How long to hold a completed trick on screen before collecting it (ms). */
	trickDelayMs?: number;
	/** Pause on the score screen before dealing the next hand (ms). */
	interHandDelayMs?: number;
	/** Pause before re-dealing after everyone passed twice (ms). */
	redealDelayMs?: number;
	/** How often to re-check the election + absent players (ms). */
	electionIntervalMs?: number;
	/** How long a seated human may be offline before the host covers / clears
	 *  their seat (ms, on top of the ~12 s presence window). */
	seatGraceMs?: number;
	makeSeed?: () => string;
}

const DEFAULTS: Required<HostOptions> = {
	minDelayMs: 450,
	maxDelayMs: 1150,
	// Long enough that everyone sees all four cards of a trick.
	trickDelayMs: 1400,
	// Long enough to read the hand's score breakdown before the next deal.
	interHandDelayMs: 5000,
	redealDelayMs: 700,
	electionIntervalMs: 2500,
	seatGraceMs: 25000,
	makeSeed: () => crypto.randomUUID()
};

export class Host {
	#store: GameStore;
	#presence: Presence;
	#clientId: string;
	#opts: Required<HostOptions>;
	#moveTimer: ReturnType<typeof setTimeout> | undefined;
	#tickTimer: ReturnType<typeof setInterval> | undefined;
	#running = false;
	#absentSince = new Map<Seat, number>();
	#onChange = () => this.#reconcile();

	constructor(store: GameStore, presence: Presence, opts: HostOptions = {}) {
		this.#store = store;
		this.#presence = presence;
		this.#clientId = store.clientId;
		this.#opts = { ...DEFAULTS, ...opts };
	}

	/** Whether this tab is currently the elected bot runner. Reactive (reads
	 *  the store's `$state` doc). */
	get isHost(): boolean {
		return this.#store.doc?.hostActorId === this.#clientId;
	}

	start(): void {
		if (this.#running) return;
		this.#running = true;
		this.#store.handle.on('change', this.#onChange);
		this.#tickTimer = setInterval(() => this.#tick(), this.#opts.electionIntervalMs);
		this.#tick();
		this.#reconcile();
	}

	stop(): void {
		this.#running = false;
		this.#store.handle.off('change', this.#onChange);
		clearInterval(this.#tickTimer);
		clearTimeout(this.#moveTimer);
		this.#tickTimer = this.#moveTimer = undefined;
		this.#absentSince.clear();
	}

	#tick(): void {
		if (!this.#running) return;
		this.#elect();
		this.#coverAbsentPlayers();
	}

	#onlineClientIds(): string[] {
		const now = Date.now();
		const ids = new Set<string>([this.#clientId]);
		for (const [id, seenAt] of Object.entries(this.#presence.seen)) {
			if (now - seenAt < HOST_STALE_MS) ids.add(id);
		}
		return [...ids];
	}

	#elect(): void {
		const doc = this.#store.doc;
		if (!doc) return;
		const online = this.#onlineClientIds();
		const current = doc.hostActorId;
		if (current && online.includes(current)) return; // a live host already holds it
		if (pickHost(online) === this.#clientId && current !== this.#clientId) {
			try {
				this.#store.change({ type: 'HostClaim', actorId: this.#clientId });
			} catch {
				/* concurrent claim — the next tick settles it */
			}
		}
	}

	/** Once host, clear (in the lobby) or bot-cover (in a hand) a seat whose
	 *  human has been gone past the grace period; hand it straight back when
	 *  they return. */
	#coverAbsentPlayers(): void {
		if (!this.isHost) return;
		const doc = this.#store.doc;
		if (!doc) return;
		const now = Date.now();
		const online = new Set(this.#onlineClientIds());

		for (const seat of SEATS) {
			const p = doc.players[seat];
			if (!p || !p.actorId) {
				this.#absentSince.delete(seat);
				continue;
			}
			if (online.has(p.actorId)) {
				this.#absentSince.delete(seat);
				if (p.isBot && doc.phase !== 'lobby') {
					this.#safe({ type: 'CoverSeat', seat, isBot: false }); // welcome back
				}
				continue;
			}
			// human gone
			const since = this.#absentSince.get(seat) ?? (this.#absentSince.set(seat, now), now);
			if (now - since < this.#opts.seatGraceMs) continue;
			this.#absentSince.delete(seat);
			if (doc.phase === 'lobby') this.#safe({ type: 'LeaveSeat', seat });
			else if (!p.isBot) this.#safe({ type: 'CoverSeat', seat, isBot: true });
		}
	}

	#safe(action: Parameters<GameStore['change']>[0]): void {
		try {
			this.#store.change(action);
		} catch {
			/* raced by another client */
		}
	}

	#reconcile(): void {
		if (!this.#running) return;
		clearTimeout(this.#moveTimer);
		this.#moveTimer = undefined;
		this.#coverAbsentPlayers();
		if (!this.isHost) return;

		const doc = this.#store.doc;
		if (!doc || !nextBotAction(doc, this.#opts.makeSeed)) return;

		const { minDelayMs, maxDelayMs, trickDelayMs, interHandDelayMs, redealDelayMs } = this.#opts;
		const delay =
			doc.phase === 'trickDone'
				? trickDelayMs
				: doc.phase === 'handScored'
					? interHandDelayMs
					: doc.phase === 'redeal'
						? redealDelayMs
						: minDelayMs + Math.random() * (maxDelayMs - minDelayMs);

		this.#moveTimer = setTimeout(() => {
			this.#moveTimer = undefined;
			if (!this.#running || !this.isHost) return;
			// Re-derive from the current doc — it may have advanced during the wait.
			const action = nextBotAction(this.#store.doc!, this.#opts.makeSeed);
			if (!action) return;
			try {
				this.#store.change(action);
			} catch {
				/* RuleError: another client already made this move */
			}
			// The resulting change event re-enters #reconcile for the next move.
		}, delay);
	}
}
