# Deploying to Cloudflare Pages (with the public Automerge server)

The app is a static single-page app. It needs two things at runtime:

1. **An Automerge sync server** — a WebSocket relay the browsers talk to. This
   guide uses the free public one at `wss://sync.automerge.org`, so there is
   nothing to run.
2. **A join-code registry** — a tiny `code → document-url` lookup at
   `/games/:code`. On Cloudflare this is a Pages Function backed by KV. It is
   **optional**: without it, games are still shared by invite link.

```
 Browser  ──wss──▶  sync.automerge.org        (Automerge sync — public)
    │
    └──https──▶  <your-site>.pages.dev/games/:code   (join codes — Pages Function + KV)
                  └── static assets served from the same origin
```

There is no server of ours to run. The self-hosted `sync-server/` and
`docker-compose.yml` are an alternative to all of this, not a requirement.

---

## 1. Prerequisites

- A Cloudflare account (free tier is fine).
- This repo pushed to GitHub/GitLab, **or** `npx wrangler login` for CLI
  deploys. `wrangler` is already a dev dependency.

## 2. Build settings

| Setting                | Value            |
| ---------------------- | ---------------- |
| Framework preset       | None / SvelteKit |
| Build command          | `npm run build`  |
| Build output directory | `build`          |
| Node version           | 20 or newer      |

`adapter-static` writes the SPA to `build/`. `static/_redirects`
(`/* /index.html 200`) is copied into it so deep links and refreshes work;
`functions/` at the repo root is picked up automatically for `/games/:code`.

## 3. Environment variables

`PUBLIC_SYNC_URL` — the WebSocket relay the browser connects to — is baked into
the bundle at build time.

**The repo already ships a default:** `.env.production` sets
`PUBLIC_SYNC_URL=wss://sync.automerge.org`, so a fresh Pages project builds and
runs with **no configuration at all**. Only override it if you run your own
relay.

To override, add it in _Pages → your project → Settings → Variables and
Secrets_:

| Name              | Value               | Notes                                                                                               |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `PUBLIC_SYNC_URL` | `wss://your-relay…` | must be a **plaintext Variable**, and set for the environment you deploy (Production _and_ Preview) |

> **"Missing PUBLIC_SYNC_URL export" on the build?** That means the build can't
> see the variable. Two usual causes:
>
> 1. It was added as a **Secret** (the lock icon). Cloudflare does **not**
>    expose Secrets to the build step — only plaintext Variables. Delete it and
>    re-add it as a plaintext Variable.
> 2. It's set for **Production** but the failing build is a **Preview** (a
>    branch or pull request), or vice versa. Add it to both.
>
> With `.env.production` in place the build no longer fails either way; it just
> falls back to the public relay if the dashboard value doesn't reach it.

`DATABASE_URL` from `.env.example` is only for the unused Drizzle scaffold —
ignore it.

## 4. Short join codes (optional but recommended)

Skip this and games are shared by **invite link** — "Start a new game" shows a
_Copy invite link_ button; anyone who opens the link joins. The link carries
the Automerge document id in its `#fragment`.

When no registry is reachable (public relay, no KV binding) the login screen
**hides the "secret code" box entirely** — it probes `/games/:code` on load and
only shows the box if a real registry answers — so players just see "Start a new
game" and share the link. Add the KV namespace below and the box comes back.

To get the friendly 5-character codes instead, add a KV namespace for the
`functions/games/[code].js` Function:

```sh
npx wrangler kv namespace create GAMES
```

Then bind it, either way:

- **Dashboard:** _Pages → Settings → Functions → KV namespace bindings_ →
  add `GAMES` → select the namespace. (Add it for Production and Preview.)
- **wrangler.jsonc:** paste the printed id:

  ```jsonc
  "kv_namespaces": [{ "binding": "GAMES", "id": "<the-id-from-above>" }]
  ```

The Function stores each code for 7 days (`expirationTtl`), so KV never fills
up. Nothing else changes — the client always calls `/games/:code` on its own
origin; the Function answers when KV is bound, and the client falls back to
invite links when it isn't.

## 5. Deploy

**Git integration (recommended):** connect the repo in the Pages dashboard with
the build settings above. Every push to the production branch deploys; pull
requests get preview URLs.

**CLI:**

```sh
npm run build          # PUBLIC_SYNC_URL is read from your shell / .env here
npx wrangler pages deploy build
# or: npm run pages:deploy
```

For a CLI build, make sure `PUBLIC_SYNC_URL` is set in the environment or in a
local `.env` (see below) — it is baked into the bundle.

## 6. Local preview of this exact setup

```sh
PUBLIC_SYNC_URL=wss://sync.automerge.org npm run build
npx wrangler pages dev build --kv GAMES        # or: npm run pages:dev
```

`wrangler pages dev` serves `build/` + the Function + a **local** KV, so you
can exercise short codes offline while sync still goes to the real relay.

> Plain `npm run dev` is different: it proxies `/games` to `PUBLIC_SYNC_URL`'s
> host, i.e. it expects the self-hosted `sync-server` (`npm run sync`). If your
> `.env` points `PUBLIC_SYNC_URL` at `wss://sync.automerge.org`, use
> `npm run pages:dev` for local work, or set `PUBLIC_SYNC_URL=ws://localhost:3030`
> and run `npm run sync`.

## 7. Custom domain & HTTPS

Add the domain under _Pages → Custom domains_. Cloudflare provisions the
certificate automatically; `wss://sync.automerge.org` is already TLS.

---

## Things to know about the public relay

- **Data lives on a third-party server.** `sync.automerge.org` is a public
  demo relay run by the Automerge project. It is best-effort: no uptime SLA,
  and documents may be evicted. Fine for casual games; for anything you care
  about, deploy the self-hosted `sync-server/` (see `docker-compose.yml`) and
  set `PUBLIC_SYNC_URL` to it.
- **The trust model is unchanged.** Every hand is in the shared document in the
  clear; the UI only renders your own. Don't inspect the raw data.
- **No accounts, no secrets on the relay.** The join code (or link) is the only
  thing gating a table.
