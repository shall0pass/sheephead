import type { Suit } from '$lib/clabber/types';

export const SUIT_NAME: Record<Suit, string> = {
	S: 'Spades',
	H: 'Hearts',
	D: 'Diamonds',
	C: 'Clubs'
};

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export const isRedSuit = (s: Suit): boolean => s === 'H' || s === 'D';
