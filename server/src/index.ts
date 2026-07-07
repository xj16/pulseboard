/**
 * PulseBoard server entrypoint.
 *
 * Reads configuration from the environment, constructs the server via
 * {@link createPulseServer}, binds the port, starts the tick loop, and shuts
 * down cleanly on SIGTERM/SIGINT (flush persistence, stop ticking, close io).
 *
 * All the interesting wiring lives in {@link ./server.ts} so it can be booted
 * headless in tests without touching a fixed port.
 */

import { resolve } from 'node:path';
import { createPulseServer } from './server.js';

const PORT = Number(process.env.PORT ?? 4000);
const TICK_MS = Number(process.env.TICK_MS ?? 1000);
const NODE_ENV = process.env.NODE_ENV;

// Default to same-origin-only in production; opt into '*' explicitly for dev.
const ORIGIN =
  process.env.CLIENT_ORIGIN ?? (NODE_ENV === 'production' ? false : '*');

// Where per-room board JSON is persisted. Set DATA_DIR='' to disable.
const DATA_DIR =
  process.env.DATA_DIR === ''
    ? undefined
    : resolve(process.env.DATA_DIR ?? '.pulseboard-data');

const server = createPulseServer({
  tickMs: TICK_MS,
  origin: ORIGIN,
  dataDir: DATA_DIR,
  scenario: process.env.SCENARIO,
});

const stopTicking = server.startTicking();

server.httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `PulseBoard server listening on http://localhost:${PORT} ` +
      `(tick ${TICK_MS}ms, scenario ${server.simulator.getScenario()}` +
      `${DATA_DIR ? `, persisting to ${DATA_DIR}` : ', persistence off'})`,
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down gracefully…`);
  stopTicking();
  // Failsafe: never hang forever waiting for lingering sockets.
  const failsafe = setTimeout(() => process.exit(0), 3000);
  failsafe.unref();
  await server.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export const { app, io, simulator, rooms } = server;
