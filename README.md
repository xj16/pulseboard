<div align="center">

# PulseBoard 📈

### A real-time, multiplayer analytics dashboard that runs on nothing but Node.

Drag-to-arrange widgets and live streaming charts, shared across everyone in a
room — live cursors, per-user identity, real conflict handling — all fed by a
**built-in telemetry simulator**, so there's **no paid data feed, no API keys,
and no cloud dependency**. Open a link in two tabs and watch the board move.

[![CI](https://github.com/xj16/pulseboard/actions/workflows/ci.yml/badge.svg)](https://github.com/xj16/pulseboard/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-93%25-brightgreen)](#testing)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
![Stack](https://img.shields.io/badge/stack-Vue%203%20%C2%B7%20Node%20%C2%B7%20Socket.IO%20%C2%B7%20Svelte-38bdf8)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)

</div>

---

## Why this exists

Most dashboard demos need a live backend or a paid metrics provider to show
anything moving. PulseBoard removes that friction: a deterministic, bounded
**data simulator** generates six correlated operational metrics (traffic, CPU,
latency, errors, users, revenue) that behave like real telemetry — random walks
with mean reversion, daily seasonality, traffic coupling, and occasional spikes.

Then it makes that data **collaborative for real**. Not "we share one global
object" — named rooms you reach by link, live cursors with per-user identity,
soft locks on the widget someone else is dragging, and optimistic-concurrency
conflict handling so two people editing at once never silently clobber each
other. It also doubles as a **framework-parity showcase**: the same Socket.IO
server drives a full **Vue 3** flagship *and* a minimal **Svelte 5** build.

## Features

- **Live multiplayer, visibly.** Every viewer gets a name + color on connect.
  You see other people's **cursors** move across the grid, an **avatar stack**
  of who's here, and a **soft lock** ring on any widget someone else is dragging.
- **Real conflict handling.** Every mutation carries the client's board `rev`;
  a stale one is **rejected** with the fresh state and the client resyncs (with
  a toast that says why). The `rev` counter is load-bearing, not decorative.
- **Named, shareable rooms.** `/?room=team-alpha` (or `/b/team-alpha`) is its own
  board. Boards **persist to disk** and survive restarts. One click copies a
  shareable link.
- **Live streaming charts** — line, area, and bar charts update in place every
  tick (Chart.js), plus stat cards with trend indicators and half-circle gauges.
- **Editable widgets + threshold alerts** — change a widget's metric, kind, and
  title after creation, and set a threshold that flips the card **red** when
  breached.
- **Scenario presets** — `calm` · `traffic-spike` · `incident` · `deploy-blip`
  bias the simulator and broadcast to everyone, for a scripted "watch the
  incident propagate across every metric" moment.
- **History scrubber** — pause the live feed and scrub backward through recent
  data, then snap back to **LIVE**.
- **Hardened** — per-socket rate limiting, full payload validation, a widget
  cap, graceful shutdown, and same-origin CORS in production.
- **Drag-to-arrange** on a 12-column grid with pixel-to-cell snapping.
- **No paid anything** — 100% local. **Fully typed** end to end, including the
  shared wire protocol. **Svelte parity build** under `/svelte`.

## Tech stack

| Layer            | Tech                                                          |
| ---------------- | ------------------------------------------------------------ |
| Flagship client  | **Vue 3** + **Vite** + **TypeScript**, **Pinia**, **Chart.js** |
| Realtime server  | **Node.js** + **Express** + **Socket.IO** + **TypeScript**   |
| Parity client    | **Svelte 5** + **Vite** + **TypeScript**                      |
| Persistence      | Per-room JSON files (zero external DB)                        |
| Transport        | Socket.IO (WebSocket, polling fallback)                       |
| Tests            | Node test runner + **c8** coverage (unit + socket E2E)       |
| Delivery         | Multi-stage **Docker** image + Compose (one-command demo)    |
| CI               | **GitHub Actions** — typecheck, coverage, build, Docker smoke |

The repo is an **npm workspaces** monorepo:

```
pulseboard/
├─ server/    Express + Socket.IO + simulator + rooms   (@pulseboard/server)
├─ client/    Vue 3 flagship dashboard                   (@pulseboard/client)
├─ svelte/    Minimal Svelte parity build                (@pulseboard/svelte)
├─ Dockerfile · docker-compose.yml                       (one-command run)
└─ .github/   CI workflow
```

## Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │                 Node server                  │
                     │  ┌───────────┐   ┌────────────────────────┐  │
      tick (1s) ─────┼─▶│ Simulator │   │ Rooms  (slug → Board)  │  │
                     │  │ +scenario │   │  optimistic rev checks │  │
                     │  └─────┬─────┘   │  rate-limit · validate │  │
                     │        │         │  persist → JSON files  │  │
                     │        │  Socket.IO adapter (per-room)    │  │
                     └────────┼──────────────────┬───────────────┘  │
                              │ hello / tick      │ board:update
                              │ cursor / drag     │ board:rejected
                 ┌────────────┴───────┐   ┌───────┴────────────┐
                 ▼                    ▼   ▼                    ▼
           Vue client            Vue client             Svelte client
         (Pinia store)          (2nd tab, same          (rune store,
        drag · cursors ·         room — layout &         read-only view
        edit · scrub             cursors sync live)      of the same feed)
```

- The **server** owns authoritative state per room, applies every mutation
  with a rev check + rate limit + validation, then rebroadcasts `board:update`
  to that room (or `board:rejected` to the offending client).
- The **simulator** runs one global correlated world; scenarios bias it live.
- Clients keep a **rolling buffer** per metric and mutate charts in place for
  cheap, smooth updates. Cursors and drag state are relayed peer-to-peer
  through the server, throttled client-side.
- The **wire protocol** lives in `server/src/protocol.ts` and is mirrored in
  each client — a single, dependency-free source of truth for every event.

## Quickstart

**Prerequisites:** Node.js ≥ 22 and npm.

```bash
git clone https://github.com/xj16/pulseboard && cd pulseboard
npm install

# Server (:4000) + Vue flagship (:5173) together:
npm run dev
# open http://localhost:5173  — then open it again to see collaboration,
# or share http://localhost:5173/?room=demo to put people on the same board.
```

Run the Svelte parity build against the same server:

```bash
npm run dev:server     # in one terminal
npm run dev:svelte     # in another → http://localhost:5174
```

### One-command run with Docker

No Node required on the host:

```bash
docker compose up                 # http://localhost:4000
# or, come up already populated in the "incident" scenario:
docker compose --profile demo up
```

Or with plain Docker:

```bash
docker build -t pulseboard .
docker run -p 4000:4000 -v pulseboard-data:/data pulseboard
```

### Production build (no Docker)

```bash
npm run build          # builds server, Vue client, and Svelte app
npm start              # serves the built Vue app + API from Node → :4000
```

When `client/dist` exists the server hosts the built Vue app statically, so
`npm start` is a single self-contained deployment. The SPA fallback is scoped
so it never shadows `/api` or `/socket.io`.

## Configuration

All optional — see [`.env.example`](./.env.example):

| Variable         | Default            | Purpose                                        |
| ---------------- | ------------------ | ---------------------------------------------- |
| `PORT`           | `4000`             | Server port                                    |
| `TICK_MS`        | `1000`             | Milliseconds between simulator ticks           |
| `CLIENT_ORIGIN`  | `*` (dev) / same-origin (prod) | Allowed CORS origin                |
| `SCENARIO`       | `calm`             | Initial simulator scenario                     |
| `DATA_DIR`       | `.pulseboard-data` | Where room boards persist (`""` = in-memory)   |
| `NODE_ENV`       | *(unset)*          | `production` locks CORS + serves the client    |
| `VITE_SERVER_URL`| *(none)*           | Point a client at a non-same-origin server     |

## REST surface

Besides the socket feed, a small REST API is handy for probes and tooling:

| Endpoint             | Returns                                            |
| -------------------- | -------------------------------------------------- |
| `GET /api/health`    | `{ status, uptime, tickMs, rooms, scenario }`      |
| `GET /api/metrics`   | Metric metadata                                    |
| `GET /api/board`     | Board layout for `?room=` (default `main`)         |
| `GET /api/history`   | Recent history for every metric                    |
| `GET /api/scenarios` | Active + available simulator scenarios             |

## Testing

The server ships a real test suite (Node's built-in runner), covering:

- the **simulator** — range bounds, determinism, history capping, scenario bias;
- the **board reducer** — add / move / resize / update / remove / reset, grid
  clamping, the `MAX_WIDGETS` cap, and **rev-based conflict rejection**;
- the **room registry** — slug normalization, isolation, JSON persistence +
  reload, corrupt-file tolerance;
- the **rate limiter** and **payload validation** in isolation; and
- a flagship **two-client Socket.IO collaboration E2E** that boots a real server
  and asserts broadcast, per-room presence, stale-rev rejection, invalid-payload
  rejection, live cursors, and scenario broadcast over the wire.

```bash
npm test                                   # 45 tests
npm --workspace server run test:coverage   # + c8 coverage (~93% lines)
```

CI runs typecheck → coverage → build for all three workspaces, then builds and
smoke-tests the Docker image, on every push and PR
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Seeding a demo board

```bash
DATA_DIR=.pulseboard-data npm --workspace server run seed -- demo
DATA_DIR=.pulseboard-data SCENARIO=incident npm start
# open http://localhost:4000/?room=demo
```

The Docker `demo` profile does exactly this for you.

## Scripts

| Script                              | Does                                          |
| ----------------------------------- | --------------------------------------------- |
| `npm run dev`                       | Server + Vue client in parallel               |
| `npm run dev:svelte`                | Svelte parity build                           |
| `npm run build`                     | Build all three workspaces                    |
| `npm start`                         | Run the built server (also serves the Vue app)|
| `npm test`                          | Run the server test suite                     |
| `npm --workspace server run test:coverage` | Tests + c8 coverage                    |
| `npm --workspace server run seed`   | Seed a demo board into `DATA_DIR`             |
| `npm run typecheck`                 | Type-check every workspace                     |

## License

[MIT](./LICENSE) © 2026 xj16
