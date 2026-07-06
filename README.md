# PulseBoard 📈

**Real-time collaborative analytics dashboard** with drag-to-arrange widgets and
live charts — powered by a **built-in data simulator**, so it runs entirely
locally with **no paid data feed, no API keys, and no cloud dependency**.

Open the app in two browser tabs and watch layout changes sync between them in
real time. Every number you see is synthesized on the server by a small
telemetry simulator, so the dashboard is always alive out of the box.

![PulseBoard is a Vue 3 flagship + Node/Socket.IO server + Svelte parity build](https://img.shields.io/badge/stack-Vue%203%20%C2%B7%20Node%20%C2%B7%20Socket.IO%20%C2%B7%20Svelte-38bdf8)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

---

## Why this exists

Most dashboard demos need a live backend or a paid metrics provider to show
anything moving. PulseBoard removes that friction: a deterministic, bounded
**data simulator** generates six correlated operational metrics (traffic, CPU,
latency, errors, users, revenue) that behave like real telemetry — random walks
with mean reversion, daily seasonality, traffic coupling, and occasional spikes.

It also doubles as a **framework-parity showcase**: the same Socket.IO server
drives a full-featured **Vue 3** flagship app *and* a minimal **Svelte 5** build,
proving the backend is framework-agnostic.

## Features

- **Live streaming charts** — line, area, and bar charts update in place every
  tick (Chart.js), plus stat cards with trend indicators and half-circle gauges.
- **Drag-to-arrange widgets** — move widgets by their header and resize them
  from the corner on a 12-column grid, with pixel-to-cell snapping.
- **Real-time collaboration** — the board layout is shared across all connected
  clients. Add / move / resize / remove a widget and everyone sees it instantly.
  A monotonic `rev` counter and live **presence** count show the shared state.
- **Built-in data simulator** — six correlated metric streams, seedable for
  deterministic runs, with pre-filled history so charts are never empty on load.
- **No paid anything** — 100% local. No external services, no keys.
- **Fully typed** — TypeScript end to end, including the shared wire protocol.
- **Svelte parity build** — the same feed rendered by Svelte 5 under `/svelte`.

## Tech stack

| Layer            | Tech                                                          |
| ---------------- | ------------------------------------------------------------ |
| Flagship client  | **Vue 3** + **Vite** + **TypeScript**, **Pinia**, **Chart.js** |
| Realtime server  | **Node.js** + **Express** + **Socket.IO** + **TypeScript**   |
| Parity client    | **Svelte 5** + **Vite** + **TypeScript**                      |
| Transport        | Socket.IO (WebSocket, polling fallback)                       |
| CI               | **GitHub Actions** (typecheck, test, build all workspaces)   |

The repo is an **npm workspaces** monorepo:

```
pulseboard/
├─ server/    Express + Socket.IO + the data simulator   (@pulseboard/server)
├─ client/    Vue 3 flagship dashboard                    (@pulseboard/client)
├─ svelte/    Minimal Svelte parity build                 (@pulseboard/svelte)
└─ .github/   CI workflow
```

## Architecture

```
                  ┌──────────────────────────────────────┐
                  │            Node server                │
                  │  ┌───────────┐     ┌──────────────┐   │
   tick (1s) ─────┼─▶│ Simulator │     │ Board (state)│   │
                  │  └─────┬─────┘     └──────┬───────┘   │
                  │        │  Socket.IO       │           │
                  └────────┼──────────────────┼───────────┘
                           │ hello / tick     │ board:update
              ┌────────────┴──────┐   ┌───────┴───────────┐
              ▼                   ▼   ▼                   ▼
        Vue client           Vue client            Svelte client
      (Pinia store)         (2nd tab —           (rune-based store,
       drag & drop        layout stays in         read-only view)
                              sync live)
```

- The **server** owns the authoritative state: it runs the simulator on an
  interval, broadcasts each `tick`, and applies every board mutation before
  rebroadcasting the new `board:update` to all clients.
- Clients keep a **rolling buffer** per metric and mutate charts in place for
  cheap, smooth updates.
- The **wire protocol** lives in `server/src/protocol.ts` and is mirrored in
  each client — a single, dependency-free source of truth for every event.

## Getting started

**Prerequisites:** Node.js ≥ 20 and npm.

```bash
# 1. Install every workspace
npm install

# 2. Run the server + Vue flagship together (server :4000, client :5173)
npm run dev
# then open http://localhost:5173  (open it twice to see collaboration)
```

Run the Svelte parity build against the same server:

```bash
npm run dev:server     # in one terminal
npm run dev:svelte     # in another → http://localhost:5174
```

The Vite dev servers proxy `/socket.io` and `/api` to the Node server on
port `4000`, so no CORS or URL config is needed for local development.

### Production build

```bash
npm run build          # builds server, Vue client, and Svelte app
npm start              # serves the built Vue app + API from the Node server
# open http://localhost:4000
```

When `client/dist` exists, the server also hosts the built Vue app statically,
so `npm start` gives you a single self-contained deployment.

## Configuration

All optional — see [`.env.example`](./.env.example):

| Variable         | Default | Purpose                                        |
| ---------------- | ------- | ---------------------------------------------- |
| `PORT`           | `4000`  | Server port                                    |
| `TICK_MS`        | `1000`  | Milliseconds between simulator ticks           |
| `CLIENT_ORIGIN`  | `*`     | Allowed CORS origin for Socket.IO              |
| `VITE_SERVER_URL`| *(none)*| Point a client at a non-same-origin server     |

## REST surface

Besides the socket feed, a small REST API is handy for probes and tooling:

| Endpoint        | Returns                                        |
| --------------- | ---------------------------------------------- |
| `GET /api/health`  | `{ status, uptime, tickMs }`                |
| `GET /api/metrics` | Metric metadata                             |
| `GET /api/board`   | Current shared board layout                 |
| `GET /api/history` | Recent history for every metric             |

## Scripts

| Script                  | Does                                             |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Server + Vue client in parallel                  |
| `npm run dev:svelte`    | Svelte parity build                              |
| `npm run build`         | Build all three workspaces                       |
| `npm start`             | Run the built server (also serves the Vue app)   |
| `npm test`              | Run the server unit tests (simulator + board)    |
| `npm run typecheck`     | Type-check every workspace                        |

## Testing

The server ships unit tests (Node's built-in test runner) covering the
simulator (range bounds, determinism, history capping) and the board reducer
(add / move / resize / remove / reset, grid clamping):

```bash
npm test
```

CI runs typecheck → tests → build for all three workspaces on every push and PR
via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

[MIT](./LICENSE) © 2026 xj16
