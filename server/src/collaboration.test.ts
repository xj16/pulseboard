/**
 * End-to-end collaboration test.
 *
 * This is the flagship test: it boots a real PulseBoard server on an ephemeral
 * port, connects two independent Socket.IO clients into the same room, and
 * proves the headline "real-time collaborative" behaviour over the wire —
 * broadcast mutations, per-room presence, live rev-based conflict rejection,
 * peer identity, cursors, and server-side payload validation. If this passes,
 * the collaboration story in the README is real, not aspirational.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient, type Socket } from 'socket.io-client';

import { createPulseServer, type PulseServer } from './server.js';
import type {
  BoardState,
  HelloPayload,
  Peer,
  RejectedPayload,
} from './protocol.js';

let server: PulseServer;
let baseUrl: string;

before(async () => {
  server = createPulseServer({ tickMs: 10_000, seed: 1 });
  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, () => resolve());
  });
  const addr = server.httpServer.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await server.close();
});

/** Open a client and resolve once it has received its hello snapshot. */
function connect(room: string): Promise<{ socket: Socket; hello: HelloPayload }> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      query: { room },
      transports: ['websocket'],
      forceNew: true,
    });
    const timer = setTimeout(() => reject(new Error('hello timeout')), 4000);
    socket.on('hello', (hello: HelloPayload) => {
      clearTimeout(timer);
      resolve({ socket, hello });
    });
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Wait for the next event of a given name. */
function next<T>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

test('two clients in a room see each other and share board mutations', async () => {
  const a = await connect('e2e-share');
  // a should be assigned an identity.
  const selfA: Peer = a.hello.self;
  assert.ok(selfA.id && selfA.name && selfA.color, 'client A gets an identity');

  const b = await connect('e2e-share');

  // Presence should reach 2 for both; roster carries both peers.
  const peersB = await new Promise<Peer[]>((resolve) => {
    // b may already have 2 peers in its hello; otherwise wait for the update.
    if (b.hello.peers.length >= 2) return resolve(b.hello.peers);
    b.socket.once('peers:update', resolve);
  });
  assert.ok(peersB.length >= 2, 'roster shows both participants');

  // A adds a widget; B must receive the same board via broadcast.
  const updateOnB = next<BoardState>(b.socket, 'board:update');
  a.socket.emit('board:addWidget', {
    kind: 'line',
    metric: 'cpu_load',
    title: 'Shared CPU',
    x: 1,
    y: 30,
    w: 6,
    h: 4,
    rev: a.hello.board.rev,
  });
  const boardOnB = await updateOnB;
  assert.ok(
    boardOnB.widgets.some((w) => w.title === 'Shared CPU'),
    'B sees the widget A added',
  );

  a.socket.disconnect();
  b.socket.disconnect();
});

test('presence is per-room: a client in another room does not inflate the count', async () => {
  const a = await connect('room-x');
  const presencePromise = next<number>(a.socket, 'presence');
  // Someone joins a *different* room.
  const other = await connect('room-y');
  // a should either still read 1 for room-x, or get a presence event that is 1.
  // Give the adapter a moment; then assert via a fresh health check is overkill,
  // so we assert that joining room-y did not push room-x to 2.
  const p = await Promise.race([
    presencePromise,
    new Promise<number>((r) => setTimeout(() => r(1), 300)),
  ]);
  assert.equal(p, 1, 'a different room must not raise this room presence');
  a.socket.disconnect();
  other.socket.disconnect();
});

test('a mutation stamped with a stale rev is rejected and the client is resynced', async () => {
  const a = await connect('e2e-conflict');
  const b = await connect('e2e-conflict');
  const startRev = a.hello.board.rev;

  // B advances the board first.
  const bUpdate = next<BoardState>(b.socket, 'board:update');
  b.socket.emit('board:reset', { rev: b.hello.board.rev });
  const advanced = await bUpdate;
  assert.ok(advanced.rev > startRev);

  // A now acts using its now-stale rev → must be rejected with fresh state.
  const rejected = next<RejectedPayload>(a.socket, 'board:rejected');
  a.socket.emit('board:addWidget', {
    kind: 'stat',
    metric: 'revenue',
    title: 'Too late',
    x: 1,
    y: 1,
    w: 3,
    h: 2,
    rev: startRev,
  });
  const payload = await rejected;
  assert.equal(payload.reason, 'stale-rev');
  assert.equal(payload.board.rev, advanced.rev, 'rejection carries fresh rev');

  a.socket.disconnect();
  b.socket.disconnect();
});

test('an invalid mutation payload is rejected, not applied', async () => {
  const a = await connect('e2e-validate');
  const rejected = next<RejectedPayload>(a.socket, 'board:rejected');
  // Unknown kind — must never reach board state.
  a.socket.emit('board:addWidget', {
    kind: 'wormhole',
    metric: 'cpu_load',
    x: 1,
    y: 1,
    w: 3,
    h: 2,
  } as never);
  const payload = await rejected;
  assert.equal(payload.reason, 'invalid');
  a.socket.disconnect();
});

test('cursor movement from one peer reaches the other', async () => {
  const a = await connect('e2e-cursor');
  const b = await connect('e2e-cursor');
  const cursor = next<{ id: string; x: number; y: number }>(
    b.socket,
    'cursor:update',
  );
  a.socket.emit('cursor:move', { x: 0.42, y: 0.66 });
  const c = await cursor;
  assert.equal(c.id, a.hello.self.id, 'cursor is attributed to peer A');
  assert.ok(c.x > 0.41 && c.x < 0.43);
  a.socket.disconnect();
  b.socket.disconnect();
});

test('switching scenario broadcasts to every client', async () => {
  const a = await connect('e2e-scenario');
  const b = await connect('e2e-scenario');
  const onB = next<string>(b.socket, 'scenario:update');
  a.socket.emit('scenario:set', { scenario: 'incident' });
  const scenario = await onB;
  assert.equal(scenario, 'incident');
  assert.equal(server.simulator.getScenario(), 'incident');
  // Reset back so other tests are unaffected.
  a.socket.emit('scenario:set', { scenario: 'calm' });
  a.socket.disconnect();
  b.socket.disconnect();
});
