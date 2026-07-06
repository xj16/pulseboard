import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Board, GRID_COLUMNS } from './board.js';

test('starts with a non-empty default layout', () => {
  const board = new Board();
  const snap = board.snapshot();
  assert.ok(snap.widgets.length > 0);
  assert.equal(snap.rev, 1);
});

test('addWidget appends and bumps rev', () => {
  const board = new Board();
  const before = board.snapshot();
  const after = board.addWidget({
    kind: 'line',
    metric: 'cpu_load',
    title: 'CPU',
    x: 1,
    y: 20,
    w: 4,
    h: 3,
  });
  assert.equal(after.widgets.length, before.widgets.length + 1);
  assert.equal(after.rev, before.rev + 1);
  assert.ok(after.widgets.at(-1)!.id.length > 0);
});

test('addWidget clamps oversized spans into the grid', () => {
  const board = new Board();
  const after = board.addWidget({
    kind: 'bar',
    metric: 'revenue',
    title: 'Rev',
    x: 50,
    y: 1,
    w: 99,
    h: 2,
  });
  const w = after.widgets.at(-1)!;
  assert.ok(w.w <= GRID_COLUMNS);
  assert.ok(w.x >= 1 && w.x + w.w - 1 <= GRID_COLUMNS);
});

test('moveWidget updates coordinates', () => {
  const board = new Board();
  const id = board.snapshot().widgets[0].id;
  const after = board.moveWidget(id, 5, 9);
  const moved = after.widgets.find((w) => w.id === id)!;
  assert.equal(moved.y, 9);
  assert.ok(moved.x >= 1);
});

test('removeWidget deletes by id and is a no-op for unknown ids', () => {
  const board = new Board();
  const id = board.snapshot().widgets[0].id;
  const removed = board.removeWidget(id);
  assert.ok(!removed.widgets.some((w) => w.id === id));

  const revBefore = removed.rev;
  const again = board.removeWidget('does-not-exist');
  assert.equal(again.rev, revBefore, 'rev must not change on no-op');
});

test('reset restores a fresh default layout', () => {
  const board = new Board();
  board.removeWidget(board.snapshot().widgets[0].id);
  const reset = board.reset();
  assert.ok(reset.widgets.length > 0);
  assert.ok(reset.rev > 1);
});
