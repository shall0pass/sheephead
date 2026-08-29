# Sheephead — Implementation Plan

A 5‑player online **Sheephead** (Sheepshead) card game. Real humans join with a
secret code; empty seats are played by bots. State is shared between everyone's
browser with an Automerge CRDT, relayed by a self‑hosted sync server. The front
end ships as a static site.

> **Status:** this repository already contains a complete implementation of a
> different Jack–nine game, **Clabber** (4 players, bid trump, fixed
> partnerships, meld). That plan has been retired. This document is the plan to
> **re‑target the same infrastructure to Sheephead**. The networking, sync
> server, card‑art pipeline, host/bot‑runner election, PWA and deploy paths
> carry over almost unchanged; the deck, the rules engine, the bot, the game
> state model and the in‑game panels are rewritten.

The authoritative rules are in `artifacts/game_rules.md` ("Sheepshead Basic
Rules"). Where that text is ambiguous, this plan records the choice made.

---

## 1. Decisions locked in

| Area               | Decision                                                                                                                                   | Consequence                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table size         | **Exactly 5 players.** The lobby's seat‑count control only decides how many of the 5 seats are human vs bot.                               | One 6‑card deal each, a 2‑card blind, 6 tricks. No dealer‑sits‑out, no per‑size branching in the engine.                                                                           |
| Partner mechanic   | **Called ace, hidden.** The picker names a fail ace; whoever holds it is the secret partner.                                               | Teams are 2 (picker + partner) vs 3, and re‑form every hand. There is **no fixed "partner across the table"** — see §3.5.                                                          |
| Variants in v1     | **Going alone** only. Leaster, doubler, "stick the dealer" and blitz/cracking are future work (§12).                                       | The rules doc makes an all‑pass hand a leaster or a doubler; v1 uses a same‑dealer **re‑deal** as a placeholder (`redeal` phase) so none of those scoring paths block v1. See §12. |
| Sync transport     | **Self‑hosted Automerge sync server** (the existing `sync-server/`).                                                                       | Unchanged from the Clabber build. One tiny always‑on relay; no game logic on it.                                                                                                   |
| Hidden information | **Trust‑based** — the whole hand, the blind, the bury and the called partner live in the doc; the UI renders only the local player's view. | Simple and CRDT‑native. A determined player could read another hand — or the partner — out of the raw doc. Documented in‑app (§3.4).                                               |
| Front‑end deploy   | **Static SPA** (`@sveltejs/adapter-static`, SPA mode) + separately deployed sync server.                                                   | Unchanged.                                                                                                                                                                         |

---

## 2. Tech stack

**Already in the repo and reused as‑is:** SvelteKit 2, Svelte 5 (runes),
Tailwind 4, TypeScript, Vitest (browser + node projects), Prettier/ESLint;
`@automerge/automerge` 3.4.1, `@automerge/automerge-repo` 2.5.6 +
`-network-websocket` + `-storage-indexeddb` 2.5.6; `vite-plugin-wasm` 3.6.0;
`@sveltejs/adapter-static` 3.0.10; `canvas-confetti` 1.9.4 (`@types` 1.9.0).

**No new runtime dependencies are expected.** Sheephead needs no bidding UI
library, no search‑based AI, nothing the Clabber build did not already pull in.

**Sync server** (`sync-server/`, its own `package.json`): unchanged — a ~40‑line
`Repo` + `NodeWSServerAdapter` + `NodeFSStorageAdapter` + `ws` relay that also
serves the `code → automerge url` registry from `games.json`. It carries no
Sheephead logic and never needs redeploying when rules change.

---

## 3. Architecture

### 3.1 Networking — unchanged

```
┌────────────┐   wss://   ┌──────────────────┐   wss://   ┌────────────┐
│ Browser A  │◀──────────▶│  Sync server     │◀──────────▶│ Browser B  │
│ Repo+IDB   │            │  Repo + FS store │            │ Repo+IDB   │
└────────────┘            └──────────────────┘            └────────────┘
        ▲                                                        ▲
        └───────────── Browsers C, D, E … ───────────────────────┘
```

Each browser creates one `Repo` (WebSocket adapter, URL from `PUBLIC_SYNC_URL`,
plus IndexedDB storage). The sync server is a dumb relay + durable store.

### 3.2 The secret code ↔ document mapping — unchanged

A same‑origin registry maps `CODE → automerge url`:

```
GET  /games/:CODE         -> 200 { code, url, createdAt } | 404
PUT  /games/:CODE { url }  -> 201 created | 200 already yours | 409 taken
```

- **Create game:** `repo.create()` a fresh doc, then `PUT /games/:CODE` with a
  generated 5‑char code (alphabet without `0 O 1 I L`); regenerate on 409.
- **Join game:** a pasted `automerge:` url is used directly; otherwise
  `GET /games/:CODE`, `repo.find(url)` on 200, "no game with that code" on 404.

Who serves `/games/:CODE`: Vite `server.proxy` locally, nginx in Docker,
`functions/games/[code].js` + a `GAMES` KV namespace on Cloudflare Pages. See
`docs/deploy-cloudflare.md`. None of the three carry game logic.

### 3.3 Who runs the bots — host election — unchanged mechanism

Bots must be driven by exactly one client.

- The game doc has `hostActorId`. On load, if it is empty or its owner has not
  sent a presence heartbeat within the staleness window (~12 s), the client
  with the lexicographically smallest active `actorId` claims host via a
  `HostClaim` action (Automerge LWW settles a concurrent claim).
- The host runs a **reconciler**: on every doc change, if the position is owed a
  move by a bot seat — a pick/pass, a bury, a partner call, or a card — it
  computes the move with `nextBotAction(doc)` and applies it after a humanising
  delay (450–1150 ms; longer between hands).
- **Idempotency:** every action re‑checks its precondition against live doc
  state (right phase, right seat, card still in hand) inside `handle.change`, so
  a brief double‑claim cannot double‑play. `GameStore.tryChange` swallows the
  `RuleError` when a human and the host race the same move.
- The host also runs a **presence reconciler**: a seated human offline past a
  grace window is `CoverSeat`'d to the bot AI mid‑hand (or `LeaveSeat`'d in the
  lobby); control returns to them when they reconnect.

### 3.4 Trust model / limitations (documented in‑app)

- Full hands, the blind, the buried cards **and the resolved partner seat** live
  in the doc. The UI shows only what the local player is entitled to see. A
  small "friendly game — don't peek at the raw data" note sits near the join
  box.
- The hidden partner is a slightly more tempting target than a Clabber hand was;
  the note calls this out explicitly. Per‑seat encryption (keys derived from the
  code) is designed around but out of scope for v1 (§12).
- No server‑side rules enforcement. Every client validates its own actions
  through the shared rules engine; the host validates bot actions. Malicious
  clients are out of scope.

### 3.5 Deviation from `CLAUDE.md`

`CLAUDE.md` says "The person across (at the top) is the users partner." That is
true for Clabber's fixed partnerships but **not for Sheephead**: the picker's
partner is chosen per hand by the called ace and is secret until revealed, and
the other three players form the opposing team. The table therefore:

- seats the local player at the bottom and the other four around the ring, with
  no seat permanently marked "partner";
- reveals and highlights the partner **only once it is public knowledge** — when
  the called ace is played, or the called suit is led and the ace must appear
  (or immediately, to the picker and partner themselves, in their own views).

This point should be reflected back into `CLAUDE.md` when the plan is accepted.

---

## 4. Game state model (Automerge document)

One document per game. All fields are plain JSON. Cards are strings
`"<rank><suit>"` with rank ∈ `A T K Q J 9 8 7` and suit ∈ `S H D C` — e.g.
`"QC" "JD" "AD" "TH" "7S"`.

```ts
type Seat = 0 | 1 | 2 | 3 | 4; // 0 = local player (bottom), then clockwise
type Suit = 'S' | 'H' | 'D' | 'C';

interface PlayerSlot {
	seat: Seat;
	name: string; // editable, pencil icon
	isBot: boolean;
	botName?: string; // "Rainbow Goose", "Michael Jordan", …
	connected: boolean; // derived from presence heartbeats
	actorId?: string;
	lastSeen: number; // epoch ms heartbeat
}

type Phase =
	| 'lobby'
	| 'dealing'
	| 'picking' // eldest-hand → dealer each choose Pick or Pass
	| 'bury' // picker has the blind, discards 2 face down
	| 'callPartner' // picker names a called ace / under / declares alone
	| 'redeal' // everyone passed → same dealer re-deals
	| 'trick' // normal trick play
	| 'handScored' // between hands, show the breakdown
	| 'gameOver';

interface GameDoc {
	version: 1;
	code: string;
	createdAt: number;
	hostActorId: string;

	players: PlayerSlot[]; // length 5, one per seat

	phase: Phase;
	dealer: Seat;
	rngSeed: string; // host sets per deal; deterministic shuffle for replay/tests

	handNumber: number; // 1-based
	handsToPlay: number; // game ends after this many scored hands (default 4)

	hands: Record<Seat, string[]>; // full hands (trust-based); 6 each, 8 for the picker mid-bury
	blind: string[]; // the 2 down cards; emptied into the picker's hand on Pick

	picking: {
		turn: Seat; // whose choice we're waiting on
		passed: Seat[]; // who has already passed this deal
	} | null;

	picker: Seat | null;
	buried: string[]; // the picker's 2 discards; count for the picker's team at hand end
	call:
		| { kind: 'ace'; suit: Suit } // normal called ace
		| { kind: 'under'; suit: Suit; card: string } // "in the hole": a face-down card stands in for the called suit
		| { kind: 'alone' } // going alone, no partner
		| null;
	partnerSeat: Seat | null; // resolved from the called ace; stored but UI-gated (§3.5)
	partnerRevealed: boolean; // has the partner become public knowledge this hand

	trick: {
		number: number; // 1..6
		leader: Seat;
		turn: Seat;
		plays: { seat: Seat; card: string }[];
	} | null;

	tricksWon: Record<Seat, string[][]>; // cards collected per seat; team totals derived from picker/partner
	lastTrickWinner: Seat | null;

	score: {
		tally: Record<Seat, number>; // cumulative game points; always sums to 0
		hands: HandResult[]; // history for the scoreboard
	};

	// derived at gameOver: seats with tally > 0 "win" (fireworks), tally < 0 "lose" (tears)
	winners: Seat[] | null;

	log: LogEntry[]; // human-readable event feed (append-only)
	chat: ChatMessage[]; // capped at the most recent 100
}

interface HandResult {
	handNumber: number;
	dealer: Seat;
	picker: Seat | null;
	partnerSeat: Seat | null; // null when alone or a re-deal
	alone: boolean;
	pickerPoints: number; // card points (0..120), buried cards included
	oppPoints: number; // 120 - pickerPoints
	outcome:
		| 'redeal'
		| 'pickerWin'
		| 'pickerWinSchneider'
		| 'pickerWinNoTrick'
		| 'pickerLoss'
		| 'pickerLossSchneider'
		| 'pickerLossNoTrick';
	awarded: Record<Seat, number>; // this hand's game points, sums to 0
}
```

Presence (heartbeats) uses `automerge-repo` ephemeral messages, as in the
Clabber build — not doc history.

---

## 5. Rules engine — `src/lib/sheephead/` (pure; no Svelte, no Automerge)

Fully unit‑tested pure functions. This is the heart of correctness. The Clabber
tree at `src/lib/clabber/` is renamed and rewritten module‑by‑module;
`meld.ts` / `meld.spec.ts` are **deleted** (Sheephead has no meld).

| Module        | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards.ts`    | 32‑card deck (`A T K Q J 9 8 7` × `S H D C`). **Trump = every Queen, every Jack, and every Diamond** (14 cards), ordered `QC QS QH QD JC JS JH JD AD TD KD 9D 8D 7D` high→low. **Fail suits** are `S H C` only, each ordered `A T K 9 8 7`. Point values: `A`=11, `T`=10, `K`=4, `Q`=3, `J`=2, `9/8/7`=0 → **120 points total**. No last‑trick bonus. `suitOf(card)` returns `'trump'` for any Q/J/♦.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rng.ts`      | Unchanged — seeded xmur3 → mulberry32.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `deal.ts`     | Seeded shuffle, deal 6 to each seat as 3‑then‑3 clockwise from the dealer's left, 2 cards to `blind` after the first round of 3. The physical cut (rules doc: "the person to the right of the dealer should cut") is cosmetic and omitted for a seeded digital shuffle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `picking.ts`  | `legalPickActions(doc, seat)` → `['pick','pass']`. Order: eldest hand (`dealer + 1`, i.e. the dealer's left) around to the dealer. `applyPick` moves `blind` into the picker's hand (now 8) → `phase='bury'`. All five pass → `phase='redeal'` (same dealer). Lives behind `reducer.ts` like the Clabber `legal*` functions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bury.ts`     | `legalBury(doc)` → the picker's 8 cards. `applyBury(doc, [c1,c2])` requires two distinct cards the picker holds; moves them to `buried`; `phase='callPartner'`. The buried pair counts for the picker's team at hand end (the rules doc is silent, but this is universal Sheepshead) and matters for the "no‑tricker" edge case in §5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `partner.ts`  | `legalCalls(doc)` — the fail aces the picker may call: an ace of a fail suit the picker will **still hold a non‑ace card of after burying** (that card is then bound — see `play.ts`) and whose ace the picker has **not seen** (not in the final hand and not in the blind he picked up / buried — the rules doc: "as long as the Ace was not in his hand or his blind"). Edge cases from the rules doc: picker's only remaining fail cards are aces → **under** (`{kind:'under'}`, a chosen face‑down card stands in for the called suit, callable ace = any fail ace not seen); picker holds all three fail aces → a fail **ten** (not the ace) may be called instead, same rules; picker has no fail at all → call a suit "as an under" with a face‑down **trump**. Only the winner of that trick may look at an `under` card, and it never wins the trick. `resolvePartner(doc)` → the seat holding the called ace/ten (known internally from the deal; `partnerRevealed` stays false until it is played or forced). `alone` sets `partnerSeat=null` and the picker plays 1‑v‑4. `phase` → `trick`. |
| `play.ts`     | Trick 1 is led by the eldest hand (`dealer + 1`), **not** the picker. `legalMoves(doc, seat)`: **follow the led suit** (trump counts as one suit — a led Queen/Jack/Diamond means "trump was led"); if void in the led suit, **any card is legal** (Sheephead has _no_ forced trump‑in and _no_ overtrump obligation, unlike Clabber). Called‑ace constraints (both lift on the last trick): the **partner** must play the called ace on the first lead of its suit and may **not** slough it on any other trick; the **picker** must keep at least one fail card of the called suit and may not play it except when that suit is led; an `under` card is played face‑down when the called suit is led, is seen only by the trick winner, and never wins the trick. `applyPlay`, `resolveTrick` (highest trump, else highest card of the led fail suit — no last‑trick bonus), winner leads next.                                                                                                                                                                                                        |
| `score.ts`    | End‑of‑hand: `pickerPoints` = card points in the picker's + partner's tricks **plus the buried cards**; `oppPoints = 120 - pickerPoints`. Classify in this order: picker team won **all 6 tricks** → `pickerWinNoTrick`; picker team won **0 tricks** → `pickerLossNoTrick` (note the picker can still hold up to ~22 buried points, so the "no‑trick" cases are decided by trick count, not points); else `pickerPoints ≥ 90` → `pickerWinSchneider` (opp ≤ 30); `≥ 61` → `pickerWin`; `≤ 30` → `pickerLossSchneider`; `31–60` → `pickerLoss`. Award game points from the table in §6, **zero‑sum assert**, append `HandResult`, add to `score.tally`. `checkGameEnd(doc)` → `true` once `handNumber === handsToPlay`; then `winners = seats with tally > 0`.                                                                                                                                                                                                                                                                                                                                           |
| `state.ts`    | Seat helpers, `pickerTeam(doc)` / `oppTeam(doc)` derived from `picker` + `partnerSeat`, `createGame({ code })` with 5 seats and `handsToPlay: 4`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `actions.ts`  | Action union: `JoinSeat`, `LeaveSeat`, `RenameSeat`, `SetBot`, `CoverSeat`, `StartHand`, `Pick`, `Pass`, `Bury`, `CallPartner` (payload is a called suit, an `under` `{suit, card}`, or `alone`), `PlayCard`, `ResetToLobby`, `HostClaim`, `SendChat`. **Dropped from Clabber:** `Bid`, `AnnounceMeld`, `ShowMeld`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reducer.ts`  | `reduce(doc, action)` — the single mut(in‑place) entry point every client calls inside `handle.change(...)`. Validates against `phase`/`turn`, throws `RuleError`. `StartHand` covers both the first deal and "next hand" (advances the dealer **clockwise**, `dealer + 1`, from `handScored` — rules doc: "the person to the left of the dealer becomes the dealer in the next round"; keeps the same dealer from `redeal`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `bot.ts`      | Pure `nextBotAction`‑fed heuristics — see §6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `simulate.ts` | `playRandomGame(seed)` — five bots play a full game; used by the fuzz test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `host.ts`     | Pure `pickHost(onlineIds)` and `nextBotAction(doc)` — the one move owed for the current position (pick/pass, bury, call, or card), or `null` on a human's turn / lobby / game over. Auto‑`StartHand`s out of `redeal` and `handScored`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Renege handling stays **light**: `legalMoves` simply never offers an illegal
card, so honest clients and bots cannot renege. "Calling a renege on another
player" is out of scope for v1 (§12).

---

## 6. Bot AI — `src/lib/sheephead/bot.ts`

Pure, heuristic, no search.

- **Pick / pass:** score the hand for playing as picker — count trump, weight
  the Queens heavily (`QC`/`QS` especially), count fail aces and the chance to
  void a fail suit after burying. Pick with roughly 3+ trump including at least
  one Queen or `JD`, or a very strong 2‑trump hand with two off aces. Later
  seats pick a little lighter; the dealer picks lightest (nobody left).
- **Bury:** keep all trump and the highest fail cards; bury the two lowest fail
  cards, preferring to **void a whole fail suit** (so those tricks can be
  trumped) and to bury points only when it also voids a suit. Never bury a card
  of a suit that leaves no legal called ace.
- **Call partner:** call the ace of the fail suit the bot is _shortest_ in while
  still holding a small card of it (so the ace comes home late and the bot keeps
  control). Fall through to the rules‑doc edge cases (`under`, fail ten). Go
  **alone** only with a near‑solid trump hand (both black Queens + ~4 more
  trump).
- **Trick play:** restrict to `legalMoves`, then, knowing whether this seat is
  picker / (secret) partner / opposition:
  - picker or partner **schmears** — dumps aces/tens onto a trick the team is
    already winning; leads trump to pull the opponents' trump; takes with the
    cheapest winning trump otherwise.
  - opposition tries to **set** the picker — leads fail the picker is likely
    void in so the partner (unknown) must spend a card, saves trump to beat the
    picker's aces, and schmears to a partner who is winning.
  - when the bot cannot win the trick, it sloughs its lowest‑value card.
- Humanising delay is applied by the host reconciler, not the bot.

Funny bot names live in `src/lib/sheephead/botNames.ts` (Rainbow Goose, Michael
Jordan, Sir Reginald Featherbottom, …), assigned uniquely as seats are
bot‑filled. `pickBotNames(n, taken)` is reused unchanged.

### Scoring table (`score.ts`)

Straight game‑point scoring (no "double on the bump" — see the note below and
§12). Every row sums to zero. Schneider is decided by card points (losing side
≤ 30 ⟺ winning side ≥ 90); the "no‑tricker" rows are decided by **trick count**
(one side won all 6), because the picker keeps the buried cards regardless.

**Picker has a partner (2 vs 3):**

| Outcome                            | Picker | Partner | Each opponent (×3) |
| ---------------------------------- | -----: | ------: | -----------------: |
| Win, picker 61–89                  |     +2 |      +1 |                 −1 |
| Win + schneider, picker ≥ 90       |     +4 |      +2 |                 −2 |
| Win + no‑tricker, picker won all 6 |     +6 |      +3 |                 −3 |
| Loss, picker 31–60                 |     −2 |      −1 |                 +1 |
| Loss + schneidered, picker ≤ 30    |     −4 |      −2 |                 +2 |
| Loss + no‑tricker, opp won all 6   |     −9 |     _0_ |                 +3 |

**Picker alone (1 vs 4):** picker gets ±4 / ±8 / ±12 for
win / schneider / no‑tricker (sign negative when the picker fails), and each of
the four opponents gets the opposite ∓1 / ∓2 / ∓3. The rules doc does not give
an "alone" table — this is the standard zero‑sum convention (the same per‑player
amounts as a partner game, with no partner to share them).

> **"Double on the bump".** `artifacts/game_rules.md` calls this "more common
> and accepted at almost all tournaments" — when the picking team _loses_, its
> penalty doubles (picker −4 / partner −2 on a plain loss, −8 / −4 on a
> schneider). v1 ships the plain numbers above for simplicity; a
> `doc.doubleOnTheBump` lobby toggle is the single most likely first addition
> after v1.

---

## 7. Card art pipeline — unchanged mechanism, 32 faces

`artifacts/PlayingCards.svg` is a 13×4 grid, cell 64×89, columns
`A 2 3 4 5 6 7 8 9 10 J Q K`, rows `Clubs, Hearts, Spades, Diamonds`. It is
copied whole to `static/cards/faces.svg` and drawn as a CSS background sprite;
`static/cards/back.svg` is the hand‑drawn back.

- `src/lib/cards/sprite.ts` — sheet paths, grid, `CARD_RATIO`,
  `facePosition(card)`. Already generic over rank/suit; **no change needed** for
  the different card set.
- `src/lib/components/Card.svelte` — `card` / `faceDown` / `height` / `class`.
  No change.
- `src/routes/dev/+page.svelte` — the dev gallery is updated to show the **32
  Sheephead cards** (add `7 8`, drop nothing) plus the back, grouped
  trump‑first. Gated behind `$app/environment`'s `dev`.

---

## 8. UI / components — `src/lib/components/`

SPA: `src/routes/+layout.ts` keeps `ssr = false`. Single route
`src/routes/+page.svelte` switches on `phase`: no game → `JoinScreen`;
`lobby` → `Lobby`; otherwise → `Table`.

### 8.1 Join screen (`JoinScreen.svelte`) — unchanged

Big centred code input + "Join"; "Start a new game" creates the doc and shows
the generated code with a copy button; small trust‑model note (updated wording
per §3.4).

### 8.2 Lobby / seating (`Lobby.svelte`, `Seat.svelte`)

- Round green table with **5 seats**; local player rotated to the bottom.
- Empty seat → "Sit here". Occupied → name + human/bot badge + online dot +
  pencil rename (your own seat only).
- **Seat‑count control** (default 5): choose how many of the 5 seats are human;
  the rest are "Fill with computers". Auto‑fills on "Deal" if seats are open.
- No team pickers — teams are per‑hand in Sheephead.
- "Deal" enabled once all 5 seats are filled and ≥ 1 is human.

### 8.3 Table (`Table.svelte`, `PlayerPlate.svelte`, `CardFan.svelte`)

- Round felt table, local player at the bottom, the other four around the ring.
  Seat→screen‑position map rotates the fixed doc seats so "me" is at the bottom.
- Each other seat: face‑down `CardFan`, name plate, card count, dealer chip
  **D**, amber turn glow, "thinking…" while a bot on turn is delayed, "passed"
  marker during picking.
- **Picker badge** on the picker's plate once known; **partner highlight** only
  after `partnerRevealed` (or always, in the picker's and partner's own views).
- Centre: `TrickArea.svelte` — up to 5 played cards laid toward each seat, the
  trump symbol (♦ + Q/J), trick N / 6, running card points for the picker's
  side, and the called‑card badge (e.g. "called: A♥").
- Local hand: `MyHand.svelte`, `sortHand`ed trump‑first (Queens, Jacks,
  Diamonds) then fail by rank. Cards are `<button>`s; only `legalMoves` cards
  are enabled and lift on hover, and only while it is your turn — **one card at
  a time**. Illegal cards dim. Focus jumps to the first legal card when your
  turn starts.

### 8.4 Picking / bury / call panels (replace `BiddingPanel` / `MeldPanel`)

- `PickPanel.svelte` — on your turn during `picking`, "Pick up the blind" /
  "Pass", plus a live around‑the‑table indicator; otherwise "waiting for …".
- `BuryPanel.svelte` — shown to the picker in `bury`: your 8 cards, select
  exactly 2 to bury, "Bury" commits. A running "you'll bury N points" hint.
- `CallPartnerPanel.svelte` — shown to the picker in `callPartner`: one button
  per `legalCalls` entry ("Call A♥"), an "under" flow when required, and a
  "Go alone" button. Other players see "picker is choosing a partner…".
- `MeldPanel.svelte` is **deleted**.

### 8.5 Scoreboard (`Scoreboard.svelte`)

- Persistent compact strip: each player's cumulative `tally` and
  `hand N / handsToPlay`; the current picker (and partner once revealed).
- `phase === 'handScored'` → modal with the full `HandResult`: picker/partner,
  card points each side, schneider / no‑tricker flags, game points awarded per
  seat, and a "Next hand" button (the host also auto‑advances after ~5 s).

### 8.6 End of game (`GameOver.svelte`, `Fireworks.svelte`, `Tears.svelte`)

- On `gameOver`, `winners` = seats with `tally > 0`.
- `Fireworks.svelte` — full‑screen `canvas-confetti` volley then gentle bursts —
  plays for a viewer whose seat is in `winners` (and for spectators).
- `Tears.svelte` — falling SVG teardrops — plays for a viewer with `tally < 0`;
  the table also desaturates for that viewer only.
- Both honour `prefers-reduced-motion` (static 🎆 / 😢).
- Card text: "You finished up +N 🎉" / "You finished down N" / spectator
  summary. **Play again** → `ResetToLobby` (keeps seats, names, code; zeroes the
  tally and hand counter).

> **Game length & "winning team" (decided).** A game is **4 hands** — the
> stakeholder's call — so `handsToPlay` defaults to 4. After the fourth scored
> hand the seats with a positive cumulative tally win (fireworks); a negative
> tally loses (tears). With 5 seats and 4 deals the dealer button reaches only
> seats 0–3, which is accepted.

### 8.7 Shared state glue — `src/lib/repo/` — unchanged shape

- `repo.ts` — singleton `Repo` (WS + IndexedDB).
- `directory.ts` — `makeCode` / `normaliseCode` / `resolveCode` / `claimCode`.
- `gameStore.svelte.ts` — runes wrapper around a `DocHandle`: `doc` `$state`,
  `change(action)` / `tryChange(action)`, derived `mySeat`, `legalMoves`,
  `myTurn`, and new derived `amPicker` / `amPartner` / `partnerVisible`.
- `presence.svelte.ts` — heartbeats + `bye` on unload.
- `host.ts` — election + bot reconciler + presence (absent‑player) reconciler.

The Automerge‑repo `optimizeDeps` pre‑bundling already set up for the Clabber
build is unchanged.

---

## 9. Directory / file structure (target)

```
sync-server/                 # unchanged deployable relay + code registry
src/lib/
  sheephead/                 # PURE rules engine + bot (fully unit tested)
    cards.ts rng.ts deal.ts picking.ts bury.ts partner.ts play.ts
    score.ts state.ts actions.ts reducer.ts bot.ts botNames.ts
    host.ts simulate.ts types.ts
    *.spec.ts
  cards/                     # sprite.ts, display.ts  (unchanged)
  repo/                      # repo.ts directory.ts gameStore.svelte.ts
                             # presence.svelte.ts host.ts   (unchanged shape)
  components/
    Card.svelte CardFan.svelte Table.svelte PlayerPlate.svelte TrickArea.svelte
    JoinScreen.svelte Lobby.svelte Seat.svelte MyHand.svelte
    PickPanel.svelte BuryPanel.svelte CallPartnerPanel.svelte
    Scoreboard.svelte GameOver.svelte Fireworks.svelte Tears.svelte
    LogFeed.svelte ChatBox.svelte LeaveButton.svelte
src/routes/
  +layout.ts (ssr=false)  +layout.svelte  +page.svelte (phase switch)  dev/
docs/
  implementation-plan.md   # this file
  deploy-cloudflare.md     # unchanged
```

Deleted vs the Clabber tree: `src/lib/clabber/` (renamed), `meld.ts` +
`meld.spec.ts`, `bidding.*` (→ `picking.ts` + `bury.ts` + `partner.ts`),
`src/lib/components/MeldPanel.svelte` (+ its spec), `BiddingPanel.svelte`
(→ `PickPanel` + friends).

---

## 10. Implementation phases

Each phase ends green: `npm run lint`, `npm run check`, `npm test`,
`npm run build`.

**Status — all phases complete (branch `sheephead-rework`).** Commits:
A `292edc8`, B–E `52e8ba5`, F `bb1d137`, G `2dd8b0d`, H `7ef1193`, I (this commit).
Every commit passed `lint` / `check` / `test` / `build`; the suite is at 107
tests (20 files).

**As built:** Phase A shipped on its own; Phases B–E landed as one
"rules engine" commit (the Clabber modules shared `types.ts` / `cards.ts` too
tightly to split further while keeping tests green), with the in‑game UI
reduced to a placeholder in the interim. Phases F, G, H and I then shipped
separately.

**Only open item:** a manual smoke test on four real devices (operator, needs
physical hardware). The full‑game `Table` flow has an automated chromium
integration test (`Table.svelte.spec.ts`), and both deploy paths
(`docker compose up --build` and `wrangler pages dev`) were run for real and
round‑trip the app, the SPA fallback and the `/games/:code` registry — see
Phase I.

### Phase A — Rename & re‑brand — ✅ done (`292edc8`)

- [x] `git mv src/lib/clabber src/lib/sheephead`; update every import path and
      the `src/lib/sheephead/index.ts` barrel.
- [x] `package.json` `"name": "clabber"` → `"sheephead"`; sync‑server package
      name likewise.
- [x] Env var `CLABBER_SYNC_URL` → `SHEEPHEAD_SYNC_URL` in `docker-compose.yml`
      / docs (`PUBLIC_SYNC_URL` itself is unchanged).
- [x] PWA: `static/manifest.webmanifest` `name`/`short_name` → "Sheephead";
      `src/app.html` title; keep the green theme. Artwork can stay for now
      (Ace‑of‑Spades on felt is still on‑theme) — regenerate icons only if the
      stakeholder wants new art.
- [x] `window.__clabber` dev handle → `window.__sheephead`.
- [x] `docs/deploy-cloudflare.md`, `README.md`, `CLAUDE.md` wording sweep
      (and fold in §3.5).
- [x] Green gate with the still‑Clabber logic compiling under the new names.

### Phase B — Deck & deal — ✅ done (in `52e8ba5`)

- [x] `cards.ts` — 32‑card deck, trump = Q/J/♦ (14), fail suits `S H C` only,
      the trump/fail orderings and point values from §5, `suitOf`, no
      last‑trick bonus. Rewrite `cards.spec.ts` (120 points total; trump order;
      `QC` is trump not a club; `AD`/`TD` are trump; fail order `A T K 9 8 7`).
- [x] `deal.ts` — 6 each as 3+3, 2‑card `blind`. `deal.spec.ts`: 5×6 + 2 = 32,
      no duplicates, deterministic per seed.
- [x] Update the `/dev` gallery to 32 cards.

### Phase C — Picking, bury, call‑partner — ✅ done (in `52e8ba5`)

- [x] `picking.ts` — `legalPickActions`, eldest→dealer order, `applyPick`
      (blind into hand, `phase='bury'`), all‑pass → `redeal`.
- [x] `bury.ts` — `legalBury`, `applyBury` (2 distinct held cards → `buried`,
      `phase='callPartner'`).
- [x] `partner.ts` — `legalCalls` incl. the three rules‑doc edge cases,
      `resolvePartner`, `alone`; `phase='trick'` on completion.
- [x] `actions.ts` / `reducer.ts` — new action union; `StartHand` covers first
      deal + next hand + re‑deal.
- [x] Tests: pick/pass ordering, blind pickup, all‑pass re‑deal keeps the
      dealer, bury validation, buried points attributed to the picker's team,
      legal‑call enumeration (normal; only‑aces → under; all‑three‑aces → ten;
      no‑fail → trump under), partner resolves to the ace holder, alone leaves
      `partnerSeat` null.

### Phase D — Trick play — ✅ done (in `52e8ba5`)

- [x] `play.ts` — trick 1 led by `dealer + 1`; `legalMoves` (follow led suit;
      trump is one suit; free when void; **no** forced trump‑in, **no**
      overtrump); called‑ace constraints (partner must play the called ace on
      the first lead of its suit and can't slough it elsewhere; picker keeps a
      called‑suit fail card and only plays it when that suit is led; both
      bindings lift on trick 6; `under` card played face‑down, seen only by the
      trick winner, never contests); `applyPlay`, `resolveTrick` (highest trump
      else highest of led fail, no last‑trick bonus), winner leads next, 6
      tricks.
- [x] Tests: trick‑1 leader is the dealer's left, not the picker; follow‑suit;
      trump‑led forces trump if able; void → any card; Queen/Jack are trump
      regardless of pip suit; trick winner with and without trump; called ace
      forced on suit lead and rejected as an off‑suit discard; picker can't dump
      the called fail card early; both bindings free on the last trick; `under`
      card doesn't win the trick.

### Phase E — Scoring & game end — ✅ done (in `52e8ba5`)

- [x] `score.ts` — `pickerPoints` (tricks + buried), the §5 classification order
      (all‑6 / zero‑tricks first, then points ≥ 90 / ≥ 61 / ≤ 30 / 31–60), the
      §6 award table, zero‑sum assert, `HandResult`, `score.tally`,
      `checkGameEnd` after `handsToPlay`, `winners` = positive tallies.
- [x] Tests, one named per rules‑doc scoring clause: 61 win (2/1/−1), schneider
      at picker ≥ 90 / opp ≤ 30 (4/2/−2), no‑tricker = picker won all 6 (6/3/−3),
      picker loss 31–60 (−2/−1/+1), picker schneidered ≤ 30 (−4/−2/+2),
      opponents won all 6 (−9/0/+3), and the alone column (±4/±8/±12 vs
      ∓1/∓2/∓3). Boundary tests at picker = 30, 31, 60, 61, 89, 90. A
      zero‑trick picker who buried a King still scores it as `oppPoints = 116`,
      not 120. Every row sums to 0.
- [x] `simulate.ts` + `simulate.spec.ts` — fuzz ~40 full 5‑bot games: each
      terminates at `gameOver` after `handsToPlay`, every hand conserves 120
      card points, no illegal move is ever produced, `tally` always sums to 0,
      results are deterministic per seed.
- [x] `automerge-compat.spec.ts` — `reduce` runs inside `Automerge.change()`
      and two peers converge through a full hand.

### Phase F — Host & bots — ✅ done (`bb1d137`)

- [x] `bot.ts` — `choosePick` / `chooseBury` / `chooseCall` / `chooseCard`
      per §6.
- [x] `sheephead/host.ts` — `pickHost` unchanged; `nextBotAction` extended to
      emit pick/pass, bury, call and card moves, and to auto‑`StartHand` from
      `redeal` / `handScored`.
- [x] `repo/host.ts` — no structural change; verify the humanising delays and
      the presence/absent‑player reconciler still hold with 5 seats and the new
      phases.
- [x] Tests: `host.spec.ts` (`pickHost`, `HostClaim`, `nextBotAction` per phase,
      five bots driving a full game to `gameOver`); `host.svelte.spec.ts`
      (chromium — claims the role, drives bots off the lobby, stands down for a
      live foreign host, takes over a stale host mid‑hand and finishes).

### Phase G — Table & play UI — ✅ done (`2dd8b0d`)

- [x] `Table.svelte` rebuilt for 5 seats; `PlayerPlate` gains picker badge +
      gated partner highlight; `CardFan` unchanged.
- [x] `TrickArea.svelte` — 5 plays, trump badge, called‑card badge, no meld.
- [x] `MyHand.svelte` — 6 (or 8 mid‑bury) cards, trump‑first sort, legal gating,
      one‑card‑at‑a‑time, focus management.
- [x] New `PickPanel.svelte` / `BuryPanel.svelte` / `CallPartnerPanel.svelte`;
      delete `BiddingPanel.svelte` + `MeldPanel.svelte` (+ specs).
- [x] `Scoreboard.svelte` — per‑seat tally, hand counter, `handScored` modal
      with the new breakdown.
- [x] `+page.svelte` phase switch updated; `?fast` dev flag keeps shrinking bot
      delays.
- [x] Tests: `sortHand` (trump‑first for the Sheephead trump set, in
      `cards.spec.ts`), `MyHand.svelte` legal gating + bury toggle,
      `Scoreboard` strip + breakdown modal, `GameOver` win/loss/spectator.
- [x] **Done in Phase I:** a full‑game chromium test drives one human + four
      host bots through the real UI (pick → bury → call → trick play → hand
      scoring → next hand → game over) — `Table.svelte.spec.ts`.

### Phase H — Win ∕ lose & polish — ✅ done (`7ef1193`)

- [x] `GameOver.svelte` — fireworks for `tally > 0` / spectators, tears +
      desaturation for `tally < 0`; "Play again" → `ResetToLobby` (zero the
      tally + hand counter, keep seats/names/code).
- [x] `prefers-reduced-motion` fallbacks (carried over).
- [x] Responsive table re‑checked at 390 px with 5 seats (no horizontal
      overflow); `uiScale` clamp retuned if needed.
- [x] a11y: `aria-live` announcements reworded for "your turn to pick / bury /
      call / play", the hand result, and the game result.
- [x] `LogFeed.svelte` wording for the new events (picked, buried 2, called
      A♥, went alone, took the trick, set!).
- [x] `ChatBox.svelte` restored (its name‑tint no longer keys off fixed
      teams, which Sheephead doesn't have).
- [x] Deploy docs / `docker-compose.yml` env‑var wiring confirmed by
      inspection (`PUBLIC_SYNC_URL` unchanged, `CLABBER_SYNC_URL` →
      `SHEEPHEAD_SYNC_URL`).
- [x] **Done in Phase I:** `docker compose up --build` and
      `wrangler pages dev` both run for real — the app, the SPA fallback and
      the `/games/:code` registry round‑trip on both.

### Phase I — E2E & deploy verification — ✅ done

- [x] Full‑game integration test through the real `Table` UI:
      `Table.svelte.spec.ts` (chromium) seats one "human" (seat 0) and clicks
      the rendered controls — Pick, bury two cards + Bury, **Go alone**, then
      one legal hand card per trick — while the `Host` drives the other four
      seats. Runs a full game (`handsToPlay` deals) to `gameOver`, asserting
      the scored‑hand count, a zero‑sum tally, and the "Play again" button.
      (A `vitest-browser-svelte` test, not a standalone `@playwright/test`
      project — the repo has no dev‑server E2E harness and adding one buys
      little here.)
- [x] **`docker compose up --build`** run for real: both images build, both
      containers come up healthy, the web container serves the SPA shell and
      the SPA fallback (`/deep/route` → `200`), and `/games/:code` proxied to
      the sync container round‑trips (`PUT` → `201`, `GET` → `200`, duplicate
      `PUT` → `409`). `scripts/smoke-sync.mjs` against `ws://localhost:3030`
      converges a doc between two independent repos through the relay.
- [x] **`wrangler pages dev build --kv GAMES`** run for real: serves the SPA,
      deep routes fall back to `index.html`, and the `functions/games/[code].js`
      Function against the local `GAMES` KV round‑trips (`404` / `201` / `200` /
      `409`). One harmless warning about the `_redirects` SPA rule — noted in
      `docs/deploy-cloudflare.md`.
- [ ] Manual 4‑real‑device smoke test — for the operator (physical hardware).

---

## 11. Testing strategy

- **Unit (node project):** the whole `src/lib/sheephead/` tree. Target: every
  rule in `artifacts/game_rules.md` has a named test. Deterministic via
  `rngSeed`.
- **Property / simulation:** thousands of full 5‑bot games asserting the
  invariants in Phase E.
- **Component (browser project):** `Card`, `PickPanel` legal‑button set,
  `BuryPanel` selection, `CallPartnerPanel` legal calls, `Scoreboard`
  breakdown, seat‑rotation math, `MyHand` legal gating.
- **Integration:** two in‑process `Repo`s on an in‑memory network play a
  scripted hand; assert both docs converge and match an expected `HandResult`.
- **Manual multi‑device checklist** in `docs/` for each release.

---

## 12. Risks & open questions

Every *rules* question below has been checked against two outside sources — the
Pagat 5‑player Sheepshead page (`pagat.com/schafkopf/shep.html`) and the
Wikipedia "Sheepshead (card game)" article (its text is reproduced in
`artifacts/game_rules.md`). Those are marked **resolved**; what's left in §12.2
is project/infrastructure risk, not a rules gap.

### 12.1 Rules questions — resolved against the sources

- **Trump order, fail order, point values — resolved.** Both sources agree, so
  the missing `rank2` / `fail` / `points2` scrape images are fully recovered:
  trump high→low `Q♣ Q♠ Q♥ Q♦ J♣ J♠ J♥ J♦ A♦ T♦ K♦ 9♦ 8♦ 7♦` (14 cards); each
  fail suit `A T K 9 8 7`; `A`=11 `T`=10 `K`=4 `Q`=3 `J`=2, `9/8/7`=0; 120
  total; **no last‑trick bonus** in the 5‑hand game (the last‑trick counter is a
  4‑player 24‑card "Sheep Head" thing only). §5 stands as written.

- **All‑pass resolution — resolved; pick one for v1.1.** The real options when
  nobody picks are **leaster** (no picker/partner, *fewest* card points wins,
  the blind goes to the last‑trick winner), **doubler** (redeal; the *next*
  scored hand pays double), and **forced pick / "stick the dealer"** (the last
  seat must pick). Rarer cousins (mittler, schneidster, moster, schwanzer) all
  hang off the same "no picker" branch. v1's same‑dealer `redeal` placeholder is
  a neutral stand‑in for any of them, and its two guards are enough — the dealer
  bot must _pick_ when last undecided (else five passing bots redeal forever),
  and `redeal` must not advance `handNumber` (both specified). **Forced pick is
  the cheapest first upgrade** (no new scoring path).

- **Called‑ace edge cases — resolved.** All three `partner.ts` branches are
  confirmed by the sources:
  - picker's only remaining fail cards are aces → **"unknown" / under**: lay one
    card face down and call any *unseen* fail ace; the face‑down card is shown
    only to the trick winner and **cannot win the trick**, though its points
    still count at hand end.
  - picker holds **all three** fail aces → call a fail **ten** instead; the
    picker must then hold that suit's **ace** back and play it when the suit is
    led, and — unlike the "unknown" — the called **ten can win its trick**.
  - picker has **no fail at all** → call a suit with a face‑down **trump** as the
    under (same reveal / cannot‑win rule as the "unknown").
  - the partner must play the called ace on the **first lead of that suit even
    while holding other cards of it**; the picker must keep one fail card of the
    called suit and may play it only when that suit is led; both bindings lift on
    trick 6. Keep the explicit unit tests and the log‑feed note so a confused
    player can see what happened.

- **Buried cards vs. the no‑tricker rule — one real source conflict, decided.**
  Wikipedia says the bury counts for the picker "**if the picker's side takes at
  least one trick**"; `artifacts/game_rules.md` is silent and ordinary table
  play just always counts it. §5 always counts the bury, including for a
  zero‑trick picker (the "King in the bury → `oppPoints = 116`" test). This
  changes **no game‑point outcome** — a no‑tricker is scored by trick count with
  a fixed −9 / 0 / +3 award — only the card‑point breakdown and the "120
  conserved" invariant. **v1 keeps the always‑count rule** (simpler,
  self‑consistent) and shows it in the hand result. Revisit only if a house rule
  wants the Wikipedia reading.

- **Schneider / no‑tricker thresholds — resolved.** A side is *schneidered* at
  **≤ 30 card points**, so the picker schneiders the opponents at picker ≥ 90
  and is schneidered at picker ≤ 30; **60–60 is a picker loss** (the picker
  needs 61). §5's classification order and boundaries (30/31, 60/61, 89/90) are
  right. The Wikipedia *table* prints the top tier as "91–120", but its own note
  ("opponents are required to get only 30") resolves that to the 90 boundary v1
  uses.

- **Scoring table — resolved.** §6 (`+2/+1/−1` · `+4/+2/−2` · `+6/+3/−3` ·
  `−2/−1/+1` · `−4/−2/+2` · `−9/0/+3`, plus the alone column `±4/±8/±12` vs
  `∓1/∓2/∓3`) matches `artifacts/game_rules.md` clause‑for‑clause, and the alone
  column matches Wikipedia's table exactly. Wikipedia's *partner* table differs
  in two spots and both are house‑rule forks, not corrections: it penalises the
  partner on a no‑tricker loss (`−6/−3/+3` rather than `−9/0/+3`), and its two
  loss rows already fold in "double on the bump". v1 ships the `game_rules.md`
  numbers; `doc.doubleOnTheBump` stays the first planned toggle (§6, §13).

### 12.2 Project / infrastructure risks — still live

- **Game length / "winning team" — decided, and not a rules question.** Real
  Sheepshead is played for money over an open‑ended session, so there is no
  canonical hand count to look up. `handsToPlay = 4` is the stakeholder's call;
  after the fourth scored hand a positive cumulative tally wins (fireworks),
  negative loses (tears). See §8.6.
- **Trust model.** Full hands _and the resolved partner seat_ are readable in
  the raw Automerge doc. Per‑seat encryption keyed off the game code is designed
  around, not built. Unchanged risk.
- **"No ace, no face, no trump, no count" redeal.** A second, unrelated redeal
  trigger exists in the rules — a player may demand a redeal on a hand with no
  ace, no face card, no trump and no counter. v1 omits it; the `redeal` phase is
  wired only for the all‑pass case. Cheap to add later behind the same phase.
- **Host election races** on flaky networks — mitigated by idempotent,
  precondition‑guarded actions; covered by a chromium test carried over from the
  Clabber build.
- **Automerge wasm on static hosts** — ensure `.wasm` is served as
  `application/wasm`; verify on the CDN.
- **Bot strength.** The pick/bury/call heuristics are untuned; a weak picker bot
  makes for dull games, so expect a tuning pass after the first full‑game
  simulations.

## 13. Out of scope for v1

Grouped so a later pick is easy. Nothing here blocks the core 5‑player
called‑ace game; each item is a clean addition on top of it.

### 13.1 "No picker" rule variants

- **Leaster** — no picker/partner, fewest card points wins, blind to the
  last‑trick winner (house‑variable: some give it to a dealer‑chosen trick, some
  set it aside; some require a trick to win). Needs a `leaster` phase and its own
  scoring path.
- **Doubler** — redeal with the next scored hand at 2× stakes; needs a
  `stakeMultiplier` on the doc and every award multiplied through.
- **Forced pick / "stick the dealer"** — last seat must pick; the smallest
  change (no new scoring) and the most likely first addition.
- **Schiller** — the *first* seat after the dealer is forced to pick;
  traditionally one Schiller hand is played to end a session.
- **Mittler / schneidster / moster / schwanzer (show‑down)** — exotic no‑picker
  scorings (median score wins / closest to 30 / most‑points pays / reveal hands
  and the highest picks pays the table); not planned.
- **The pot** — one game point is seeded into a pot on a leaster (or every
  hand, in cash play); the picking team takes it on a win and pays in on a loss.
  Ties in with money play (§13.5) and would need a `pot` field on the doc.

### 13.2 Partner & stake variants

- **Jack‑of‑Diamonds partner** — auto‑partner, no called ace, plus its
  "picker holds the J♦ → go alone / call up a jack" sub‑rules, and the newer
  "hold the J♦, still call a fail ace" hybrid.
- **Call an ace you actually hold** and be your own secret partner.
- **"Double on the bump"** — doubled penalty when the picking team loses;
  planned as the `doc.doubleOnTheBump` lobby toggle (§6).
- **"Picker must take a trick"** — a trickless picking team loses a fixed large
  amount (e.g. picker −18 / partner 0 / opponents +6) regardless of card points;
  a stricter cousin of the §6 no‑tricker row.
- **Cracking** — an opponent knocks to double the stakes, with
  **re‑crack / crack‑back** (partner or picker, ×4), **castrating** (a third
  player, ×8), and **crack‑around‑the‑corner** (partner re‑cracks and outs
  themselves). Each has its own timing window (in the aces game, after the ace
  is named, before the first card) and a house cap on the multiplier.
- **Blitzing** — a player reveals a matched pair to double the stakes: both
  black queens (standard), both black jacks, the two middle jacks, or all four
  jacks, depending on house rule.
- **Calling "sheepshead"** — a contract to take every trick (double a
  no‑tricker on success, pay double on any miss); almost always played alone.
- **Spitz** (7♦ promoted to 2nd — or 1st — in the trump order) and
  **clubs‑are‑trump** regional orderings; also per‑group reshuffles of the
  queen/jack strengths.

### 13.3 Table sizes & seating

- **2 / 3 / 4 / 6 / 7 / 8‑player** tables — each has its own deck size, blind
  size and deal (e.g. 3‑hand = 10 cards + a 2‑card blind; 4‑hand "Sheep Head" =
  24 cards, jacks over queens, hearts trump, a last‑trick counter). v1 is
  exactly 5.
- **6th player sits out the deal** (the classic 5‑active‑of‑6 arrangement).
- **Spectator seats** beyond passively watching a game you are not seated in —
  a spectator list, spectator chat, join‑the‑next‑hand queueing.
- **Mid‑game seat changes** — swapping seats, a human taking over a bot seat, or
  a sixth player buying in, once a hand is already running.

### 13.4 Enforcement & fair play

- **Calling a renege** on another player — v1 simply never offers an illegal
  card, so honest clients cannot renege; there is no accusation / forfeit flow.
- **Server‑side rules enforcement** and defence against a client editing the raw
  doc (see the trust model, §3.4 / §12.2).
- **Per‑seat encryption** of hands, bury and the partner seat.
- **"No ace, no face, no trump, no count"** redeal on request (§12.2).
- **The physical cut** by the player to the dealer's right — cosmetic under a
  seeded shuffle; omitted (§5), not surfaced in the UI.
- **Table talk / collusion detection** — out of scope; a friendly‑game
  assumption like the trust model.
- **Turn clock / auto‑pass** for a slow but still‑connected human — v1 only
  covers the *disconnected* case via the presence reconciler (§3.3).
- **Take‑backs / undo** of a played or buried card — there are none; a play is
  committed the moment it lands in the doc.

### 13.5 Product surface

- Accounts, profiles, matchmaking, a public lobby / game list.
- Tournament, round‑robin or across‑session scoring ("play to N points") — v1 is
  a fixed `handsToPlay` then fireworks / tears.
- **Money play** — game points as a currency unit with a running per‑player
  ledger, settle‑up screen and the pot mechanics (§13.1).
- Native mobile app packaging (the PWA install is kept).
- Sound effects / music.
- In‑game statistics, hand‑history export, replays.
- Localisation / i18n; the UI ships English‑only.
- Table cosmetics — felt colours, card‑back choices, avatars, emote reactions
  beyond text chat.
- Configurable game rules UI beyond the seat count — every variant above would
  need lobby toggles and a saved house‑rules profile.

Table chat **is** kept: `doc.chat` (a `ChatMessage[]` capped at 100, appended
via `SendChat`), rendered by `ChatBox.svelte` in both the lobby and the game.

## 14. PWA

The app stays an installable PWA, renamed **Sheephead**:

- `static/manifest.webmanifest` — standalone display, `#0a5c36` theme, linked
  from `src/app.html` with the iOS `apple-touch-icon` / status‑bar meta.
- Icons: `static/icon.svg` master + `npm run icons`
  (`scripts/gen-icons.mjs`, `sharp`) → the `pwa-*` / `apple-touch-icon` /
  `favicon` PNGs. Re‑run only if the artwork changes; the current felt‑card art
  stays unless the stakeholder asks for new art.
- `src/service-worker.ts` — SvelteKit auto‑registers it; precache the build +
  static files, cache‑first for versioned assets, network‑first with an
  app‑shell fallback otherwise, cross‑origin (the sync WebSocket) untouched.
  Live multiplayer still needs the network; only the shell works offline.
