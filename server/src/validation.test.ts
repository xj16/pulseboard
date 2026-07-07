import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAddWidget,
  validateMove,
  validateResize,
  validateId,
  coerceTitle,
  coerceThreshold,
  isFiniteNumber,
  isMetricId,
  isWidgetKind,
  isScenarioId,
  MAX_TITLE_LEN,
} from './validation.js';

test('validateAddWidget accepts a well-formed payload', () => {
  const r = validateAddWidget({
    kind: 'line',
    metric: 'cpu_load',
    title: 'CPU',
    x: 1,
    y: 2,
    w: 6,
    h: 4,
  });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  assert.equal(r.value.kind, 'line');
  assert.equal(r.value.metric, 'cpu_load');
});

test('validateAddWidget rejects unknown kind and metric', () => {
  assert.equal(
    validateAddWidget({ kind: 'pie', metric: 'cpu_load', x: 1, y: 1, w: 1, h: 1 }).ok,
    false,
  );
  assert.equal(
    validateAddWidget({ kind: 'line', metric: 'temperature', x: 1, y: 1, w: 1, h: 1 }).ok,
    false,
  );
});

test('validateAddWidget rejects non-finite coordinates', () => {
  for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined]) {
    const r = validateAddWidget({
      kind: 'line',
      metric: 'cpu_load',
      x: bad,
      y: 1,
      w: 1,
      h: 1,
    });
    assert.equal(r.ok, false, `x=${String(bad)} should be rejected`);
  }
});

test('validateAddWidget falls back the title to the metric when missing/blank', () => {
  const r = validateAddWidget({
    kind: 'stat',
    metric: 'revenue',
    title: '   ',
    x: 1,
    y: 1,
    w: 3,
    h: 2,
  });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  assert.equal(r.value.title, 'revenue');
});

test('coerceTitle trims and bounds length', () => {
  const long = 'x'.repeat(500);
  assert.equal(coerceTitle(long, 'fb').length, MAX_TITLE_LEN);
  assert.equal(coerceTitle('  hi  ', 'fb'), 'hi');
  assert.equal(coerceTitle(42, 'fb'), 'fb');
});

test('coerceThreshold validates value + direction', () => {
  assert.deepEqual(coerceThreshold({ value: 5, dir: 'above' }), {
    value: 5,
    dir: 'above',
  });
  assert.deepEqual(coerceThreshold({ value: 5, dir: 'nonsense' }), {
    value: 5,
    dir: 'above',
  });
  assert.equal(coerceThreshold({ value: 'x', dir: 'above' }), null);
  assert.equal(coerceThreshold(null), null);
});

test('validateMove / validateResize require an id and finite numbers', () => {
  assert.equal(validateMove({ id: 'a', x: 1, y: 2 }).ok, true);
  assert.equal(validateMove({ id: '', x: 1, y: 2 }).ok, false);
  assert.equal(validateMove({ id: 'a', x: NaN, y: 2 }).ok, false);
  assert.equal(validateResize({ id: 'a', w: 3, h: 3 }).ok, true);
  assert.equal(validateResize({ id: 'a', w: 'big', h: 3 }).ok, false);
});

test('validateId extracts a non-empty id or null', () => {
  assert.equal(validateId({ id: 'abc' }), 'abc');
  assert.equal(validateId({ id: '' }), null);
  assert.equal(validateId({}), null);
  assert.equal(validateId(null), null);
});

test('type guards', () => {
  assert.equal(isFiniteNumber(1.5), true);
  assert.equal(isFiniteNumber(NaN), false);
  assert.equal(isMetricId('revenue'), true);
  assert.equal(isMetricId('nope'), false);
  assert.equal(isWidgetKind('gauge'), true);
  assert.equal(isWidgetKind('donut'), false);
  assert.equal(isScenarioId('incident'), true);
  assert.equal(isScenarioId('meltdown'), false);
});
