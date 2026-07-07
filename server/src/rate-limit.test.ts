import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenBucket } from './rate-limit.js';

test('allows a burst up to capacity then rejects', () => {
  const t0 = 1_000_000;
  const bucket = new TokenBucket({ capacity: 5, ratePerSec: 1 }, t0);
  for (let i = 0; i < 5; i++) {
    assert.equal(bucket.tryRemove(t0), true, `burst token ${i} should pass`);
  }
  assert.equal(bucket.tryRemove(t0), false, 'the 6th call should be blocked');
});

test('refills over time at ratePerSec', () => {
  const t0 = 2_000_000;
  const bucket = new TokenBucket({ capacity: 2, ratePerSec: 4 }, t0);
  assert.equal(bucket.tryRemove(t0), true);
  assert.equal(bucket.tryRemove(t0), true);
  assert.equal(bucket.tryRemove(t0), false); // empty
  // 250ms later at 4/sec → exactly 1 token back.
  assert.equal(bucket.tryRemove(t0 + 250), true);
  assert.equal(bucket.tryRemove(t0 + 250), false);
});

test('never exceeds capacity no matter how long it idles', () => {
  const t0 = 3_000_000;
  const bucket = new TokenBucket({ capacity: 3, ratePerSec: 10 }, t0);
  // Idle for an hour.
  assert.ok(bucket.available(t0 + 3_600_000) <= 3);
  let allowed = 0;
  for (let i = 0; i < 100; i++) {
    if (bucket.tryRemove(t0 + 3_600_000)) allowed++;
  }
  assert.equal(allowed, 3, 'capacity caps the post-idle burst');
});

test('a hostile tight loop is throttled to roughly ratePerSec', () => {
  const start = 4_000_000;
  const bucket = new TokenBucket({ capacity: 10, ratePerSec: 8 }, start);
  let allowed = 0;
  // Simulate 1000 mutation attempts spread across 1 second (same instant-ish).
  for (let i = 0; i < 1000; i++) {
    if (bucket.tryRemove(start + i)) allowed++; // 1ms apart
  }
  // Burst (10) + ~8 tokens over ~1s. Comfortably far below 1000.
  assert.ok(allowed < 30, `expected heavy throttling, got ${allowed}`);
});
