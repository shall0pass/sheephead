// Phase 0 smoke test: prove two independent Automerge repos sync a document
// through the local sync server.
//
//   1. terminal A:  npm run sync
//   2. terminal B:  node scripts/smoke-sync.mjs
//
// Expected output ends with: "OK: repo B observed count = 3"

import { Repo } from '@automerge/automerge-repo';
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';

const URL = process.env.PUBLIC_SYNC_URL ?? 'ws://localhost:3030';

const repoA = new Repo({ network: [new WebSocketClientAdapter(URL)] });
const repoB = new Repo({ network: [new WebSocketClientAdapter(URL)] });

const handleA = repoA.create({ count: 0 });
handleA.change((d) => {
	d.count = 3;
});
await handleA.whenReady();

const handleB = await repoB.find(handleA.url);

const deadline = Date.now() + 5000;
while ((handleB.doc()?.count ?? 0) !== 3 && Date.now() < deadline) {
	await new Promise((r) => setTimeout(r, 100));
}

const seen = handleB.doc()?.count;
if (seen === 3) {
	console.log(`OK: repo B observed count = ${seen}  (doc ${handleA.url})`);
	process.exit(0);
} else {
	console.error(`FAIL: repo B saw count = ${seen}, expected 3`);
	process.exit(1);
}
