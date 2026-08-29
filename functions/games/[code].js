// Cloudflare Pages Function — the Clabber join-code registry.
//
// Route:  /games/:code
//   GET  → 200 { code, url, createdAt } | 404
//   PUT  → 201 created | 200 already yours | 409 taken   body: { url }
//
// Needs a KV namespace bound as `GAMES` (see wrangler.jsonc or the Pages
// dashboard → Settings → Functions → KV namespace bindings). Only needed if you
// want short join codes; without it, games are shared by invite link.

const CODE_RE = /^[A-Z0-9]{4,12}$/;
const TTL_SECONDS = 7 * 24 * 60 * 60; // forget codes after a week

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, PUT, OPTIONS',
	'access-control-allow-headers': 'content-type'
};

const json = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...CORS }
	});

export function onRequestOptions() {
	return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ params, env }) {
	const code = String(params.code).toUpperCase();
	if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
	const raw = await env.GAMES.get(code);
	if (!raw) return json({ error: 'no such game' }, 404);
	return json({ code, ...JSON.parse(raw) });
}

export async function onRequestPut({ params, env, request }) {
	const code = String(params.code).toUpperCase();
	if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);

	let url;
	try {
		({ url } = await request.json());
	} catch {
		return json({ error: 'expected { url }' }, 400);
	}
	if (typeof url !== 'string' || !url.startsWith('automerge:')) {
		return json({ error: 'url must be an automerge: url' }, 400);
	}

	const existing = await env.GAMES.get(code);
	if (existing) {
		const entry = JSON.parse(existing);
		return entry.url === url ? json({ code, ...entry }) : json({ error: 'code taken' }, 409);
	}

	const entry = { url, createdAt: Date.now() };
	await env.GAMES.put(code, JSON.stringify(entry), { expirationTtl: TTL_SECONDS });
	return json({ code, ...entry }, 201);
}
