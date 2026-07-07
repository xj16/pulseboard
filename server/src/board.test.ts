import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Board, GRID_COLUMNS, MAX_WIDGETS } from './board.js';

/** Helper: assert a mutation succeeded and return the fresh state. */
function ok(result: ReturnType<Board['addWidget']>) {
  assert.equal(result.ok, true, 'mutation should have succeeded');
  if (!result.ok) throw new Error('unreachable');
  return result.state;
}

test('starts with a non-empty default layout at rev 1', () => {
  const board = new Board();
  const snap = board.snapshot();
  assert.ok(snap.widgets.length > 0);
  assert.equal(snap.rev, 1);
});

test('addWidget appends and bumps rev', () => {
  const board = new Board();
  const before = board.snapshot();
  const after = ok(
    board.addWidget({
      kind: 'line',
      metric: 'cpu_load',
      title: 'CPU',
      x: 1,
      y: 20,
      w: 4,
      h: 3,
    }),
  );
  assert.equal(after.widgets.length, before.widgets.length + 1);
  assert.equal(after.rev, before.rev + 1);
  assert.ok(after.widgets.at(-1)!.id.length > 0);
});

test('addWidget clamps oversized spans into the grid', () => {
  const board = new Board();
  const after = ok(
    board.addWidget({
      kind: 'bar',
      metric: 'revenue',
      title: 'Rev',
      x: 50,
      y: 1,
      w: 99,
      h: 2,
    }),
  );
  const w = after.widgets.at(-1)!;
  assert.ok(w.w <= GRID_COLUMNS);
  assert.ok(w.x >= 1 && w.x + w.w - 1 <= GRID_COLUMNS);
});

test('moveWidget updates coordinates', () => {
  const board = new Board();
  const id = board.snapshot().widgets[0].id;
  const after = ok(board.moveWidget(id, 5, 9));
  const moved = after.widgets.find((w) => w.id === id)!;
  assert.equal(moved.y, 9);
  assert.ok(moved.x >= 1);
});

test('updateWidget edits presentation in place without moving the widget', () => {
  const board = new Board();
  const w0 = board.snapshot().widgets[0];
  const after = ok(
    board.updateWidget(w0.id, {
      kind: 'gauge',
      metric: 'latency_ms',
      title: 'Latency gauge',
      threshold: { value: 400, dir: 'above' },
    }),
  );
  const edited = after.widgets.find((w) => w.id === w0.id)!;
  assert.equal(edited.kind, 'gauge');
  assert.equal(edited.metric, 'latency_ms');
  assert.equal(edited.title, 'Latency gauge');
  assert.deepEqual(edited.threshold, { value: 400, dir: 'above' });
  // Geometry is untouched by an update.
  assert.equal(edited.x, w0.x);
  assert.equal(edited.y, w0.y);
  assert.equal(edited.w, w0.w);
  assert.equal(edited.h, w0.h);
});

test('removeWidget deletes by id and is a no-op for unknown ids', () => {
  const board = new Board();
  const id = board.snapshot().widgets[0].id;
  const removed = ok(board.removeWidget(id));
  assert.ok(!removed.widgets.some((w) => w.id === id));

  const revBefore = removed.rev;
  const again = ok(board.removeWidget('does-not-exist'));
  assert.equal(again.rev, revBefore, 'rev must not change on no-op');
});

test('reset restores a fresh default layout', () => {
  const board = new Board();
  board.removeWidget(board.snapshot().widgets[0].id);
  const reset = ok(board.reset());
  assert.ok(reset.widgets.length > 0);
  assert.ok(reset.rev > 1);
});

// --- Optimistic concurrency (the rev counter is load-bearing) --------------

test('a mutation stamped with a stale rev is rejected with the fresh state', () => {
  const board = new Board();
  const staleRev = board.snapshot().rev;
  // Someone else moves first, advancing the rev.
  ok(board.moveWidget(board.snapshot().widgets[0].id, 2, 2));

  const result = board.addWidget(
    { kind: 'stat', metric: 'cpu_load', title: 'X', x: 1, y: 1, w: 3, h: 2 },
    staleRev,
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('unreachable');
  assert.equal(result.reason, 'stale-rev');
  // The rejection carries the current authoritative board to rebase against.
  assert.equal(result.state.rev, board.snapshot().rev);
});

test('a mutation with a matching rev is accepted', () => {
  const board = new Board();
  const rev = board.snapshot().rev;
  const result = board.moveWidget(board.snapshot().widgets[0].id, 3, 3, rev);
  assert.equal(result.ok, true);
});

test('omitting the rev opts out of concurrency checks (trusted callers)', () => {
  const board = new Board();
  ok(board.moveWidget(board.snapshot().widgets[0].id, 2, 2));
  // No rev supplied → always applied.
  const result = board.moveWidget(board.snapshot().widgets[0].id, 4, 4);
  assert.equal(result.ok, true);
});

// --- Capacity cap (a client cannot add unbounded widgets) ------------------

test('addWidget refuses once MAX_WIDGETS is reached', () => {
  const board = new Board();
  // Fill up to the cap.
  while (board.snapshot().widgets.length < MAX_WIDGETS) {
    ok(
      board.addWidget({
        kind: 'stat',
        metric: 'cpu_load',
        title: 'fill',
        x: 1,
        y: 1,
        w: 2,
        h: 2,
      }),
    );
  }
  assert.equal(board.snapshot().widgets.length, MAX_WIDGETS);
  const result = board.addWidget({
    kind: 'stat',
    metric: 'cpu_load',
    title: 'one too many',
    x: 1,
    y: 1,
    w: 2,
    h: 2,
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('unreachable');
  assert.equal(result.reason, 'capacity');
});

test('a board can be constructed from a persisted snapshot', () => {
  const seeded = new Board({
    rev: 7,
    widgets: [
      { id: 'w1', kind: 'line', metric: 'revenue', title: 'R', x: 1, y: 1, w: 4, h: 3 },
    ],
  });
  assert.equal(seeded.snapshot().rev, 7);
  assert.equal(seeded.snapshot().widgets.length, 1);
});
