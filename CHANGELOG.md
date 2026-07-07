# Changelog

All notable changes to PulseBoard are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-07-07

A large "make the collaboration real" pass. The board went from a single
in-memory layout with a decorative `rev` counter to genuinely multiplayer,
persisted, named rooms with live cursors and real conflict handling. The
wire protocol grew several events, so this is a major version.

### Added

- **Live multiplayer cursors + per-user identity.** Every connection is
  assigned a friendly handle and color on connect. Other users' cursors are
  rendered live on the grid, and the toolbar shows an avatar stack instead of a
  bare presence count. (`identity.ts`, `PeerCursors.vue`, `cursor:move` /
  `cursor:update` events.)
- **Real optimistic-concurrency conflict handling.** The `rev` counter the UI
  already displayed is now load-bearing: every mutation is stamped with the
  client's known rev, and a stale mutation is rejected with `board:rejected`
  carrying the fresh state so the client resyncs. A toast explains why.
- **Soft locks.** A widget being dragged by one user is dimmed and
  non-interactive for others, with a "{name} is moving this" tag.
- **Named, persistent rooms.** Boards are keyed by a URL slug (`/b/:room` or
  `?room=`) and persisted to per-room JSON under `DATA_DIR`, surviving
  restarts. "Open two tabs" is now "share a link" (copy-link button in the
  toolbar). (`rooms.ts`.)
- **Editable widgets + thresholds.** Change a widget's metric, kind, and title
  after creation, and set a threshold that flips the card into a red alert
  state when breached. (`board:updateWidget`.) The default layout now includes
  the previously-unused `bar` kind.
- **Deterministic scenario presets.** `calm`, `traffic-spike`, `incident`, and
  `deploy-blip` bias the simulator's coupling/spike parameters and are broadcast
  to every client — a scripted "watch the incident propagate" demo moment.
- **History scrubber.** Pause the live feed and scrub backward through recent
  data with a LIVE snap-back button, reusing data the client already holds.
- **Flagship tests.** A real two-client Socket.IO collaboration integration
  test (broadcast, per-room presence, stale-rev rejection, payload validation,
  cursors, scenario), plus unit tests for the room registry + persistence, the
  rate limiter, and payload validation. Test count went from 12 to 45.
- **Coverage.** `npm --workspace server run test:coverage` (c8, ~93% lines),
  wired into CI with an lcov artifact and a coverage badge in the README.
- **Docker.** Multi-stage `Dockerfile` (build all workspaces → slim non-root
  runtime) and a `docker-compose.yml` with a one-command `demo` profile that
  seeds a rich board and boots the `incident` scenario. CI now builds and
  smoke-tests the image.
- **Demo seed mode.** `npm --workspace server run seed -- <room>` writes a
  polished operations layout to `DATA_DIR` so the app comes up populated.
- **REST:** `GET /api/scenarios`; `/api/health` and `/api/board` now report
  room/scenario context.

### Changed

- **BREAKING (protocol):** `HelloPayload` now includes `room`, `self`, `peers`,
  and `scenario`. Board mutation events accept an optional `rev`. New
  server→client events: `board:rejected`, `peers:update`, `cursor:update`,
  `drag:update`, `scenario:update`. New client→server events:
  `board:updateWidget`, `cursor:move`, `drag:set`, `scenario:set`.
- **BREAKING (API):** `GET /api/board` now takes an optional `?room=` query and
  defaults to the `main` room.
- `Board` mutation methods now return a `MutationResult` (`{ ok, state }` or a
  rejection) instead of the raw `BoardState`.
- The server is refactored into a `createPulseServer()` factory (`server.ts`)
  so it can be booted headless in tests; `index.ts` is now a thin lifecycle
  entrypoint.

### Fixed

- The SPA catch-all (`app.get('*')`) no longer shadows `/api` and `/socket.io`
  routes once `client/dist` exists — it now uses a negative-lookahead matcher.
- Graceful shutdown: the tick interval is cleared, pending board writes are
  flushed, and `io`/HTTP servers are closed on `SIGTERM`/`SIGINT`.

### Security

- Per-socket **token-bucket rate limiting** on all mutations (burst 20, refill
  8/s) stops `board:reset`/add floods.
- **Input validation** on every mutation payload (enum kinds/metrics, finite
  numbers, bounded titles) before it can touch board state.
- **`MAX_WIDGETS`** cap (40) per board.
- CORS defaults to **same-origin-only under `NODE_ENV=production`** instead of
  `*`; the JSON body limit is capped at 32 kB.

## [1.0.0] — 2026-07-06

### Added

- Initial release: real-time dashboard with a built-in correlated data
  simulator, drag-to-arrange widgets on a 12-column grid, live Chart.js charts,
  stat cards and gauges, a shared in-memory board, a Vue 3 flagship client and a
  Svelte 5 parity build over one Socket.IO server, and a small REST surface.
  Server-side unit tests for the simulator and board reducer, with CI.

[2.0.0]: https://github.com/xj16/pulseboard/releases/tag/v2.0.0
[1.0.0]: https://github.com/xj16/pulseboard/releases/tag/v1.0.0
