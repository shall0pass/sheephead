// Deterministic, seedable PRNG so deals and simulations are reproducible.
// `xmur3` hashes the string seed to a 32-bit state; `mulberry32` is the
// generator. Both are well-known small public-domain implementations.

export function makeRng(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = (h ^ (h >>> 16)) >>> 0;
	return function next() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher–Yates, returning a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
	const a = items.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** A fresh opaque seed string, drawn from an existing generator. */
export function randomSeed(rng: () => number): string {
	return Math.floor(rng() * 2 ** 52).toString(36);
}
