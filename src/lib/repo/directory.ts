// Join codes.
//
// A short, human-friendly code maps to an `automerge:` document url through a
// tiny same-origin registry: `GET /games/:code` → { url }, `PUT /games/:code`
// → claim it.
//
// Who serves `/games/:code`:
//   - local dev : Vite proxies it to PUBLIC_SYNC_URL's host (the sync server)
//   - docker    : nginx proxies it to the sync-server container
//   - Cloudflare: the Pages Function in functions/games/[code].js (+ KV)
//
// A pasted document url / id is resolved directly, so an invite link works
// even when no registry is reachable (e.g. Cloudflare without the KV binding).

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L
const CODE_LEN = 5;
// Automerge document ids are base58 and 20+ chars long — a 5-char join code
// can never look like one.
const DOC_ID_RE = /^(?:automerge:)?([1-9A-HJ-NP-Za-km-z]{20,})$/;

export function makeCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
	return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normaliseCode(input: string): string {
	return input.trim().toUpperCase().replace(/\s+/g, '');
}

/** If `input` is an automerge document url or bare id, its normalised
 *  `automerge:…` url; otherwise `null`. */
export function asDocumentUrl(input: string): string | null {
	const m = input.trim().match(DOC_ID_RE);
	return m ? `automerge:${m[1]}` : null;
}

/** Whether a same-origin join-code registry is actually answering. A live
 *  registry replies `404` (JSON) for an unknown code; with none, the SPA
 *  fallback serves `index.html` (`200`, HTML). Lets the UI hide the "secret
 *  code" box on a deploy that can only share games by invite link. */
export async function registryAvailable(): Promise<boolean> {
	try {
		const res = await fetch(`/games/__probe_${Math.random().toString(36).slice(2, 10)}`);
		if (res.status === 404) return true;
		return (res.headers.get('content-type') ?? '').includes('json');
	} catch {
		return false;
	}
}

/** The document url for a code (or a pasted url / id), or `null` if unknown. */
export async function resolveCode(codeOrUrl: string): Promise<string | null> {
	const direct = asDocumentUrl(codeOrUrl);
	if (direct) return direct;
	const res = await fetch(`/games/${encodeURIComponent(normaliseCode(codeOrUrl))}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`could not look up code (${res.status})`);
	return (await res.json()).url as string;
}

/** Claim `code` for `url`. `false` if it is already taken by a different game;
 *  throws if the registry is unreachable. */
export async function claimCode(code: string, url: string): Promise<boolean> {
	const res = await fetch(`/games/${encodeURIComponent(normaliseCode(code))}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url })
	});
	if (res.status === 201 || res.status === 200) return true;
	if (res.status === 409) return false;
	throw new Error(`could not claim code (${res.status})`);
}
