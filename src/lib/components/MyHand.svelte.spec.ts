import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MyHand from './MyHand.svelte';
import type { Card } from '$lib/clabber/types';

const cards: Card[] = ['AS', 'KS', '9H', 'AD'];

describe('MyHand.svelte', () => {
	it('renders a button per card', async () => {
		render(MyHand, { cards });
		for (const c of cards) {
			await expect.element(page.getByRole('button', { name: c })).toBeInTheDocument();
		}
	});

	it('only enables the legal cards, and only when active', async () => {
		const onplay = vi.fn();
		render(MyHand, { cards, legal: ['AS', '9H'], active: true, onplay });

		await expect.element(page.getByRole('button', { name: 'AS' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'KS' })).toBeDisabled();

		await page.getByRole('button', { name: '9H' }).click();
		expect(onplay).toHaveBeenCalledWith('9H');

		await page.getByRole('button', { name: 'KS' }).click({ force: true });
		expect(onplay).toHaveBeenCalledTimes(1); // the illegal card did nothing
	});

	it('disables every card when it is not this player’s turn', async () => {
		render(MyHand, { cards, legal: cards, active: false });
		for (const c of cards) {
			await expect.element(page.getByRole('button', { name: c })).toBeDisabled();
		}
	});
});
