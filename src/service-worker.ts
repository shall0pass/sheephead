/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// A small offline cache so Clabber is installable and its shell loads without a
// network. Live play still needs the sync-server WebSocket; that traffic is
// cross-origin and the worker never touches it.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `clabber-${version}`;
// `files` includes the icons and manifest from static/; `build` is the app JS/CSS.
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return; // leave the sync WebSocket / CDNs alone

	event.respondWith(respond(request, url));
});

async function respond(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);

	// Versioned build assets and static files never change under a given
	// version — serve them straight from cache.
	if (PRECACHE.includes(url.pathname)) {
		const hit = await cache.match(url.pathname);
		if (hit) return hit;
	}

	// Everything else: try the network, fall back to the cache, and for a
	// navigation fall back to the app shell so the SPA still boots offline.
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic') cache.put(request, response.clone());
		return response;
	} catch {
		const hit = await cache.match(request);
		if (hit) return hit;
		if (request.mode === 'navigate') {
			const shell = (await cache.match('/')) ?? (await cache.match('/index.html'));
			if (shell) return shell;
		}
		throw new Error('offline and no cached copy');
	}
}
