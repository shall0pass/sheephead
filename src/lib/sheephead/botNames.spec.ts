import { describe, it, expect } from 'vitest';
import { BOT_NAMES, pickBotNames } from './botNames';

describe('pickBotNames', () => {
	it('returns the requested number of distinct names from the pool', () => {
		const names = pickBotNames(3);
		expect(names).toHaveLength(3);
		expect(new Set(names).size).toBe(3);
		for (const n of names) expect(BOT_NAMES).toContain(n);
	});

	it('never reuses a name that is already taken', () => {
		const taken = [BOT_NAMES[0], BOT_NAMES[1]];
		const names = pickBotNames(4, taken);
		expect(names).toHaveLength(4);
		for (const n of names) expect(taken).not.toContain(n);
	});

	it('caps at the pool size', () => {
		expect(pickBotNames(999).length).toBe(BOT_NAMES.length);
	});
});
