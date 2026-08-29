// The whole app is a client-side SPA: Automerge (wasm) and the sync-server
// WebSocket connection only exist in the browser, so there is nothing to
// server-render or prerender. `adapter-static` emits the shell as
// `index.html` (see `fallback` in vite.config.ts) and this SPA boots there.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'always';
