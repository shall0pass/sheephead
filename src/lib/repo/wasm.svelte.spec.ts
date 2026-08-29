// Phase 0 guard: proves the Automerge WebAssembly core loads and runs inside
// the real browser bundle (this file is picked up by the `client` Vitest
// project, which executes in headless Chromium). If the Vite wasm wiring
// regresses, this fails long before any game code does.

import { describe, it, expect } from 'vitest';
import * as Automerge from '@automerge/automerge';

describe('Automerge wasm in the browser bundle', () => {
	it('creates and mutates a document', () => {
		let doc = Automerge.from<{ n: number }>({ n: 0 });
		doc = Automerge.change(doc, (d) => {
			d.n = 41;
		});
		doc = Automerge.change(doc, (d) => {
			d.n += 1;
		});
		expect(doc.n).toBe(42);
	});

	it('merges concurrent changes from two actors', () => {
		let a = Automerge.from<{ cards: string[] }>({ cards: [] });
		let b = Automerge.clone(a);
		a = Automerge.change(a, (d) => {
			d.cards.push('AS');
		});
		b = Automerge.change(b, (d) => {
			d.cards.push('9H');
		});
		const merged = Automerge.merge(a, b);
		expect([...merged.cards].sort()).toEqual(['9H', 'AS']);
	});
});
