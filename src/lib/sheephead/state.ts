// Seat/team helpers and the initial document.

import type { GameDoc, Seat, TeamId } from './types';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat;
export const partnerSeat = (s: Seat): Seat => ((s + 2) % 4) as Seat;
export const teamOf = (s: Seat): TeamId => (s % 2) as TeamId;
export const otherTeam = (t: TeamId): TeamId => (t ^ 1) as TeamId;
export const seatsOfTeam = (t: TeamId): [Seat, Seat] => (t === 0 ? [0, 2] : [1, 3]);

export function createGame(code: string, now: number = Date.now()): GameDoc {
	return {
		version: 1,
		code,
		createdAt: now,
		hostActorId: '',
		players: [null, null, null, null],
		phase: 'lobby',
		advanced: false,
		dealer: 0,
		seed: '',
		hands: [[], [], [], []],
		upCard: null,
		trump: null,
		maker: null,
		bidding: null,
		trick: null,
		wonBySeat: [[], [], [], []],
		lastTrickWinner: null,
		melds: {
			declared: [null, null, null, null],
			resolved: false,
			scoredTeam: null,
			points: [0, 0]
		},
		renege: null,
		score: { running: [0, 0], hands: [] },
		winner: null,
		log: [],
		chat: []
	};
}
