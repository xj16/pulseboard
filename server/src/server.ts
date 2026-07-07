/**
 * PulseBoard server factory.
 *
 * Builds the Express app + Socket.IO server + simulator + room registry and
 * wires every event handler, but does NOT bind a port or start ticking. The
 * thin {@link ./index.ts} entrypoint drives the lifecycle for production; tests
 * call {@link createPulseServer} directly so they can boot on an ephemeral port
 * and tear down cleanly.
 */

import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type { CorsOptions } from 'cors';

import type {
  ClientToServerEvents,
  Peer,
  RejectedPayload,
  ServerToClientEvents,
  SocketData,
  Tick,
} from './protocol.js';
import { Simulator, METRICS, SCENARIOS } from './simulator.js';
import { Rooms, normalizeRoom, DEFAULT_ROOM } from './rooms.js';
import type { Board } from './board.js';
import { makePeer } from './identity.js';
import { TokenBucket } from './rate-limit.js';
import {
  validateAddWidget,
  validateMove,
  validateResize,
  validateId,
  isScenarioId,
  isWidgetKind,
  isMetricId,
  coerceTitle,
  coerceThreshold,
  isFiniteNumber,
} from './validation.js';

export interface PulseServerOptions {
  /** Milliseconds between simulator ticks. Default 1000. */
  tickMs?: number;
  /** Allowed CORS origin. Default '*'. */
  origin?: CorsOptions['origin'];
  /** Directory to persist room boards to. Omit to disable persistence. */
  dataDir?: string;
  /** Initial simulator scenario. Default 'calm'. */
  scenario?: string;
  /** Deterministic PRNG seed for the simulator (tests). */
  seed?: number;
  /**
   * Per-socket rate limit. Default 20 burst / 8 per second — plenty for real
   * drag-and-drop, hostile to a reset/add flood.
   */
  rateLimit?: { capacity: number; ratePerSec: number };
}

export interface PulseServer {
  app: express.Express;
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  simulator: Simulator;
  rooms: Rooms;
  /** Start the tick loop. Returns a stop function. */
  startTicking(): () => void;
  /** Flush persistence and close the io + http servers. */
  close(): Promise<void>;
}

export function createPulseServer(options: PulseServerOptions = {}): PulseServer {
  const tickMs = options.tickMs ?? 1000;
  const origin = options.origin ?? '*';
  const rateCfg = options.rateLimit ?? { capacity: 20, ratePerSec: 8 };

  const app = express();
  app.use(cors({ origin }));
  app.use(express.json({ limit: '32kb' }));

  const simulator = new Simulator({
    tickMs,
    scenario: isScenarioId(options.scenario) ? options.scenario : 'calm',
    seed: options.seed,
  });
  const rooms = new Rooms({ dataDir: options.dataDir });

  // --- REST surface -------------------------------------------------------

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      tickMs,
      rooms: rooms.list().length,
      scenario: simulator.getScenario(),
    });
  });

  app.get('/api/metrics', (_req, res) => {
    res.json({ metrics: METRICS });
  });

  app.get('/api/board', (req, res) => {
    const room = normalizeRoom(req.query.room ?? DEFAULT_ROOM);
    res.json(rooms.get(room).snapshot());
  });

  app.get('/api/history', (_req, res) => {
    res.json(simulator.allHistory());
  });

  app.get('/api/scenarios', (_req, res) => {
    res.json({
      active: simulator.getScenario(),
      available: Object.keys(SCENARIOS),
    });
  });

  // --- Static hosting of the built Vue client (production) ----------------

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientDist = join(__dirname, '..', '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback that never shadows the API or the socket transport. Without
    // this guard the catch-all would swallow unknown /api and /socket.io routes
    // once client/dist exists.
    app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  // --- Socket.IO ----------------------------------------------------------

  const httpServer = createServer(app);
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, { cors: { origin } });

  const presenceOf = (room: string): number =>
    io.sockets.adapter.rooms.get(room)?.size ?? 0;

  const peersOf = (room: string): Peer[] => {
    const ids = io.sockets.adapter.rooms.get(room);
    if (!ids) return [];
    const peers: Peer[] = [];
    for (const sid of ids) {
      const s = io.sockets.sockets.get(sid);
      if (s?.data.peer) peers.push(s.data.peer);
    }
    return peers;
  };

  const announceRoom = (room: string): void => {
    io.to(room).emit('presence', presenceOf(room));
    io.to(room).emit('peers:update', peersOf(room));
  };

  /** Broadcast a mutation result to the room or reject back to the caller. */
  const commit = (
    room: string,
    result: ReturnType<Board['addWidget']>,
    reject: (reason: RejectedPayload['reason'], message: string) => void,
  ): void => {
    if (result.ok) {
      io.to(room).emit('board:update', result.state);
      rooms.touch(room);
    } else if (result.reason === 'stale-rev') {
      reject('stale-rev', 'Someone else changed the board — resynced.');
    } else if (result.reason === 'capacity') {
      reject('capacity', 'This board is full — remove a widget first.');
    }
  };

  io.on('connection', (socket) => {
    const room = normalizeRoom(socket.handshake.query.room);
    const peer = makePeer();
    socket.data.peer = peer;
    socket.data.room = room;
    socket.join(room);

    const limiter = new TokenBucket(rateCfg);
    const board = rooms.get(room);

    socket.emit('hello', {
      room,
      self: peer,
      peers: peersOf(room),
      metrics: METRICS,
      history: simulator.allHistory(),
      board: board.snapshot(),
      presence: presenceOf(room),
      tickMs: simulator.tickMs,
      scenario: simulator.getScenario(),
    });
    announceRoom(room);

    const reject = (
      reason: RejectedPayload['reason'],
      message: string,
    ): void => {
      socket.emit('board:rejected', {
        reason,
        board: rooms.get(room).snapshot(),
        message,
      });
    };

    const allowed = (): boolean => {
      if (limiter.tryRemove()) return true;
      reject('rate-limited', 'You are doing that too fast — slow down.');
      return false;
    };

    socket.on('board:addWidget', (payload) => {
      if (!allowed()) return;
      const parsed = validateAddWidget(payload);
      if (!parsed.ok) return reject('invalid', `Rejected widget: ${parsed.reason}.`);
      const result = rooms.get(room).addWidget(parsed.value, revOf(payload));
      commit(room, result, reject);
    });

    socket.on('board:moveWidget', (payload) => {
      if (!allowed()) return;
      const parsed = validateMove(payload);
      if (!parsed.ok) return reject('invalid', 'Rejected move: bad payload.');
      const result = rooms
        .get(room)
        .moveWidget(parsed.id, parsed.x, parsed.y, revOf(payload));
      commit(room, result, reject);
    });

    socket.on('board:resizeWidget', (payload) => {
      if (!allowed()) return;
      const parsed = validateResize(payload);
      if (!parsed.ok) return reject('invalid', 'Rejected resize: bad payload.');
      const result = rooms
        .get(room)
        .resizeWidget(parsed.id, parsed.w, parsed.h, revOf(payload));
      commit(room, result, reject);
    });

    socket.on('board:updateWidget', (payload) => {
      if (!allowed()) return;
      const id = validateId(payload);
      if (!id) return reject('invalid', 'Rejected update: bad payload.');
      const p = payload as Record<string, unknown>;
      const patch: Parameters<Board['updateWidget']>[1] = {};
      if (p.kind !== undefined) {
        if (!isWidgetKind(p.kind)) return reject('invalid', 'Bad widget kind.');
        patch.kind = p.kind;
      }
      if (p.metric !== undefined) {
        if (!isMetricId(p.metric)) return reject('invalid', 'Bad metric.');
        patch.metric = p.metric;
      }
      if (p.title !== undefined) patch.title = coerceTitle(p.title, id);
      if (p.threshold !== undefined) patch.threshold = coerceThreshold(p.threshold);
      const result = rooms.get(room).updateWidget(id, patch, revOf(payload));
      commit(room, result, reject);
    });

    socket.on('board:removeWidget', (payload) => {
      if (!allowed()) return;
      const id = validateId(payload);
      if (!id) return reject('invalid', 'Rejected remove: bad payload.');
      const result = rooms.get(room).removeWidget(id, revOf(payload));
      commit(room, result, reject);
    });

    socket.on('board:reset', (payload) => {
      if (!allowed()) return;
      const result = rooms.get(room).reset(revOf(payload));
      commit(room, result, reject);
    });

    // --- Live cursors + drag ownership (throttled, best-effort) -----------

    socket.on('cursor:move', (payload) => {
      if (
        payload == null ||
        typeof payload !== 'object' ||
        !isFiniteNumber((payload as { x: unknown }).x) ||
        !isFiniteNumber((payload as { y: unknown }).y)
      ) {
        return;
      }
      const x = clamp01((payload as { x: number }).x);
      const y = clamp01((payload as { y: number }).y);
      socket.to(room).emit('cursor:update', { id: peer.id, x, y });
    });

    socket.on('drag:set', (payload) => {
      const widgetId =
        payload &&
        typeof (payload as { widgetId: unknown }).widgetId === 'string'
          ? (payload as { widgetId: string }).widgetId
          : null;
      socket.to(room).emit('drag:update', { peerId: peer.id, widgetId });
    });

    // --- Scenario switching (server-global) -------------------------------

    socket.on('scenario:set', (payload) => {
      if (!allowed()) return;
      const scenario = (payload as { scenario?: unknown })?.scenario;
      if (!isScenarioId(scenario)) return;
      simulator.setScenario(scenario);
      io.emit('scenario:update', scenario);
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('drag:update', { peerId: peer.id, widgetId: null });
      announceRoom(room);
    });
  });

  // --- Lifecycle ----------------------------------------------------------

  const startTicking = (): (() => void) => {
    const handle = setInterval(() => {
      const now = Date.now();
      const values = simulator.tick(now);
      const payload: Tick = { t: now, values };
      io.emit('tick', payload);
    }, simulator.tickMs);
    return () => clearInterval(handle);
  };

  const close = (): Promise<void> =>
    new Promise((res) => {
      rooms.flush();
      io.close(() => httpServer.close(() => res()));
    });

  return { app, httpServer, io, simulator, rooms, startTicking, close };
}

function revOf(payload: unknown): number | undefined {
  if (payload && typeof payload === 'object') {
    const rev = (payload as { rev?: unknown }).rev;
    if (typeof rev === 'number' && Number.isFinite(rev)) return rev;
  }
  return undefined;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
