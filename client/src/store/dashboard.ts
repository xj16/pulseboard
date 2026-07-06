/**
 * The dashboard Pinia store.
 *
 * Owns all live state: metric metadata, rolling per-metric time series,
 * the shared collaborative board, connection + presence status. It attaches
 * the Socket.IO listeners once (via {@link connect}) and exposes actions
 * that emit board mutations to the server.
 */

import { defineStore } from 'pinia';
import { socket } from '../socket';
import type {
  BoardState,
  HelloPayload,
  MetricId,
  MetricMeta,
  Sample,
  Tick,
  Widget,
  WidgetKind,
} from '../protocol';

/** Max points kept per metric in the client's rolling buffer. */
const MAX_POINTS = 120;

interface DashboardState {
  connected: boolean;
  presence: number;
  tickMs: number;
  metrics: MetricMeta[];
  /** Rolling series per metric, oldest first. */
  series: Record<string, Sample[]>;
  /** Latest value per metric. */
  latest: Record<string, number>;
  board: BoardState;
}

export const useDashboardStore = defineStore('dashboard', {
  state: (): DashboardState => ({
    connected: false,
    presence: 0,
    tickMs: 1000,
    metrics: [],
    series: {},
    latest: {},
    board: { rev: 0, widgets: [] },
  }),

  getters: {
    metricById: (state) => {
      const map = new Map<MetricId, MetricMeta>();
      for (const m of state.metrics) map.set(m.id, m);
      return (id: MetricId): MetricMeta | undefined => map.get(id);
    },
    seriesFor: (state) => {
      return (id: MetricId): Sample[] => state.series[id] ?? [];
    },
    latestFor: (state) => {
      return (id: MetricId): number => state.latest[id] ?? 0;
    },
  },

  actions: {
    /** Wire up socket listeners. Safe to call once on app mount. */
    connect() {
      socket.on('connect', () => {
        this.connected = true;
      });
      socket.on('disconnect', () => {
        this.connected = false;
      });

      socket.on('hello', (payload: HelloPayload) => {
        this.metrics = payload.metrics;
        this.series = { ...payload.history };
        this.tickMs = payload.tickMs;
        this.presence = payload.presence;
        this.board = payload.board;
        // Seed latest from the last historical sample.
        for (const m of payload.metrics) {
          const hist = payload.history[m.id];
          this.latest[m.id] = hist?.length ? hist[hist.length - 1].v : 0;
        }
      });

      socket.on('tick', (tick: Tick) => {
        for (const m of this.metrics) {
          const v = tick.values[m.id];
          if (v === undefined) continue;
          this.latest[m.id] = v;
          const buf = this.series[m.id] ?? (this.series[m.id] = []);
          buf.push({ t: tick.t, v });
          if (buf.length > MAX_POINTS) buf.shift();
        }
      });

      socket.on('board:update', (board: BoardState) => {
        this.board = board;
      });

      socket.on('presence', (count: number) => {
        this.presence = count;
      });
    },

    // --- Board mutations (optimistic-free: server is authoritative) ---------

    addWidget(kind: WidgetKind, metric: MetricId) {
      const meta = this.metricById(metric);
      const isChart = kind === 'line' || kind === 'area' || kind === 'bar';
      const widget: Omit<Widget, 'id'> = {
        kind,
        metric,
        title: meta?.label ?? metric,
        x: 1,
        // Drop new widgets below the current content.
        y: this.nextFreeRow(),
        w: isChart ? 6 : 3,
        h: isChart ? 4 : 2,
      };
      socket.emit('board:addWidget', widget);
    },

    moveWidget(id: string, x: number, y: number) {
      socket.emit('board:moveWidget', { id, x, y });
    },

    resizeWidget(id: string, w: number, h: number) {
      socket.emit('board:resizeWidget', { id, w, h });
    },

    removeWidget(id: string) {
      socket.emit('board:removeWidget', { id });
    },

    resetBoard() {
      socket.emit('board:reset');
    },

    /** Compute the first row below all existing widgets. */
    nextFreeRow(): number {
      let max = 0;
      for (const w of this.board.widgets) {
        max = Math.max(max, w.y + w.h - 1);
      }
      return max + 1;
    },
  },
});
