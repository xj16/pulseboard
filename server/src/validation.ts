/**
 * Runtime validation for untrusted client payloads.
 *
 * Everything crossing the socket boundary is attacker-controlled: a malicious
 * or buggy client can emit any shape it likes. These guards coerce/verify each
 * mutation before it is allowed to touch board state, so the board can never be
 * corrupted by a non-finite coordinate, an unknown enum, or a giant string.
 */

import {
  METRIC_IDS,
  SCENARIO_IDS,
  WIDGET_KINDS,
  type MetricId,
  type ScenarioId,
  type Widget,
  type WidgetKind,
} from './protocol.js';

/** Longest widget title we accept — keeps payloads and the UI bounded. */
export const MAX_TITLE_LEN = 60;

const METRIC_SET = new Set<string>(METRIC_IDS);
const KIND_SET = new Set<string>(WIDGET_KINDS);
const SCENARIO_SET = new Set<string>(SCENARIO_IDS);

export function isMetricId(v: unknown): v is MetricId {
  return typeof v === 'string' && METRIC_SET.has(v);
}

export function isWidgetKind(v: unknown): v is WidgetKind {
  return typeof v === 'string' && KIND_SET.has(v);
}

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && SCENARIO_SET.has(v);
}

/** A finite number (rejects NaN, ±Infinity, and non-numbers). */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Coerce an arbitrary value to a bounded, trimmed title string. */
export function coerceTitle(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const trimmed = v.trim().slice(0, MAX_TITLE_LEN);
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Validate an optional threshold spec, returning a clean value or null. */
export function coerceThreshold(
  v: unknown,
): { value: number; dir: 'above' | 'below' } | null {
  if (v == null || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  if (!isFiniteNumber(t.value)) return null;
  const dir = t.dir === 'below' ? 'below' : 'above';
  return { value: t.value, dir };
}

/**
 * Validate an incoming addWidget payload. Returns a clean widget spec (minus
 * id, which the server mints) or a reason string describing why it was rejected.
 */
export function validateAddWidget(
  input: unknown,
): { ok: true; value: Omit<Widget, 'id'> } | { ok: false; reason: string } {
  if (input == null || typeof input !== 'object') {
    return { ok: false, reason: 'payload must be an object' };
  }
  const p = input as Record<string, unknown>;
  if (!isWidgetKind(p.kind)) return { ok: false, reason: 'invalid kind' };
  if (!isMetricId(p.metric)) return { ok: false, reason: 'invalid metric' };
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    if (!isFiniteNumber(p[key])) {
      return { ok: false, reason: `invalid ${key}` };
    }
  }
  return {
    ok: true,
    value: {
      kind: p.kind,
      metric: p.metric,
      title: coerceTitle(p.title, p.metric),
      x: p.x as number,
      y: p.y as number,
      w: p.w as number,
      h: p.h as number,
      threshold: coerceThreshold(p.threshold),
    },
  };
}

/** Validate a `{ id, x, y }` move payload. */
export function validateMove(
  input: unknown,
): { ok: true; id: string; x: number; y: number } | { ok: false } {
  if (input == null || typeof input !== 'object') return { ok: false };
  const p = input as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length === 0) return { ok: false };
  if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return { ok: false };
  return { ok: true, id: p.id, x: p.x, y: p.y };
}

/** Validate a `{ id, w, h }` resize payload. */
export function validateResize(
  input: unknown,
): { ok: true; id: string; w: number; h: number } | { ok: false } {
  if (input == null || typeof input !== 'object') return { ok: false };
  const p = input as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length === 0) return { ok: false };
  if (!isFiniteNumber(p.w) || !isFiniteNumber(p.h)) return { ok: false };
  return { ok: true, id: p.id, w: p.w, h: p.h };
}

/** Extract a valid id from a `{ id }` payload. */
export function validateId(input: unknown): string | null {
  if (input == null || typeof input !== 'object') return null;
  const id = (input as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
