// Deciding what the bot-runner should do. Pure — no Svelte, no Automerge.
// The stateful wiring (timers, election, applying the move) lives in
// `src/lib/repo/host.ts`.

import type { Action } from './actions';
import type { GameDoc } from './types';
import { chooseBid, chooseCard } from './bot';

/** How long presence silence means a host is gone. Matches the presence
 *  staleness window so a departed host is dropped consistently. */
export const HOST_STALE_MS = 12_000;

/** The elected host among the currently-online client ids: the
 *  lexicographically smallest, so every client agrees. `null` if the list is
 *  empty. */
export function pickHost(onlineClientIds: readonly string[]): string | null {
	let best: string | null = null;
	for (const id of onlineClientIds) if (best === null || id < best) best = id;
	return best;
}

/** The single action the bot-runner should take for the current position, or
 *  `null` when it is a human's turn or there is nothing to do. */
export function nextBotAction(
	doc: GameDoc,
	makeSeed: () => string = () => crypto.randomUUID()
): Action | null {
	switch (doc.phase) {
		case 'bid1':
		case 'bid2': {
			const seat = doc.bidding?.turn;
			if (seat == null || !doc.players[seat]?.isBot) return null;
			return { type: 'Bid', seat, bid: chooseBid(doc, seat) };
		}
		case 'meld': {
			const seat = doc.trick?.turn;
			if (seat == null || !doc.players[seat]?.isBot) return null;
			// Announce meld before playing the first card, then play it.
			if (doc.melds.declared[seat] == null) return { type: 'AnnounceMeld', seat };
			return { type: 'PlayCard', seat, card: chooseCard(doc, seat) };
		}
		case 'trick': {
			const seat = doc.trick?.turn;
			if (seat == null || !doc.players[seat]?.isBot) return null;
			return { type: 'PlayCard', seat, card: chooseCard(doc, seat) };
		}
		case 'trickDone':
			// Collect the trick once everyone has had a moment to see it.
			return { type: 'AdvanceTrick' };
		case 'redeal':
		case 'handScored':
			// Keep an unattended game moving: re-deal / start the next hand.
			return { type: 'StartHand', seed: makeSeed() };
		default:
			return null; // lobby, gameOver
	}
}
