/**
 * PulseBoard server entrypoint.
 *
 * Responsibilities:
 *  - Run the {@link Simulator} on a fixed interval and broadcast each tick.
 *  - Hold the shared collaborative {@link Board} and apply mutations from
 *    any client, rebroadcasting the authoritative state.
 *  - Track presence (connected client count).
 *  - Expose a tiny health/REST surface and, in production, serve the built
 *    Vue client as static files.
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Tick,
} from './protocol.js';
import { Simulator, METRICS } from './simulator.js';
import { Board } from './board.js';

const PORT = Number(process.env.PORT ?? 4000);
const TICK_MS = Number(process.env.TICK_MS ?? 1000);
const ORIGIN = process.env.CLIENT_ORIGIN ?? '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json());

const simulator = new Simulator({ tickMs: TICK_MS });
const board = new Board();

// --- REST surface (handy for probes and non-socket consumers) -------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), tickMs: TICK_MS });
});

app.get('/api/metrics', (_req, res) => {
  res.json({ metrics: METRICS });
});

app.get('/api/board', (_req, res) => {
  res.json(board.snapshot());
});

app.get('/api/history', (_req, res) => {
  res.json(simulator.allHistory());
});

// --- Static hosting of the built Vue client (production) -------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// --- Socket.IO -------------------------------------------------------------

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: ORIGIN },
});

function broadcastPresence(): void {
  io.emit('presence', io.engine.clientsCount);
}

io.on('connection', (socket) => {
  // Send the full snapshot so the client renders immediately.
  socket.emit('hello', {
    metrics: METRICS,
    history: simulator.allHistory(),
    board: board.snapshot(),
    presence: io.engine.clientsCount,
    tickMs: simulator.tickMs,
  });
  broadcastPresence();

  socket.on('board:addWidget', (widget) => {
    io.emit('board:update', board.addWidget(widget));
  });

  socket.on('board:moveWidget', ({ id, x, y }) => {
    io.emit('board:update', board.moveWidget(id, x, y));
  });

  socket.on('board:resizeWidget', ({ id, w, h }) => {
    io.emit('board:update', board.resizeWidget(id, w, h));
  });

  socket.on('board:removeWidget', ({ id }) => {
    io.emit('board:update', board.removeWidget(id));
  });

  socket.on('board:reset', () => {
    io.emit('board:update', board.reset());
  });

  socket.on('disconnect', () => {
    broadcastPresence();
  });
});

// --- Tick loop -------------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  const values = simulator.tick(now);
  const payload: Tick = { t: now, values };
  io.emit('tick', payload);
}, simulator.tickMs);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `PulseBoard server listening on http://localhost:${PORT} (tick ${TICK_MS}ms)`,
  );
});

export { app, io, simulator, board };
