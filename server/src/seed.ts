/**
 * Demo seed script.
 *
 * Populates a room's persisted board with a rich, hand-arranged layout so the
 * hosted demo comes up already looking like a real operations dashboard —
 * stat cards, gauges, streaming charts, a multi-panel incident view, and a
 * couple of threshold alerts primed to trip under the "incident" scenario.
 *
 * Usage:
 *   DATA_DIR=.pulseboard-data npm --workspace server run seed -- [room]
 * then boot the server with the same DATA_DIR (and SCENARIO=incident for the
 * scripted "watch it propagate" moment). The Docker `demo` profile does both.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { BoardState, Widget } from './protocol.js';
import { normalizeRoom } from './rooms.js';

function w(partial: Omit<Widget, 'id'>): Widget {
  return { id: randomUUID(), ...partial };
}

/** A polished, demo-worthy operations layout. */
export function demoBoard(): BoardState {
  const widgets: Widget[] = [
    // Top row: the four headline KPIs.
    w({ kind: 'stat', metric: 'requests_per_sec', title: 'Requests / sec', x: 1, y: 1, w: 3, h: 2 }),
    w({ kind: 'stat', metric: 'active_users', title: 'Active Users', x: 4, y: 1, w: 3, h: 2 }),
    w({ kind: 'gauge', metric: 'cpu_load', title: 'CPU Load', x: 7, y: 1, w: 3, h: 2 }),
    w({
      kind: 'stat',
      metric: 'error_rate',
      title: 'Error Rate',
      x: 10,
      y: 1,
      w: 3,
      h: 2,
      // Primed to trip red the moment the incident scenario spikes errors.
      threshold: { value: 4, dir: 'above' },
    }),

    // Middle: traffic vs latency side by side (classic saturation view).
    w({ kind: 'area', metric: 'requests_per_sec', title: 'Traffic', x: 1, y: 3, w: 6, h: 4 }),
    w({
      kind: 'line',
      metric: 'latency_ms',
      title: 'p95 Latency',
      x: 7,
      y: 3,
      w: 6,
      h: 4,
      threshold: { value: 600, dir: 'above' },
    }),

    // Lower: the incident signal (errors) full-width, revenue as bars.
    w({ kind: 'line', metric: 'error_rate', title: 'Errors (incident signal)', x: 1, y: 7, w: 8, h: 4 }),
    w({ kind: 'gauge', metric: 'error_rate', title: 'Error Gauge', x: 9, y: 7, w: 4, h: 4 }),
    w({ kind: 'bar', metric: 'revenue', title: 'Revenue / min', x: 1, y: 11, w: 12, h: 4 }),
  ];
  return { rev: 1, widgets };
}

function main(): void {
  const room = normalizeRoom(process.argv[2] ?? 'demo');
  const dataDir = resolve(process.env.DATA_DIR ?? '.pulseboard-data');
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, `${room}.json`);
  writeFileSync(file, JSON.stringify(demoBoard(), null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `Seeded demo board "${room}" (${demoBoard().widgets.length} widgets) → ${file}`,
  );
}

// Only run when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('/seed.ts') ||
  process.argv[1]?.replace(/\\/g, '/').endsWith('/seed.js');
if (invokedDirectly) main();
