# Clabber — Implementation Plan

A 4‑player online Clabber card game. Real humans join with a secret code; empty
seats are played by bots. State is shared between everyone's browser with an
Automerge CRDT, relayed by a self‑hosted sync server. The front end ships as a
static site.

---

## 1. Decisions locked in

| Area               | Decision                                                                                                    | Consequence                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sync transport     | **Self‑hosted Automerge sync server** (small Node/`ws` service in this repo)                                | We run one tiny always‑on process; no dependency on the public demo relay.                                                                       |
| Hidden information | **Trust‑based** — every hand is stored in the doc in plaintext; the UI only renders the local player's hand | Simple and fully CRDT‑native. A determined player could read another hand out of the raw doc. Acceptable for a friendly game; documented in‑app. |
| Front‑end deploy   | **Static site** (`@sveltejs/adapter-static`, SPA mode) hosted on any CDN/Pages                              | No SvelteKit server. The sync server is deployed separately as its own service. The app is handed the sync server URL via a build‑time env var.  |

These three combine cleanly: a static SPA that opens a WebSocket to our own
sync server and keeps a local IndexedDB copy for reconnects.

---

## 2. Tech stack

**Already in the repo:** SvelteKit 2, Svelte 5 (runes forced on), Tailwind 4,
TypeScript, Vitest (browser + node projects), Prettier/ESLint. Drizzle +
`better-sqlite3` are scaffolded but unused by this design — leave them for now,
remove in a later cleanup.

**Added in Phase 0** (exact versions pinned):

| Package                                       | Version | Purpose                                    |
| --------------------------------------------- | ------- | ------------------------------------------ |
| `@automerge/automerge`                        | 3.4.1   | CRDT core (wasm)                           |
| `@automerge/automerge-repo`                   | 2.5.6   | Document repo, sync, `DocHandle`           |
| `@automerge/automerge-repo-network-websocket` | 2.5.6   | Browser ↔ sync‑server transport            |
| `@automerge/automerge-repo-storage-indexeddb` | 2.5.6   | Local persistence / offline reconnect      |
| `vite-plugin-wasm`                            | 3.6.0   | Load the Automerge wasm in the Vite bundle |
| `@sveltejs/adapter-static`                    | 3.0.10  | Static SPA build (replaces `adapter-auto`) |
| `canvas-confetti` / `@types/canvas-confetti`  | 1.9.4   | Winner fireworks                           |

> `vite-plugin-top-level-await` is **not** needed: Vite 8 uses rolldown, which
> emits the top‑level await in Automerge's ESM entry natively (and the plugin's
> hard dependency on `rollup` breaks the build). `@automerge/vite-plugin` does
> not exist on npm.

Sync server (`sync-server/`, its own `package.json`): a ~40‑line wrapper around
`Repo` + `NodeWSServerAdapter` (`@automerge/automerge-repo-network-websocket`) +
`NodeFSStorageAdapter` (`@automerge/automerge-repo-storage-nodefs`) + `ws`. The
published `@automerge/automerge-repo-sync-server` package is stale (0.2.8), so we
own the ~40 lines instead.

---

## 3. Architecture

### 3.1 Networking

```
┌────────────┐   wss://   ┌──────────────────┐   wss://   ┌────────────┐
│ Browser A  │◀──────────▶│  Sync server     │◀──────────▶│ Browser B  │
│ Repo+IDB   │            │  Repo + FS store │            │ Repo+IDB   │
└────────────┘            └──────────────────┘            └────────────┘
        ▲                                                        ▲
        └──────────────── Browser C, Browser D ──────────────────┘
```

- Each browser creates one `Repo` with the WebSocket adapter (URL from
  `PUBLIC_SYNC_URL`) and the IndexedDB storage adapter.
- The sync server is a dumb relay + durable store. It contains **no game
  logic** — it never needs redeploying when rules change.

### 3.2 The secret code ↔ document mapping

Automerge document IDs are random, not chosen. To let a human type a short
friendly code, a tiny **same-origin** registry maps `CODE → automerge url`:

```
GET  /games/:CODE        -> 200 { code, url, createdAt } | 404
PUT  /games/:CODE { url } -> 201 created | 200 already yours | 409 taken
```

- **Create game:** `repo.create()` a fresh doc, then
  `PUT /games/:CODE { url }` with a generated 5-char code (alphabet without
  `0 O 1 I L`); regenerate on the rare 409. If no registry answers, fall back
  to using the document id as the shareable identifier (invite link).
- **Join game:** a pasted `automerge:` url / bare doc id is used directly
  (`asDocumentUrl`); otherwise `GET /games/:CODE`, `repo.find(url)` on 200, "no
  game with that code" on 404. Codes are upper-cased / whitespace-stripped.

**Who serves `/games/:CODE`** (the client always calls it same-origin):

| Environment         | Registry                                                         |
| ------------------- | ---------------------------------------------------------------- |
| local `npm run dev` | Vite `server.proxy` → `PUBLIC_SYNC_URL`'s host (the sync server) |
| Docker              | nginx `location /games/` → the `sync-server` container           |
| Cloudflare Pages    | `functions/games/[code].js`, backed by a `GAMES` KV namespace    |

The sync server (`sync-server/server.mjs`) still serves the registry itself
from a `games.json` file for the first two. All three carry **no Clabber
logic**.

> This dropped the original "directory document at a well-known Automerge URL"
> plan — that URL must be minted once and then persist forever on the relay,
> which is fragile to bootstrap. A same-origin key-value lookup, served by
> whatever infrastructure the deployment already has, is simpler. See
> `docs/deploy-cloudflare.md`.

### 3.3 Who runs the bots — host election

Bots must be driven by exactly one client or they'd act four times.

- The game doc has `hostActorId`. On load, if `hostActorId` is empty or its
  owner hasn't updated `presence` within ~10 s, the client with the
  lexicographically smallest active `actorId` claims host (CRDT‑safe: writes
  are last‑writer‑wins on a scalar and converge; a brief double‑claim is
  harmless because bot moves are idempotent — see below).
- The host runs a **reconciler**: on every doc change, if
  `state.turn` belongs to a bot seat (or bidding/meld is owed by a bot), it
  computes the move and applies it after a short, humanising delay
  (400–1200 ms).
- **Idempotency:** every mutating action is guarded by a precondition check
  against current doc state (right phase, right seat, card still in hand). Two
  hosts briefly both acting therefore cannot double‑play.

### 3.4 Trust model / limitations (documented in‑app)

- Full hands live in the doc. UI shows only `me`. A small "friendly game —
  don't peek at the raw data" note near the join box.
- No server‑side rules enforcement. Clients validate every local action with
  the shared rules engine; the host also validates bot actions. Malicious
  clients are out of scope.

---

## 4. Game state model (Automerge document)

One document per game. All fields are plain JSON (Automerge‑friendly). Cards are
strings: `"AS" "TS" "KH" "9C"` … (rank ∈ `A K Q J T 9`, suit ∈ `S H D C`).

```ts
type Seat = 0 | 1 | 2 | 3; // 0 bottom (local default), 1 left, 2 top(partner of 0), 3 right
type TeamId = 0 | 1; // team 0 = seats 0 & 2, team 1 = seats 1 & 3

interface PlayerSlot {
	seat: Seat;
	name: string; // editable, pencil icon
	isBot: boolean;
	botName?: string; // "Rainbow Goose", "Michael Jordan", …
	connected: boolean; // derived from presence heartbeats
	actorId?: string; // Automerge actor that "owns" this human seat
	lastSeen: number; // epoch ms heartbeat
}

type Phase =
	| 'lobby'
	| 'dealing'
	| 'bid1' // round 1: play/pass the up-card suit
	| 'bid2' // round 2: choose any other suit, or pass
	| 'redeal' // all passed twice -> same dealer redeals
	| 'meld' // announcements owed on trick 1
	| 'trick' // normal trick play
	| 'handScored' // between hands, show breakdown
	| 'gameOver';

interface GameDoc {
	version: 1;
	code: string;
	createdAt: number;
	hostActorId: string;

	players: PlayerSlot[]; // length 4, one per seat

	phase: Phase;
	dealer: Seat;
	rngSeed: string; // host sets per deal; deterministic shuffle for replay/tests

	hands: Record<Seat, string[]>; // full hands (trust-based)
	upCard: string | null; // dealer's turned-up 6th card during bidding
	trump: 'S' | 'H' | 'D' | 'C' | null;
	maker: TeamId | null; // team that declared trump

	bidding: {
		round: 1 | 2;
		turn: Seat;
		passes: Seat[]; // who has passed this round
		passedSuit: 'S' | 'H' | 'D' | 'C' | null; // suit forbidden in round 2
	} | null;

	trick: {
		number: number; // 1..6
		leader: Seat;
		turn: Seat;
		plays: { seat: Seat; card: string }[];
	} | null;

	tricksWon: Record<Seat, string[][]>; // cards collected, per seat (team totals derived)
	lastTrickWinner: Seat | null;

	melds: {
		// announced on trick 1, shown before trick 2
		declared: Record<Seat, MeldClaim[]>;
		shown: Record<Seat, boolean>;
		resolvedTeam: TeamId | null; // team that scored meld this hand
		bella: Record<Seat, boolean>; // K+Q trump, always scores
	};

	score: {
		running: Record<TeamId, number>; // cumulative toward 500
		hands: HandResult[]; // history for the scoreboard
	};

	winner: TeamId | null;

	log: LogEntry[]; // human-readable event feed (append-only)
}

interface MeldClaim {
	kind: 'dad' | 'fifty' | 'hundred' | 'twohundred' | 'bella';
	cards: string[];
	points: number;
}
interface HandResult {
	dealer: Seat;
	trump: string;
	maker: TeamId;
	trickPoints: Record<TeamId, number>;
	meldPoints: Record<TeamId, number>;
	set: boolean; // maker went set
	awarded: Record<TeamId, number>;
}
```

Presence (heartbeats, "who is looking") uses `automerge-repo`'s ephemeral
messaging **or** a `players[seat].lastSeen` write every 4 s — simplest to keep
it in‑doc and prune on the host.

---

## 5. Rules engine — `src/lib/clabber/` (pure, no Svelte, no Automerge)

Fully unit‑tested pure functions. This is the heart of correctness.

| Module       | Responsibility                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards.ts`   | 24‑card deck, rank/suit parsing, non‑trump vs trump ordering, point values (Table in the rules).                                                                                                                                                                                                                                                                     |
| `deal.ts`    | Seeded shuffle (`mulberry32`/`seedrandom`), deal 6 each clockwise, set up‑card.                                                                                                                                                                                                                                                                                      |
| `bidding.ts` | `legalBids(doc)`, `applyBid(doc, seat, 'play'                                                                                                                                                                                                                                                                                                                        | 'pass' | {suit})`, round‑1→round‑2→redeal transitions, "must hold ≥1 card of the suit" check, round‑2 forbidden‑suit check. |
| `play.ts`    | `legalMoves(doc, seat)` implementing: follow suit; if void, must trump; must overtrump the highest trump so far (even partner's) when able; else throw off. `applyPlay`, `resolveTrick` (highest trump, else highest of led suit), leader of next trick, last‑trick +10.                                                                                             |
| `meld.ts`    | Detect all melds in a hand (sequences ≥3 in a suit using `9 T J Q K A`; four‑of‑a‑kind; four jacks = 200; bella = K+Q trump). `compareMeld` for "highest meld wins team scoring", equal‑sequence rules (length, then top card, then trump beats non‑trump, else nobody), bella always scores, "dad 'a' belle" 40.                                                    |
| `score.ts`   | End‑of‑hand: trick points per team (+10 last trick, 162 total), add meld, apply **set** rule (maker must strictly out‑score opponents incl. meld or scores 0 and, if set, loses meld unless meld+tricks still outscores), write `HandResult`, update running score, detect ≥500 winner and tie‑break ("both ≥500 → higher total; tie over 500 → play another hand"). |
| `reducer.ts` | `reduce(doc, action, ctx)` — the single entry point every client calls inside `handle.change(...)`. Validates the action against `phase`/`turn`, mutates the draft. All UI and bot code go through this.                                                                                                                                                             |
| `actions.ts` | Action type union: `JoinSeat`, `LeaveSeat`, `RenameSeat`, `SetBot`, `StartHand`, `Bid`, `AnnounceMeld`, `PlayCard`. Presence/host actions are added in Phase 3/4.                                                                                                                                                                                                    |

> **As built (Phase 2):** see the Phase 2 checklist in §10 for what actually
> shipped and which sketched pieces were dropped or merged. `deal.ts` uses a
> local xmur3→mulberry32 PRNG (`rng.ts`), not `seedrandom`. `bidding.ts` /
> `play.ts` expose only the `legal*` query functions; the corresponding
> mutations live in `reducer.ts`.

Renege handling: keep **light** — the engine simply never offers an illegal
move in `legalMoves`, so honest clients and bots can't renege. A "call renege"
mechanic is out of scope for v1 (noted in §12).

---

## 6. Bot AI — `src/lib/clabber/bot.ts`

Pure `chooseAction(doc, seat): Action`. Heuristic, not search:

- **Bidding:** estimate hand strength for the candidate trump (count trump,
  jacks/nines, aces, bella). Play round 1 if strong; round 2 pick best suit;
  otherwise pass. Never declare a suit it can't legally make.
- **Meld:** always announce everything the detector finds; always show.
- **Trick play:** rule‑restricted candidate list, then:
  - lead: low from long non‑trump, or push trump if holding J/9 trump control;
  - partner winning the trick → throw lowest / dump points onto partner;
  - can win cheaply → do; can't win → slough lowest‑value card;
  - respect the mandatory overtrump rule (engine enforces anyway).
- Humanising delay handled by the host reconciler, not the bot.

Funny name pool lives in `src/lib/clabber/botNames.ts` (Rainbow Goose, Michael
Jordan, Sir Reginald Featherbottom, …). Assigned uniquely when a seat is
bot‑filled.

---

## 7. Card art pipeline

Artifacts: `artifacts/PlayingCards.svg` (Inkscape sprite, viewBox `0 0 832 356`,
each card **64×89**, a **13×4 grid** = 52 cards) and
`artifacts/CardBackscomplete.svg` (backs).

Plan:

1. One‑off build script `scripts/slice-cards.mjs`: rasterise/or split the sprite
   into 24 needed faces + 1 back as individual optimised SVGs (or a single
   cleaned sprite + a JSON coordinate map). Output to
   `src/lib/assets/cards/` (e.g. `AS.svg`, `back.svg`) — committed.
2. First step of the script is a tiny probe that renders the grid with row/col
   labels so we can **confirm the suit/rank ordering** of the sheet before
   trusting the map (rows are most likely the four suits, columns `A 2 … K`).
3. `Card.svelte` takes a `card="AS"` prop → `<img>`/inline SVG, with a
   `faceDown` variant. Sizing via CSS custom property so the table can scale
   cards responsively.

---

## 8. UI / components — `src/lib/components/`

SPA: `src/routes/+layout.ts` sets `export const ssr = false; export const prerender = true;`
Single route `src/routes/+page.svelte` switches on `phase`.

### 8.1 Join screen (`JoinScreen.svelte`)

- Big centred text input for the secret code + "Join".
- "Start a new game" → creates doc, shows the generated code with a copy
  button, drops you into the lobby.
- Small trust‑model note.

### 8.2 Lobby / seating (`Lobby.svelte`, `SeatPicker.svelte`)

- Round green table rendered already (see 8.3) with the 4 seats.
- Empty seat → "Sit here". Occupied seat → shows name + human/bot badge.
- Choose **your team** by choosing a seat (0/2 vs 1/3); partner across the top
  is highlighted.
- Name field with a **pencil icon** to edit your own name.
- "Fill empty seats with computers" toggle → bot names + a little 🖥/robot icon
  next to each bot name. Auto‑fill also triggers automatically on "Deal" if
  seats are open.
- "Deal" enabled once all 4 seats are filled (humans + bots) and ≥1 human.

### 8.3 Table (`Table.svelte`)

- Round table, felt‑green, radial shading; the **local player always at the
  bottom**, partner top, opponents left/right. Seat→screen‑position map rotates
  the doc's fixed seats so "me" is seat‑bottom.
- Each opponent: fanned face‑down cards, name plate, card count, dealer chip,
  "thinking…" indicator when it's their turn (incl. bot delay).
- Center: current trick — up to 4 cards laid toward each player, trump suit
  badge, trick number, running hand points.
- Local hand: fanned, face‑up, sorted (trump grouped, then by rank). Playable
  cards lift on hover and are the only clickable ones (`legalMoves`); illegal
  cards dimmed. **One card at a time** is enforced by `phase==='trick' &&
trick.turn === mySeat`.

### 8.4 Bidding (`BiddingPanel.svelte`)

- Round 1: up‑card shown by the dealer; on your turn, "Play (♦)" / "Pass".
- Round 2: "Pass" plus one button per still‑legal suit (excludes the passed
  suit and suits you hold no card of).
- Live turn indicator around the table; other seats show Play/Pass as it
  happens; log feed on the side.

### 8.5 Meld (`MeldPanel.svelte`)

- On trick 1, before your first card: checkboxes/auto‑detected list of your
  melds with points; "Announce" commits `declared`. Before trick 2 a "Show"
  button commits `shown`. Bella called out separately.
- After trick 1 resolves: banner "Team X scored 50 for meld" from
  `compareMeld`.

### 8.6 Scoreboard (`Scoreboard.svelte`)

- Persistent compact running score (Us vs Them) toward 500.
- `phase==='handScored'` → modal with the full `HandResult` breakdown (trick
  pts, meld, set/no‑set, awarded) and a "Next hand" button (host auto‑advances
  after a timeout too).

### 8.7 End of game (`GameOver.svelte`)

- `canvas-confetti` **fireworks** loop over the winning side of the table.
- Losing side: "tears of sadness" — CSS animated 😢 / falling teardrop
  particles over the two losing seats, desaturated.
- "Play again" resets to lobby keeping seats/names.

### 8.8 Shared state glue — `src/lib/repo/`

- `repo.ts`: singleton `Repo` (WS + IndexedDB), `PUBLIC_SYNC_URL`.
- `directory.ts`: get/create the directory doc, code↔url helpers.
- `gameStore.svelte.ts`: Svelte 5 runes wrapper around a `DocHandle` —
  `$state` doc snapshot, `change(fn)`, derived `me`, `legalMoves`, `myTurn`.
- `presence.ts`: 4 s heartbeat writer + stale‑seat pruning (host only).
- `host.ts`: election + bot reconciler loop.

---

## 9. Directory / file structure (target)

```
scripts/
  slice-cards.mjs           # card art -> src/lib/assets/cards/*
  create-directory-doc.mjs  # one-off: mint the well-known directory doc
sync-server/
  package.json              # its own deployable
  server.mjs                # Repo + NodeWSServerAdapter + FS storage
  Dockerfile
src/lib/
  clabber/                  # PURE rules engine + bot (fully unit tested)
    cards.ts deal.ts bidding.ts play.ts meld.ts score.ts
    reducer.ts actions.ts bot.ts botNames.ts types.ts
    *.spec.ts
  repo/
    repo.ts directory.ts gameStore.svelte.ts presence.ts host.ts
  components/
    Card.svelte Table.svelte Seat.svelte
    JoinScreen.svelte Lobby.svelte SeatPicker.svelte
    BiddingPanel.svelte MeldPanel.svelte Scoreboard.svelte
    GameOver.svelte Fireworks.svelte Tears.svelte
  assets/cards/             # generated card SVGs (committed)
src/routes/
  +layout.ts   (ssr=false, prerender=true)
  +layout.svelte
  +page.svelte             # phase switch
docs/
  implementation-plan.md   # this file
```

---

## 10. Implementation phases

Each phase ends green (`npm run lint`, `npm test`, app builds).

### Phase 0 — Project setup — ✅ done

- [x] Repo already `git init`'d (`main`, "initial commit"). Working tree clean.
- [x] Deps added and pinned (§2). Removed `adapter-auto`; `vite.config.ts` now
      uses `adapter-static` with `fallback: 'index.html'` + `vite-plugin-wasm` + `optimizeDeps.exclude` for the Automerge packages.
- [x] `src/routes/+layout.ts` → `ssr = false`, `prerender = false` (SPA).
- [x] `.env` / `.env.example`: `PUBLIC_SYNC_URL=ws://localhost:3030`.
- [x] `sync-server/` — own `package.json`, `server.mjs` (Repo + `NodeWSServerAdapter` + `NodeFSStorageAdapter`), `Dockerfile`, `README.md`. Root scripts
      `sync`, `sync:dev`, `sync:install`.
- [x] `scripts/smoke-sync.mjs` — two independent repos sync a counter doc
      through the running server (passes).
- [x] `src/lib/repo/wasm.svelte.spec.ts` — Automerge wasm creates/mutates/merges
      docs in headless Chromium (client Vitest project, passes).
- [x] Green gate: `npm run lint`, `npm run check`, `npm test`, `npm run build`
      (emits `build/index.html`), `npm run dev` all pass.
- Notes: `artifacts/`, `CLAUDE.md`, `sync-server/data/` added to
  `.prettierignore` (vendored / runtime).

### Phase 1 — Card rendering — ✅ done

- [x] Ordering resolved by rendering the sheet (Playwright screenshot), not a
      slicing script. `artifacts/PlayingCards.svg` is a 13×4 grid, cell 64×89:
      columns `A 2 3 4 5 6 7 8 9 10 J Q K`, rows `Clubs, Hearts, Spades,
Diamonds`. Copied whole to `static/cards/faces.svg` (1.6 MB / ~0.5 MB
      gzip) — no per-card slicing; cards are drawn as a CSS background sprite.
- [x] `artifacts/CardBackscomplete.svg` (~7 MB) dropped as too heavy; replaced
      with a hand-drawn `static/cards/back.svg` (~700 B) at the same aspect.
- [x] `src/lib/cards/sprite.ts` — sheet paths, grid, `CARD_RATIO`,
      `facePosition(card)`.
- [x] `src/lib/components/Card.svelte` — `card` / `faceDown` / `height` /
      `class`; background-sprite math, scales to any size, `role="img"` with
      the card name as label.
- [x] `src/routes/dev/+page.svelte` — gallery of all 24 Clabber cards + the
      back, size slider; gated behind `$app/environment`'s `dev` so it is inert
      in production. Verified visually via a Playwright screenshot.
- [x] Green: lint, check, build (total build 1.8 MB, `/dev` not prerendered).

### Phase 2 — Rules engine (no UI) — ✅ done

All under `src/lib/clabber/` (pure; no Svelte, no Automerge import except the
one compat test):

- [x] `types.ts`, `cards.ts`, `rng.ts` (seeded xmur3→mulberry32), `deal.ts`,
      `state.ts` (seat/team helpers + `createGame`).
- [x] `bidding.ts` (`legalBids`), `play.ts` (`legalMoves`), `meld.ts`
      (`detectMelds` / `selectBestMelds` / `compareMeldClaim` / `resolveMeld`),
      `score.ts` (`scoreHand` / `checkGameEnd`).
- [x] `actions.ts` + `reducer.ts` — one `reduce(doc, action)` that mutates in
      place and throws `RuleError`. `AdvanceAfterHand`, `ShowMeld`,
      `ToggleBotFill`, and the presence actions from the original sketch were
      dropped: `StartHand` covers "next hand" (it advances the dealer from
      `handScored`, keeps it from `redeal`); meld "show" is automatic in a
      digital game; presence/host actions belong to Phase 3/4.
- [x] `bot.ts` — heuristic `chooseBid` / `chooseCard`; `simulate.ts` —
      `playRandomGame(seed)`.
- [x] 71 tests across 9 spec files. Worked rules examples covered: 162-point
      total, non-trump vs trump order & points, follow-suit / mandatory
      trump-in / mandatory overtrump (incl. over partner) / no obligation on a
      non-trump follow, trick winner, round-1 accept, round-1 all-pass →
      round-2 with the passed suit forbidden, round-2 all-pass → redeal (same
      dealer), can't declare a suit you're void in, meld detection (dad / fifty
      / hundred / four aces / four jacks / bella / "dad 'a' belle" = 40 / two
      dads), meld comparison (points, top card, trump-beats-non-trump, equal
      non-trump push, bella always scores), set rule (incl. meld saving or not
      saving the makers), game end at 500 / both-over-500 / exact-tie replay.
- [x] `simulate.spec.ts` fuzzes 40 full bot games: every one terminates, ends
      `gameOver` with a valid leading winner, every hand conserves 162 trick
      points, no illegal move is ever produced, and results are deterministic
      per seed.
- [x] `automerge-compat.spec.ts` — `reduce` runs inside `Automerge.change()`
      and two peers converge, de-risking Phase 3.
- [x] Green: `npm run lint`, `npm run check`, `npm test` (71), `npm run build`.

### Phase 3 — Networking & lobby — ✅ done

- [x] **Join codes via a sync-server registry, not a directory doc.** The
      well-known-Automerge-URL approach was too fragile to bootstrap (mint
      once, must persist forever). Instead the sync server keeps a tiny
      `code → automerge url` map in `games.json` and exposes
      `GET /games/:code` and `PUT /games/:code {url}` (201 / 200 / 409), with
      CORS. Still no Clabber logic on the server.
- [x] `src/lib/repo/repo.ts` — one `Repo` per tab (`WebSocketClientAdapter` +
      `IndexedDBStorageAdapter`), `SYNC_HTTP` derived from `PUBLIC_SYNC_URL`.
- [x] `src/lib/repo/directory.ts` — `makeCode` (5 chars, no `0/O/1/I/L`),
      `normaliseCode`, `resolveCode`, `claimCode`.
- [x] `src/lib/repo/gameStore.svelte.ts` — `GameStore` runes wrapper
      (`doc` `$state`, `change(action)`, `mySeat`), `createNewGame()` /
      `joinExistingGame(code)`, per-tab `getClientId()` in `sessionStorage`.
- [x] `src/lib/repo/presence.svelte.ts` — heartbeats over Automerge
      **ephemeral messages** (not doc history); answers a newcomer immediately
      so presence converges in one round trip.
- [x] `src/lib/clabber/botNames.ts` — funny names + `pickBotNames(n, taken)`.
- [x] Components: `JoinScreen.svelte` (code input + "Start a new game"),
      `Seat.svelte` (name, online dot, robot icon for bots, pencil rename,
      sit/move/stand/remove), `Lobby.svelte` (round felt table, seats rotated
      so you sit at the bottom, partner highlighted, "Fill empty seats with
      computers", "Deal"). `+page.svelte` is the phase switch: no game →
      JoinScreen; `lobby` → Lobby; else a placeholder until Phase 5. The code
      lives in the URL fragment so a reload rejoins.
- [x] `optimizeDeps`: pre-bundle `@automerge/automerge-repo` + adapters (CJS
      interop for `eventemitter3` etc. in the browser + browser test runner);
      keep only `@automerge/automerge` (wasm) excluded.
- [x] Tests: `directory.spec.ts`, `botNames.spec.ts` (node),
      `gameStore.svelte.spec.ts` (chromium). 83 tests total.
- [x] Automated 2-tab Playwright E2E (create → join by code → seat →
      cross-tab convergence of seating and rename → fill bots → deal → both
      tabs advance → reload rejoins via `#code`), and presence dots go green
      both ways.

### Phase 4 — Host & bots — ✅ done

- [x] `src/lib/clabber/host.ts` (pure): `pickHost(onlineIds)` (smallest id
      wins, so every client agrees) and `nextBotAction(doc)` — the single move
      the bot-runner owes for the current position, or `null` on a human's
      turn / lobby / game over. Announces meld before the first card;
      auto-`StartHand`s from `redeal` and `handScored`.
- [x] New action `HostClaim { actorId }` → writes `doc.hostActorId` (Automerge
      LWW settles a concurrent claim; election logic lives client-side).
- [x] `src/lib/repo/host.ts` — `class Host`: on a 2.5 s tick and on every doc
      change it (a) claims the role if `hostActorId` is empty or its owner is
      offline per presence and this tab is `pickHost`, and (b) if `isHost`,
      schedules `nextBotAction` after a humanising delay (450–1150 ms;
      2.5 s between hands, 0.7 s before a re-deal), re-deriving from the live
      doc before applying and swallowing the `RuleError` if another client
      raced it.
- [x] Faster handover: `Presence` now broadcasts a `bye` on `stop()` /
      `beforeunload` and drops that client immediately; staleness window
      lowered to 12 s (3 missed beats) and shared with `HOST_STALE_MS`.
- [x] `+page.svelte` starts/stops a `Host`; shows "You're running the computer
      players" when `host.isHost`; exposes `window.__clabber` in dev.
- [x] Tests (94 total): `host.spec.ts` — `pickHost`, `HostClaim`,
      `nextBotAction` per phase incl. driving four bots to 500;
      `host.svelte.spec.ts` (chromium) — claims the role, drives bots off the
      lobby, stands down for a live foreign host, and **takes over a stale
      host mid-hand and finishes the game**.
- [x] Live 2-tab Playwright check: the two tabs elect a single host, bots bid
      and play with no human input, and closing the host tab hands off to the
      other in ~10 s.
- Note: a full unattended game with a _seated human_ isn't demoable end-to-end
  until the Phase 5 table UI gives that human a way to play; the pure and
  chromium tests cover the bot-only path.

### Phase 5 — Table & play UI — ✅ done

- [x] `Table.svelte` — the in-game view (replaces the placeholder). Seats
      rotated so you sit at the bottom; `PlayerPlate.svelte` per seat (name,
      bot icon, online dot, dealer chip **D**, amber turn glow, "thinking…"
      for a bot on turn, pass marker, team trick count); `CardFan.svelte`
      face-down fans for the other three hands.
- [x] `TrickArea.svelte` — felt circle at centre: trump symbol, trick N/6,
      live trick points, and the played cards laid toward each player's seat.
- [x] `MyHand.svelte` — your hand, `sortHand`ed (trump first, then by rank).
      Cards are `<button>`s; only `legalMoves` cards are enabled and lift on
      hover, and only while `phase ∈ {meld, trick} && trick.turn === mySeat`
      (one card at a time). Illegal cards dim.
- [x] `BiddingPanel.svelte` — up-card + round text; on your turn, one button
      per `legalBids` entry; otherwise "waiting for …".
- [x] `MeldPanel.svelte` — during the first trick, before you've played:
      lists `detectMelds` with points and an "Announce N" button; a transient
      "Team X scored N for meld" banner after the trick resolves.
- [x] `Scoreboard.svelte` — compact "You / Them" toward 500, always visible;
      a modal on `handScored` with the trick/meld/awarded/game breakdown and a
      "Next hand" button (the host also auto-advances — `interHandDelayMs`
      raised to 5 s so the breakdown is readable).
- [x] `GameOver.svelte` — 🎆 / 😢 placeholder (Phase 6 makes it real),
      final score, "Play again" → new `ResetToLobby` action (gameOver → lobby,
      keeps seats/names/code).
- [x] Helpers: `sortHand(cards, trump)` and `trickPointsSoFar(doc)` (pure,
      tested); `GameStore.tryChange` swallows a `RuleError` for UI-initiated
      moves that a bot raced. `?fast` (dev) shrinks bot delays.
- [x] Tests (103 total): `sortHand`, `trickPointsSoFar`, `ResetToLobby`,
      `MyHand.svelte` (legal gating + click), plus a full-game Playwright E2E —
      one Playwright-driven human + three host-driven bots play a complete
      game to 500 through the real UI (bidding → meld → trick play → hand
      scoring → next hand → game over).
- Deferred to Phase 7: tighter card fanning / responsive sizing, a visible
  log feed, trick animation.

### Phase 6 — Win / lose — ✅ done

- [x] `Fireworks.svelte` — full-screen `canvas-confetti` on its own canvas:
      an intense two-sided volley for ~3.5 s, then gentle bursts every ~1.1 s
      until unmounted; `useWorker` for smoothness; cleaned up on destroy.
- [x] `Tears.svelte` — 30 SVG teardrops falling on staggered CSS `fall`
      keyframes (random x / delay / duration / scale / drift).
- [x] Both honour `prefers-reduced-motion` (static 🎆 / 😢 instead).
- [x] `GameOver.svelte` shows `<Fireworks>` when you won or are spectating,
      `<Tears>` when you lost; card reads "Your team wins! 🎉" / "Your team
      lost" / "Team N wins"; **Play again** → `ResetToLobby`. Rendered outside
      the table's `.lost` filter so the overlays stay sharp and viewport-fixed.
- [x] `Table.svelte` desaturates (`filter: saturate(.3) brightness(.85)`,
      1 s transition) for the losing viewer only.
- [x] Tests: `GameOver.svelte.spec.ts` (chromium, `canvas-confetti` mocked) —
      win / loss / spectator text and Play again. 111 total.
- [x] Verified visually: win (confetti + card), loss (falling tears +
      desaturated table + card), spectator (confetti + "Team N wins"), and
      Play again returns to the lobby.

### Phase 7 — Polish & deploy — ✅ done (deploy = docs + verified locally)

- [x] **Absent-player handling** (host-driven). New `CoverSeat { seat, isBot }`
      action flips a seated human to/from the bot AI without dropping their
      name/`actorId`. The `Host` runs a presence reconciler: a seated human
      offline past `seatGraceMs` (~25 s on top of the 12 s presence window) is
      `LeaveSeat`'d in the lobby or `CoverSeat`'d mid-game; when they return,
      control hands straight back. Tests in `host.spec.ts` /
      `host.svelte.spec.ts`.
- [x] **Reconnect/resume** — already load-bearing: IndexedDB storage +
      auto-reconnecting WebSocket adapter + `#code` rejoin. Added an
      `navigator.onLine` banner ("the game will catch up…").
- [x] **Responsive table** — `uiScale = clamp(0.62, innerWidth/780, 1)` shrinks
      the opponent fans, trick cards and your hand; `clamp()` grid gaps;
      compact plates with hard name truncation on narrow screens. Verified at
      390 px: no horizontal overflow.
- [x] **a11y** — `MyHand` cards are buttons (Tab + Enter/Space) and focus jumps
      to the first legal card when your turn starts; a visually-hidden
      `aria-live` region announces "Your turn to bid / play…", the hand score
      and the result. Fireworks/tears already have `prefers-reduced-motion`
      fallbacks; the trick-win plate pulse honours it too.
- [x] **Log feed** — collapsible bottom-left panel, last ~14 events with
      `seat N` → player names.
- [x] **Trick feedback** — the winning player's plate pulses green for ~0.85 s
      when they take a trick. (A full card-gather animation would need the
      engine to keep a resolved trick on screen for a beat; left as a possible
      future refinement.)
- [x] **Cleanup** — removed the unused Drizzle / `better-sqlite3` /
      `adapter-auto` scaffold (its own commit).
- Deploy: the static build + Cloudflare Pages path is covered in
  `docs/deploy-cloudflare.md` and verified with `wrangler pages dev` against
  the live public relay; the Docker path is verified via `docker compose up`.
  Deploying the self-hosted `sync-server` to a real always-on host and a
  4-real-device smoke test are left to the operator.

**Containers (available now).** `Dockerfile` (root) builds the SPA with
`node:22-alpine` and serves `build/` from `nginx:1.27-alpine`
(`docker/nginx.conf` does the SPA `try_files … /index.html` fallback and
long‑caches `/_app/immutable/`). `sync-server/Dockerfile` runs the relay with a
`/health` `HEALTHCHECK`. `docker-compose.yml` wires both:
`docker compose up --build` → web on `:8080`, sync on `:3030` with a
`sync-data` volume. `PUBLIC_SYNC_URL` is baked into the web image at build
time; override it for a real deployment with
`CLABBER_SYNC_URL=wss://sync.example.com docker compose up --build` (a
compose‑only variable, kept distinct from the `PUBLIC_SYNC_URL` in the local
dev `.env`). `.dockerignore` keeps the local `.env` out of the image build.
`docker/nginx.conf` also proxies `/games/` to the `sync` container so the
join‑code registry is same‑origin.

**Cloudflare Pages (available now).** `docs/deploy-cloudflare.md` is the guide.
Static build + the public `wss://sync.automerge.org` relay + a same‑origin
join‑code registry as a Pages Function (`functions/games/[code].js` + a `GAMES`
KV namespace). `static/_redirects` gives SPA routing; `wrangler` is a dev
dependency with `npm run pages:dev` / `pages:deploy`. Without the KV binding
the app still works — games are shared by invite link. Verified end‑to‑end
with `wrangler pages dev` against the real public relay.

---

## 11. Testing strategy

- **Unit (node project):** the entire `src/lib/clabber/` tree. Target: every
  rule in the rules doc has a named test. Deterministic via `rngSeed`.
- **Property/simulation:** thousands of full bot games asserting invariants.
- **Component (browser project):** `Card`, `BiddingPanel` legal‑button set,
  `MeldPanel` detection display, `Scoreboard` breakdown, seat rotation math.
- **Integration:** drive two in‑process `Repo`s wired to an in‑memory network,
  run a scripted 4‑player hand, assert both docs converge and match an expected
  `HandResult`.
- **Manual multi‑device checklist** kept in `docs/` for each release.

---

## 12. Risks & open questions

- **Sprite ordering** unknown until the Phase 1 probe — cheap to resolve.
- **Directory‑doc contention:** many games sharing one directory doc is fine
  (map of small strings) but it grows forever — add a TTL prune on the host, or
  shard by first code letter later.
- **Host election races** on flaky networks — mitigated by idempotent,
  precondition‑guarded actions; worth a focused test.
- **Trust model:** hands are readable in the raw doc. If this ever needs to be
  real, revisit per‑seat encryption (keys derived from the code) — designed
  around but not built.
- **Renege** — an **Advanced mode** (a game-wide `doc.advanced` flag, chosen
  with a checkbox in the lobby and locked once the deal starts — the reducer
  rejects `SetAdvanced` outside `phase === 'lobby'`) lets any player play any
  card in hand. Playing one that breaks follow/trump rules sets `doc.renege`
  and ends the hand via `finishRenegedHand`: the reneging team scores 0, their
  opponents score 162 + their own announced meld. The score modal shows
  "Renege!". Bots never renege (they gate on `legalMoves`); a "call renege on
  someone else" flow is still future work.
- **Automerge wasm on static hosts:** ensure the host serves `.wasm` with the
  right MIME type; the Vite plugin inlines/handles this but verify on the CDN.
- **Tie at/over 500 "play another hand"** — implemented in `score.ts`; make sure
  the UI handles a game that doesn't end at exactly the 500 crossing.

## 13. Out of scope for v1

Spectators, reconnect to a _finished_ game's history browser, accounts,
matchmaking/lobby list, mobile app packaging, sound effects, calling a renege
on _another_ player (self-renege via Advanced mode is built),
tournament/round‑robin scoring.

Table chat _is_ built: `doc.chat` (a `ChatMessage[]` capped at the most recent
100, appended via the `SendChat` action), rendered by `ChatBox.svelte` — a
fixed bottom-right panel present in both the lobby and the game, with an unread
badge and names tinted by the reader's own side.

## 14. PWA

The app is an installable PWA named **Clabber**:

- `static/manifest.webmanifest` — standalone display, `#0a5c36` theme, linked
  from `src/app.html` along with the iOS `apple-touch-icon` / status-bar meta.
- Icons are an Ace-of-Spades card on green felt. `static/icon.svg` is the
  master; `npm run icons` (`scripts/gen-icons.mjs`, uses `sharp`) rasterises it
  to `static/pwa-{192,512}.png`, `pwa-maskable-{192,512}.png`,
  `apple-touch-icon.png` and `favicon.png`. The card sits inside the maskable
  safe zone. Re-run only when the artwork changes; the PNGs are committed.
- `src/service-worker.ts` — SvelteKit auto-registers it. Precaches the build +
  static files; cache-first for versioned assets, network-first with a cache /
  app-shell fallback for everything else. It ignores cross-origin requests, so
  the sync-server WebSocket is untouched. Live multiplayer still needs the
  network; only the shell works offline.
- `docker/nginx.conf` serves `service-worker.js` / `manifest.webmanifest` with
  `Cache-Control: no-cache` and the icons with a 7-day TTL. Cloudflare Pages
  serves the static output as-is.
