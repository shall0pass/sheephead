import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MyHand from './MyHand.svelte';
import type { Card } from '$lib/sheephead/types';

const cards: Card[] = ['AS', 'KS', '9H', 'QC', 'JD'];

describe('MyHand.svelte', () => {
	it('renders a button per card, sorted trump-first', async () => {
		render(MyHand, { cards });
		for (const c of cards) {
			await expect.element(page.getByRole('button', { name: c })).toBeInTheDocument();
		}
	});

	it('only enables the legal cards during trick play', async () => {
		const onplay = vi.fn();
		render(MyHand, { cards, legal: ['QC', 'JD'], onplay });

		await expect.element(page.getByRole('button', { name: 'QC' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'AS' })).toBeDisabled();

		await page.getByRole('button', { name: 'JD' }).click();
		expect(onplay).toHaveBeenCalledWith('JD');
	});

	it('disables every card when legal is null (not your turn)', async () => {
		render(MyHand, { cards, legal: null });
		for (const c of cards) {
			await expect.element(page.getByRole('button', { name: c })).toBeDisabled();
		}
	});

	it('toggles selection in bury mode instead of playing', async () => {
		const ontoggle = vi.fn();
		render(MyHand, { cards, selectable: true, selected: [], ontoggle });
		const btn = page.getByRole('button', { name: 'AS' });
		await expect.element(btn).toBeEnabled();
		await btn.click();
		expect(ontoggle).toHaveBeenCalledWith('AS');
	});
});
