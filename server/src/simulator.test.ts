import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Simulator, METRICS, SCENARIOS } from './simulator.js';

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

// --- Scenarios --------------------------------------------------------------

test('defaults to the calm scenario and can switch', () => {
  const sim = new Simulator({ seed: 1 });
  assert.equal(sim.getScenario(), 'calm');
  sim.setScenario('incident');
  assert.equal(sim.getScenario(), 'incident');
});

test('scenario values still respect metric ranges', () => {
  for (const scenario of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
    const sim = new Simulator({ seed: 99, scenario });
    for (let i = 0; i < 300; i++) {
      const values = sim.tick();
      for (const meta of METRICS) {
        const v = values[meta.id];
        assert.ok(
          v >= meta.min && v <= meta.max,
          `${scenario}: ${meta.id}=${v} out of range`,
        );
      }
    }
  }
});

test('a traffic-spike scenario drives requests_per_sec higher than calm', () => {
  const seed = 4242;
  const calm = new Simulator({ seed, scenario: 'calm', historyLength: 5 });
  const spike = new Simulator({ seed, scenario: 'traffic-spike', historyLength: 5 });
  const avg = (sim: Simulator): number => {
    let sum = 0;
    const n = 400;
    for (let i = 0; i < n; i++) sum += sim.tick(1_700_000_000_000 + i * 1000).requests_per_sec;
    return sum / n;
  };
  assert.ok(
    avg(spike) > avg(calm),
    'traffic-spike should lift the driver above calm on average',
  );
});

test('an incident scenario raises the average error rate above calm', () => {
  const seed = 20260707;
  const calm = new Simulator({ seed, scenario: 'calm', historyLength: 5 });
  const incident = new Simulator({ seed, scenario: 'incident', historyLength: 5 });
  const avgErr = (sim: Simulator): number => {
    let sum = 0;
    const n = 600;
    for (let i = 0; i < n; i++) sum += sim.tick(1_700_000_000_000 + i * 1000).error_rate;
    return sum / n;
  };
  assert.ok(
    avgErr(incident) > avgErr(calm),
    'incident should elevate errors versus calm',
  );
});
