/**
 * The collaborative board state.
 *
 * PulseBoard is "collaborative" in that every connected client shares one
 * board layout. When anyone adds, moves, resizes, or removes a widget, the
 * mutation is applied here and the new state is broadcast to everyone. The
 * `rev` counter increments on each successful mutation so clients can tell
 * their optimistic view apart from the authoritative one.
 */

import { randomUUID } from 'node:crypto';
import type { BoardState, Widget } from './protocol.js';

/** The grid is a fixed number of columns wide; height grows as needed. */
export const GRID_COLUMNS = 12;

/** A sensible starter layout so a fresh board is never blank. */
function defaultWidgets(): Widget[] {
  return [
    {
      id: randomUUID(),
      kind: 'stat',
      metric: 'requests_per_sec',
      title: 'Requests / sec',
      x: 1,
      y: 1,
      w: 3,
      h: 2,
    },
    {
      id: randomUUID(),
      kind: 'stat',
      metric: 'active_users',
      title: 'Active Users',
      x: 4,
      y: 1,
      w: 3,
      h: 2,
    },
    {
      id: randomUUID(),
      kind: 'gauge',
      metric: 'cpu_load',
      title: 'CPU Load',
      x: 7,
      y: 1,
      w: 3,
      h: 2,
    },
    {
      id: randomUUID(),
      kind: 'stat',
      metric: 'error_rate',
      title: 'Error Rate',
      x: 10,
      y: 1,
      w: 3,
      h: 2,
    },
    {
      id: randomUUID(),
      kind: 'area',
      metric: 'requests_per_sec',
      title: 'Traffic',
      x: 1,
      y: 3,
      w: 6,
      h: 4,
    },
    {
      id: randomUUID(),
      kind: 'line',
      metric: 'latency_ms',
      title: 'p95 Latency',
      x: 7,
      y: 3,
      w: 6,
      h: 4,
    },
    {
      id: randomUUID(),
      kind: 'line',
      metric: 'revenue',
      title: 'Revenue / min',
      x: 1,
      y: 7,
      w: 12,
      h: 4,
    },
  ];
}

export class Board {
  private state: BoardState;

  constructor() {
    this.state = { rev: 1, widgets: defaultWidgets() };
  }

  /** Current authoritative snapshot. */
  snapshot(): BoardState {
    return this.state;
  }

  private bump(widgets: Widget[]): BoardState {
    this.state = { rev: this.state.rev + 1, widgets };
    return this.state;
  }

  addWidget(input: Omit<Widget, 'id'>): BoardState {
    const widget: Widget = {
      id: randomUUID(),
      kind: input.kind,
      metric: input.metric,
      title: input.title,
      x: clampCol(input.x, input.w),
      y: Math.max(1, Math.floor(input.y) || 1),
      w: clampSpan(input.w),
      h: Math.max(1, Math.floor(input.h) || 2),
    };
    return this.bump([...this.state.widgets, widget]);
  }

  moveWidget(id: string, x: number, y: number): BoardState {
    const widgets = this.state.widgets.map((w) =>
      w.id === id
        ? { ...w, x: clampCol(x, w.w), y: Math.max(1, Math.floor(y) || 1) }
        : w,
    );
    return this.bump(widgets);
  }

  resizeWidget(id: string, w: number, h: number): BoardState {
    const widgets = this.state.widgets.map((widget) =>
      widget.id === id
        ? {
            ...widget,
            w: clampSpan(w),
            h: Math.max(1, Math.floor(h) || 2),
            x: clampCol(widget.x, clampSpan(w)),
          }
        : widget,
    );
    return this.bump(widgets);
  }

  removeWidget(id: string): BoardState {
    const widgets = this.state.widgets.filter((w) => w.id !== id);
    if (widgets.length === this.state.widgets.length) return this.state;
    return this.bump(widgets);
  }

  reset(): BoardState {
    return this.bump(defaultWidgets());
  }
}

/** Keep a column span within [1, GRID_COLUMNS]. */
function clampSpan(w: number): number {
  const span = Math.floor(w) || 1;
  return Math.min(GRID_COLUMNS, Math.max(1, span));
}

/** Keep an x position so the widget fits inside the grid. */
function clampCol(x: number, w: number): number {
  const span = clampSpan(w);
  const col = Math.floor(x) || 1;
  return Math.min(GRID_COLUMNS - span + 1, Math.max(1, col));
}
