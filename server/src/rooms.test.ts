import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Rooms, normalizeRoom, DEFAULT_ROOM } from './rooms.js';

test('normalizeRoom produces safe, bounded slugs', () => {
  assert.equal(normalizeRoom('Team Alpha!'), 'team-alpha');
  assert.equal(normalizeRoom('  ../../etc/passwd '), 'etc-passwd');
  assert.equal(normalizeRoom(''), DEFAULT_ROOM);
  assert.equal(normalizeRoom(undefined), DEFAULT_ROOM);
  assert.equal(normalizeRoom(123 as unknown), DEFAULT_ROOM);
  assert.ok(normalizeRoom('x'.repeat(200)).length <= 40);
  assert.equal(normalizeRoom('---weird---'), 'weird');
});

test('distinct rooms hold independent boards', () => {
  const rooms = new Rooms();
  const a = rooms.get('alpha');
  const b = rooms.get('beta');
  a.removeWidget(a.snapshot().widgets[0].id);
  assert.notEqual(a.snapshot().widgets.length, b.snapshot().widgets.length);
  assert.deepEqual(rooms.list().sort(), ['alpha', 'beta']);
});

test('boards persist to disk and reload on restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulseboard-rooms-'));
  try {
    const rooms = new Rooms({ dataDir: dir, saveDebounceMs: 5 });
    const board = rooms.get('persisted');
    const added = board.addWidget({
      kind: 'gauge',
      metric: 'cpu_load',
      title: 'Persisted gauge',
      x: 1,
      y: 1,
      w: 3,
      h: 2,
    });
    assert.equal(added.ok, true);
    rooms.touch('persisted');
    rooms.flush();

    const file = join(dir, 'persisted.json');
    assert.ok(existsSync(file), 'a JSON file should have been written');
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(onDisk.widgets.some((w: { title: string }) => w.title === 'Persisted gauge'));

    // A brand-new registry pointed at the same dir should rehydrate the board.
    const reborn = new Rooms({ dataDir: dir });
    assert.ok(reborn.list().includes('persisted'));
    const restored = reborn.get('persisted');
    assert.ok(
      restored.snapshot().widgets.some((w) => w.title === 'Persisted gauge'),
      'the widget should survive a restart',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt room file is skipped, not fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulseboard-rooms-'));
  try {
    // Write junk that is not valid board JSON.
    const bad = join(dir, 'broken.json');
    writeFileSync(bad, '{ not json', 'utf8');
    const rooms = new Rooms({ dataDir: dir });
    // Should construct without throwing; the broken room is simply absent.
    assert.ok(!rooms.list().includes('broken'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
