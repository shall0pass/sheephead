// Clabber sync server.
//
// A dumb Automerge relay: it forwards sync messages between the players'
// browsers and keeps a durable copy of every document on disk so a game
// survives everyone closing their tab. It has NO knowledge of Clabber rules,
// so it never needs redeploying when the game changes.
//
// It also keeps a tiny "join code -> document url" registry (games.json) so
// players can share a short code instead of a raw `automerge:` url. That is the
// only state here that is not an Automerge document.
//
// HTTP:
//   GET  /health              -> "ok"
//   GET  /games/:code         -> 200 { code, url, createdAt } | 404
//   PUT  /games/:code {url}    -> 201 created | 200 already yours | 409 taken
//
// Env:
//   PORT      - TCP port to listen on (default 3030)
//   DATA_DIR  - directory for the on-disk document store (default ./data)

import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { Repo } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';

const PORT = Number(process.env.PORT ?? 3030);
const DATA_DIR = process.env.DATA_DIR ?? './data';

// --- join-code registry --------------------------------------------------

mkdirSync(DATA_DIR, { recursive: true });
const REGISTRY = `${DATA_DIR}/games.json`;
/** @type {Record<string, { url: string, createdAt: number }>} */
const games = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : {};
const persist = () => writeFileSync(REGISTRY, JSON.stringify(games, null, 2));

const CODE_RE = /^[A-Z0-9]{4,12}$/;
const json = (res, status, body) => {
	res.writeHead(status, {
		'content-type': 'application/json',
		'access-control-allow-origin': '*'
	});
	res.end(JSON.stringify(body));
};

function handleRegistry(req, res, code) {
	code = code.toUpperCase();
	if (!CODE_RE.test(code)) return json(res, 400, { error: 'bad code' });

	if (req.method === 'GET') {
		const entry = games[code];
		return entry ? json(res, 200, { code, ...entry }) : json(res, 404, { error: 'no such game' });
	}

	if (req.method === 'PUT') {
		let raw = '';
		req.on('data', (c) => (raw += c));
		req.on('end', () => {
			let url;
			try {
				url = JSON.parse(raw).url;
			} catch {
				return json(res, 400, { error: 'expected { url }' });
			}
			if (typeof url !== 'string' || !url.startsWith('automerge:')) {
				return json(res, 400, { error: 'url must be an automerge: url' });
			}
			const existing = games[code];
			if (existing && existing.url !== url) return json(res, 409, { error: 'code taken' });
			if (existing) return json(res, 200, { code, ...existing });
			games[code] = { url, createdAt: Date.now() };
			persist();
			return json(res, 201, { code, ...games[code] });
		});
		return;
	}

	res.writeHead(405, { 'access-control-allow-origin': '*' });
	res.end();
}

// --- http + websocket --------------------------------------------------

const server = http.createServer((req, res) => {
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, PUT, OPTIONS',
			'access-control-allow-headers': 'content-type'
		});
		return res.end();
	}
	if (req.url === '/health') {
		res.writeHead(200, { 'content-type': 'text/plain' });
		return res.end('ok');
	}
	const m = req.url && req.url.match(/^\/games\/([^/?#]+)$/);
	if (m) return handleRegistry(req, res, decodeURIComponent(m[1]));

	res.writeHead(426, { 'content-type': 'text/plain' });
	res.end('Clabber Automerge sync server — connect over WebSocket.');
});

const wss = new WebSocketServer({ server });

const repo = new Repo({
	network: [new NodeWSServerAdapter(wss)],
	storage: new NodeFSStorageAdapter(DATA_DIR),
	// Relay everything: this server backs up every game doc it is told about.
	sharePolicy: async () => true
});

server.listen(PORT, () => {
	console.log(
		`clabber sync server listening on :${PORT}  (peer ${repo.peerId}, data: ${DATA_DIR}, ` +
			`${Object.keys(games).length} game codes)`
	);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		console.log(`\n${sig} received, shutting down`);
		wss.close();
		server.close(() => process.exit(0));
	});
}
