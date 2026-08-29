# Sheephead

A 5‑player online **Sheephead** (Sheepshead) card game. Real people join with a
secret code and sit around one green table; any empty seats are played by bots.
Game state is shared between every player's browser with an
[Automerge](https://automerge.org/) CRDT, relayed by a small self‑hosted sync
server. The front end is a static single‑page app built with SvelteKit.

See [`docs/implementation-plan.md`](docs/implementation-plan.md) for the design
and [`artifacts/game_rules.md`](artifacts/game_rules.md) for the rules being
implemented.

## Developing

```sh
npm install
npm run sync:install   # deps for the sync server (sync-server/)
npm run sync:dev       # start the Automerge sync server on ws://localhost:3030
npm run dev            # start the app
```

`PUBLIC_SYNC_URL` (see `.env.example`) points the app at the sync server.

## Checks

```sh
npm run lint     # prettier + eslint
npm run check    # svelte-check / tsc
npm test         # vitest (node + browser projects)
npm run build    # static build into build/
```

## Deploying

- **Docker:** `docker compose up --build` — web on `:8080`, sync on `:3030`.
  Override the public sync URL with
  `SHEEPHEAD_SYNC_URL=wss://sync.example.com docker compose up --build`.
- **Cloudflare Pages:** see [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md).

The sync server (`sync-server/`) is deployed separately as its own always‑on
service and contains no game logic.
