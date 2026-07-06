import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Simulator, METRICS } from './simulator.js';

test('prefills history for every metric', () => {
  const sim = new Simulator({ historyLength: 50, seed: 42 });
  for (const meta of METRICS) {
    const hist = sim.history(meta.id);
    assert.equal(hist.length, 50, `${meta.id} should have 50 samples`);
  }
});

test('every tick returns a value for every metric', () => {
  const sim = new Simulator({ seed: 7 });
  const values = sim.tick();
  for (const meta of METRICS) {
    assert.ok(meta.id in values, `${meta.id} missing from tick`);
    assert.equal(typeof values[meta.id], 'number');
  }
});

test('values stay within each metric range', () => {
  const sim = new Simulator({ seed: 123 });
  for (let i = 0; i < 500; i++) {
    const values = sim.tick();
    for (const meta of METRICS) {
      const v = values[meta.id];
      assert.ok(
        v >= meta.min && v <= meta.max,
        `${meta.id}=${v} out of [${meta.min}, ${meta.max}]`,
      );
    }
  }
});

test('history is capped at historyLength', () => {
  const sim = new Simulator({ historyLength: 30, seed: 9 });
  for (let i = 0; i < 100; i++) sim.tick();
  for (const meta of METRICS) {
    assert.equal(sim.history(meta.id).length, 30);
  }
});

test('same seed produces identical streams (deterministic)', () => {
  const a = new Simulator({ seed: 555 });
  const b = new Simulator({ seed: 555 });
  for (let i = 0; i < 20; i++) {
    const now = 1_700_000_000_000 + i * 1000;
    assert.deepEqual(a.tick(now), b.tick(now));
  }
});

test('respects a custom tick interval', () => {
  const sim = new Simulator({ tickMs: 250 });
  assert.equal(sim.tickMs, 250);
});
