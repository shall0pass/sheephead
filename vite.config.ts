import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import wasm from 'vite-plugin-wasm';

// In dev, the join-code registry (`/games/:code`) is served by the sync server;
// in production it's a same-origin Cloudflare Pages Function. Proxy it to the
// sync server's HTTP origin, derived from PUBLIC_SYNC_URL.
const syncUrl =
	loadEnv('development', process.cwd(), 'PUBLIC_').PUBLIC_SYNC_URL ?? 'ws://localhost:3030';
const registryTarget = syncUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');

export default defineConfig({
	server: {
		proxy: { '/games': { target: registryTarget, changeOrigin: true } }
	},
	plugins: [
		tailwindcss(),
		// Automerge ships its core as WebAssembly; this lets Vite load it in the
		// browser bundle and in the dev server. (Vite 8 / rolldown handles the
		// top-level await in Automerge's ESM entry natively.)
		wasm(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// The game is a fully client-side SPA (Automerge/wasm is browser-only),
			// deployed as a static site. `fallback` makes every route serve the
			// client shell so client-side routing takes over.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	optimizeDeps: {
		// Keep the wasm core external — Vite's pre-bundler can't handle it — but
		// DO pre-bundle automerge-repo and its adapters so their CommonJS deps
		// (eventemitter3, cbor-x, …) get proper ESM interop in the browser and
		// in the browser test runner.
		exclude: ['@automerge/automerge'],
		include: [
			'@automerge/automerge-repo',
			'@automerge/automerge-repo-network-websocket',
			'@automerge/automerge-repo-storage-indexeddb'
		]
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
