// Geometry for the card art in `static/cards/`.
//
// faces.svg — the 52-card deck as a 13×4 grid (each cell 64×89).
//   columns, left→right:  A 2 3 4 5 6 7 8 9 10 J Q K
//   rows,    top→bottom:   Clubs, Hearts, Spades, Diamonds
//   (verified by rendering the sheet)
// back.svg  — a single hand-drawn back at the same 64×89 aspect. The four
//   fancy backs in `artifacts/CardBackscomplete.svg` were dropped: at ~7 MB
//   they are far too heavy to ship for a card back.
//
// Cards render as a CSS background sprite (see Card.svelte): one request each,
// scales cleanly to any size.

import type { Card, Rank, Suit } from '$lib/clabber/types';

export const FACE_SHEET = '/cards/faces.svg';
export const BACK_SHEET = '/cards/back.svg';

export const FACE_GRID = { cols: 13, rows: 4 } as const;

/** width / height — the same for the faces and the back. */
export const CARD_RATIO = 64 / 89;

const RANK_COL: Record<Rank, number> = { A: 0, '9': 8, T: 9, J: 10, Q: 11, K: 12 };
const SUIT_ROW: Record<Suit, number> = { C: 0, H: 1, S: 2, D: 3 };

export function facePosition(card: Card): { col: number; row: number } {
	return { col: RANK_COL[card[0] as Rank], row: SUIT_ROW[card[1] as Suit] };
}
