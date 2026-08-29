# Clabber sync server

A standalone [Automerge](https://automerge.org) sync server: it relays sync
messages between players' browsers and keeps a durable copy of every game
document on disk. It contains **no Clabber game logic**.

The front-end app is deployed separately as a static site and is pointed at
this server through the `PUBLIC_SYNC_URL` build-time variable (see the repo
root `.env`).

## Run locally

```sh
cd sync-server
npm install
npm run dev      # node --watch, restarts on change
# or: npm start
```

Listens on `ws://localhost:3030` by default. Health check: `GET /health` → `ok`.

From the repo root you can also run `npm run sync`.

## Configuration

| Env var    | Default  | Purpose                          |
| ---------- | -------- | -------------------------------- |
| `PORT`     | `3030`   | TCP port                         |
| `DATA_DIR` | `./data` | On-disk Automerge document store |

## Deploy

```sh
docker build -t clabber-sync ./sync-server
docker run -p 3030:3030 -v clabber-data:/data clabber-sync
```

Put it behind TLS (e.g. a reverse proxy) so browsers on the deployed static
site can reach it over `wss://`.
