// Meld: scoring combinations held in hand, announced on the first trick.
//
//   Two Hundred  four jacks                       200
//   Hundred      four 9s / As / 10s / Ks / Qs     100
//   Hundred      sequence of five (or six)        100
//   Fifty        sequence of four                  50
//   Dad          sequence of three                 20
//   Bella        K + Q of trump                    20   (always scores)
//
// Sequences use the natural order 9 10 J Q K A. No card is used in more than
// one meld, except bella's K/Q, which may also appear in a sequence (so K-Q-J
// of trump is worth 20 + 20 = 40, "dad 'a' belle").
//
// The team holding the single highest-ranking meld scores the sum of ALL its
// melds; the other team scores nothing for meld — except bella, which always
// scores for whoever holds it. Tie-break between two melds: higher points, then
// higher top card, then a trump sequence beats a non-trump one; still equal and
// neither team scores meld this deal.

import type { Card, GameDoc, MeldClaim, Suit, TeamId } from './types';
import { RANKS, SUITS, rankOf, sequenceStrength, suitOf } from './cards';
import { seatsOfTeam } from './state';

/** Every meld present in a hand (may include mutually-exclusive candidates; use
 *  `selectBestMelds` to pick the scoring set). */
export function detectMelds(hand: Card[], trump: Suit | null): MeldClaim[] {
	const claims: MeldClaim[] = [];

	// Four of a kind.
	for (const r of RANKS) {
		const cs = hand.filter((c) => rankOf(c) === r);
		if (cs.length === 4) {
			claims.push(
				r === 'J'
					? {
							kind: 'twohundred',
							group: 'set',
							suit: null,
							cards: cs,
							points: 200,
							top: sequenceStrength(cs[0])
						}
					: {
							kind: 'hundred',
							group: 'set',
							suit: null,
							cards: cs,
							points: 100,
							top: sequenceStrength(cs[0])
						}
			);
		}
	}

	// Longest run in each suit.
	for (const s of SUITS) {
		const cs = hand
			.filter((c) => suitOf(c) === s)
			.sort((a, b) => sequenceStrength(a) - sequenceStrength(b));
		if (cs.length < 3) continue;
		let bestStart = 0;
		let bestLen = 1;
		let curStart = 0;
		let curLen = 1;
		for (let i = 1; i < cs.length; i++) {
			if (sequenceStrength(cs[i]) === sequenceStrength(cs[i - 1]) + 1) {
				curLen++;
			} else {
				curStart = i;
				curLen = 1;
			}
			if (curLen > bestLen) {
				bestLen = curLen;
				bestStart = curStart;
			}
		}
		if (bestLen < 3) continue;
		const run = cs.slice(bestStart, bestStart + bestLen);
		const top = sequenceStrength(run[run.length - 1]);
		if (bestLen >= 5)
			claims.push({ kind: 'hundred', group: 'run', suit: s, cards: run, points: 100, top });
		else if (bestLen === 4)
			claims.push({ kind: 'fifty', group: 'run', suit: s, cards: run, points: 50, top });
		else claims.push({ kind: 'dad', group: 'run', suit: s, cards: run, points: 20, top });
	}

	// Bella.
	if (trump) {
		const k = `K${trump}` as Card;
		const q = `Q${trump}` as Card;
		if (hand.includes(k) && hand.includes(q)) {
			claims.push({
				kind: 'bella',
				group: 'bella',
				suit: trump,
				cards: [k, q],
				points: 20,
				top: sequenceStrength(k)
			});
		}
	}

	return claims;
}

export interface MeldSelection {
	list: MeldClaim[];
	sum: number;
}

/** The best legal (disjoint) set of melds from a hand's candidates. Four-of-a-
 *  kind and sequences cannot coexist in a six-card hand, so this is just the
 *  higher-scoring of the two, plus bella. */
export function selectBestMelds(claims: MeldClaim[]): MeldSelection {
	const runs = claims.filter((c) => c.group === 'run');
	const sets = claims.filter((c) => c.group === 'set');
	const bella = claims.find((c) => c.group === 'bella');
	const runSum = runs.reduce((n, c) => n + c.points, 0);
	const setSum = sets.reduce((n, c) => n + c.points, 0);
	const list = (runSum >= setSum ? runs : sets).slice();
	let sum = Math.max(runSum, setSum);
	if (bella) {
		list.push(bella);
		sum += bella.points;
	}
	return { list, sum };
}

/** >0: `a` outranks `b`; <0: `b` outranks `a`; 0: tie — no team scores meld. */
export function compareMeldClaim(a: MeldClaim, b: MeldClaim, trump: Suit | null): number {
	if (a.points !== b.points) return a.points - b.points;
	if (a.top !== b.top) return a.top - b.top;
	const at = a.group === 'run' && a.suit === trump;
	const bt = b.group === 'run' && b.suit === trump;
	if (at !== bt) return at ? 1 : -1;
	return 0;
}

function bestClaim(claims: MeldClaim[], trump: Suit | null): MeldClaim | null {
	if (!claims.length) return null;
	return claims.reduce((best, c) => (compareMeldClaim(c, best, trump) > 0 ? c : best));
}

/** Resolve the deal's meld from `doc.melds.declared` and write the outcome back
 *  into `doc.melds` (called when the first trick completes). */
export function resolveMeld(doc: GameDoc): void {
	const trump = doc.trump;
	const sel = [0, 1, 2, 3].map((s) => selectBestMelds(doc.melds.declared[s] ?? []));

	const teamBest = ([0, 1] as TeamId[]).map((t) => {
		const [x, y] = seatsOfTeam(t);
		return bestClaim([...sel[x].list, ...sel[y].list], trump);
	});
	const teamSum: [number, number] = [sel[0].sum + sel[2].sum, sel[1].sum + sel[3].sum];

	const bellaTeam = ((): TeamId | null => {
		for (const t of [0, 1] as TeamId[]) {
			const [x, y] = seatsOfTeam(t);
			if ([...sel[x].list, ...sel[y].list].some((c) => c.group === 'bella')) return t;
		}
		return null;
	})();

	let winner: TeamId | null = null;
	if (teamBest[0] && teamBest[1]) {
		const cmp = compareMeldClaim(teamBest[0], teamBest[1], trump);
		winner = cmp > 0 ? 0 : cmp < 0 ? 1 : null;
	} else if (teamBest[0]) {
		winner = 0;
	} else if (teamBest[1]) {
		winner = 1;
	}

	const points: [number, number] = [0, 0];
	if (winner != null) {
		points[winner] = teamSum[winner];
		// Only one player in the whole game can hold bella; if that is the
		// losing team, they still score it.
		if (bellaTeam != null && bellaTeam !== winner) points[bellaTeam] += 20;
	} else if (bellaTeam != null) {
		points[bellaTeam] += 20;
	}

	doc.melds.points = points;
	doc.melds.scoredTeam = winner;
	doc.melds.resolved = true;
	doc.log.push(`meld: team 0 ${points[0]}, team 1 ${points[1]}`);
}
