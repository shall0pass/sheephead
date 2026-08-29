// Silly names for computer players.

export const BOT_NAMES: string[] = [
	'Rainbow Goose',
	'Michael Jordan',
	'Sir Reginald Featherbottom',
	'Captain Snacks',
	'The Cheese Wizard',
	'Deborah from Accounts',
	'Lil Trumpet',
	'Grandma Thunderfist',
	'Baron von Shuffle',
	'Sneaky Pete',
	'Disco Kevin',
	'Madame Clabberella',
	'Two-Ton Tony',
	'Professor Pickles',
	'Yeetus Maximus',
	'The Velvet Badger'
];

/** Pick `n` distinct bot names, avoiding any already in `taken`. */
export function pickBotNames(n: number, taken: Iterable<string> = []): string[] {
	const used = new Set(taken);
	const pool = BOT_NAMES.filter((name) => !used.has(name));
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, n);
}
