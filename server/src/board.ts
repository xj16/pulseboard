/**
 * The collaborative board state.
 *
 * PulseBoard is "collaborative" in that every connected client shares one
 * board layout per room. When anyone adds, moves, resizes, updates, or removes
 * a widget, the mutation is applied here and the new state is broadcast to
 * everyone in that room. The `rev` counter increments on each successful
 * mutation and is used for real optimistic-concurrency control: a mutation
 * stamped with a stale rev is rejected so clients can rebase instead of
 * silently clobbering a change they never saw.
 */

import { randomUUID } from 'node:crypto';
import type { BoardState, MetricId, Widget, WidgetKind } from './protocol.js';

/** The grid is a fixed number of columns wide; height grows as needed. */
export const GRID_COLUMNS = 12;

/** Hard cap on widgets per board — stops a client adding unbounded widgets. */
export const MAX_WIDGETS = 40;

/** Discriminates a successful mutation from a rejected one. */
export type MutationResult =
  | { ok: true; state: BoardState }
  | { ok: false; reason: 'stale-rev' | 'capacity'; state: BoardState };

/** A sensible starter layout so a fresh board is never blank. */
export function defaultWidgets(): Widget[] {
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
      threshold: { value: 5, dir: 'above' },
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
      kind: 'bar',
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

  constructor(initial?: BoardState) {
    this.state = initial ?? { rev: 1, widgets: defaultWidgets() };
  }

  /** Current authoritative snapshot. */
  snapshot(): BoardState {
    return this.state;
  }

  /** Replace state wholesale (used when hydrating from persistence). */
  hydrate(state: BoardState): void {
    this.state = state;
  }

  private bump(widgets: Widget[]): BoardState {
    this.state = { rev: this.state.rev + 1, widgets };
    return this.state;
  }

  /**
   * Optimistic-concurrency guard. If the caller supplies a rev and it does not
   * match the current authoritative rev, the mutation is stale — the caller was
   * acting on a board they have since fallen behind on. `undefined` opts out
   * (used by trusted/legacy callers and internal seeding).
   */
  private isStale(rev: number | undefined): boolean {
    return typeof rev === 'number' && rev !== this.state.rev;
  }

  addWidget(input: Omit<Widget, 'id'>, rev?: number): MutationResult {
    if (this.isStale(rev)) {
      return { ok: false, reason: 'stale-rev', state: this.state };
    }
    if (this.state.widgets.length >= MAX_WIDGETS) {
      return { ok: false, reason: 'capacity', state: this.state };
    }
    const widget: Widget = {
      id: randomUUID(),
      kind: input.kind,
      metric: input.metric,
      title: input.title,
      x: clampCol(input.x, input.w),
      y: Math.max(1, Math.floor(input.y) || 1),
      w: clampSpan(input.w),
      h: Math.max(1, Math.floor(input.h) || 2),
      threshold: input.threshold ?? null,
    };
    return { ok: true, state: this.bump([...this.state.widgets, widget]) };
  }

  moveWidget(id: string, x: number, y: number, rev?: number): MutationResult {
    if (this.isStale(rev)) {
      return { ok: false, reason: 'stale-rev', state: this.state };
    }
    const widgets = this.state.widgets.map((w) =>
      w.id === id
        ? { ...w, x: clampCol(x, w.w), y: Math.max(1, Math.floor(y) || 1) }
        : w,
    );
    return { ok: true, state: this.bump(widgets) };
  }

  resizeWidget(id: string, w: number, h: number, rev?: number): MutationResult {
    if (this.isStale(rev)) {
      return { ok: false, reason: 'stale-rev', state: this.state };
    }
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
    return { ok: true, state: this.bump(widgets) };
  }

  /**
   * Edit a widget's presentation in place (metric / kind / title / threshold).
   * Only the provided fields change; geometry is untouched.
   */
  updateWidget(
    id: string,
    patch: {
      kind?: WidgetKind;
      metric?: MetricId;
      title?: string;
      threshold?: { value: number; dir: 'above' | 'below' } | null;
    },
    rev?: number,
  ): MutationResult {
    if (this.isStale(rev)) {
      return { ok: false, reason: 'stale-rev', state: this.state };
    }
    let touched = false;
    const widgets = this.state.widgets.map((widget) => {
      if (widget.id !== id) return widget;
      touched = true;
      return {
        ...widget,
        kind: patch.kind ?? widget.kind,
        metric: patch.metric ?? widget.metric,
        title: patch.title ?? widget.title,
        threshold:
          patch.threshold !== undefined ? patch.threshold : widget.threshold,
      };
    });
    if (!touched) return { ok: true, state: this.state };
    return { ok: true, state: this.bump(widgets) };
  }

  removeWidget(id: string, rev?: number): MutationResult {
    if (this.isStale(rev)) {
      return { ok: false, reason: 'stale-rev', state: this.state };
    }
    const widgets = this.state.widgets.filter((w) => w.id !== id);
    if (widgets.length === this.state.widgets.length) {
      return { ok: true, state: this.state };
    }
    return { ok: true, state: this.bump(widgets) };
  }

  reset(rev?: number): MutationResult {
    if (this.isStale(rev)) {
      return { ok: false, reason: 'stale-rev', state: this.state };
    }
    return { ok: true, state: this.bump(defaultWidgets()) };
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
