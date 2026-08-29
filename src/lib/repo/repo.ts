// The shared Automerge repo. One per tab: a WebSocket connection to our sync
// server plus an IndexedDB cache so a reload rejoins instantly and offline
// edits catch up later.

import { Repo, type Repo as RepoType } from '@automerge/automerge-repo';
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { PUBLIC_SYNC_URL } from '$env/static/public';

/** Short join codes need the same-origin `/games/:code` registry (Vite proxy in
 *  dev, an nginx proxy in Docker, a Pages Function in prod). The public
 *  Automerge relay has no such registry, so a build pointed at it can only
 *  share games by invite link — the "secret code" box is hidden in that case. */
export const JOIN_CODES_SUPPORTED = !/(^|\.)sync\.automerge\.org$/.test(
	(() => {
		try {
			return new URL(PUBLIC_SYNC_URL).hostname;
		} catch {
			return '';
		}
	})()
);

let repo: RepoType | undefined;

export function getRepo(): RepoType {
	if (!repo) {
		repo = new Repo({
			network: [new WebSocketClientAdapter(PUBLIC_SYNC_URL)],
			storage: new IndexedDBStorageAdapter('clabber')
		});
	}
	return repo;
}
