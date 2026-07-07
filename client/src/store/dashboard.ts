/**
 * The dashboard Pinia store.
 *
 * Owns all live state: metric metadata, rolling per-metric time series, the
 * shared collaborative board, connection + presence, and — new in this build —
 * per-user identity, the live peer roster, other users' cursors, who is
 * dragging what, the active simulator scenario, and a paused/scrub view of the
 * live feed. It attaches the Socket.IO listeners once (via {@link connect}) and
 * exposes actions that emit rev-stamped board mutations to the server.
 */

import { defineStore } from 'pinia';
import { socket, roomFromLocation } from '../socket';
import type {
  BoardState,
  CursorPos,
  DragState,
  HelloPayload,
  MetricId,
  MetricMeta,
  Peer,
  RejectedPayload,
  Sample,
  ScenarioId,
  Tick,
  Widget,
  WidgetKind,
} from '../protocol';

/** Max points kept per metric in the client's rolling buffer. */
const MAX_POINTS = 120;

/** A transient toast surfaced when the server rejects a mutation. */
export interface Notice {
  id: number;
  kind: RejectedPayload['reason'] | 'info';
  message: string;
}

interface DashboardState {
  connected: boolean;
  room: string;
  self: Peer | null;
  peers: Peer[];
  presence: number;
  tickMs: number;
  scenario: ScenarioId;
  metrics: MetricMeta[];
  /** Rolling series per metric, oldest first. */
  series: Record<string, Sample[]>;
  /** Latest value per metric. */
  latest: Record<string, number>;
  board: BoardState;
  /** Other peers' cursor positions, keyed by peer id (grid-normalized 0..1). */
  cursors: Record<string, CursorPos>;
  /** Which widget each peer is currently dragging (peerId -> widgetId). */
  dragging: Record<string, string>;
  /** When paused, the live feed is frozen and the scrubber drives the view. */
  paused: boolean;
  /** Scrub offset from the newest sample, in points (0 = latest). */
  scrubOffset: number;
  notices: Notice[];
}

let noticeSeq = 0;

export const useDashboardStore = defineStore('dashboard', {
  state: (): DashboardState => ({
    connected: false,
    room: roomFromLocation(),
    self: null,
    peers: [],
    presence: 0,
    tickMs: 1000,
    scenario: 'calm',
    metrics: [],
    series: {},
    latest: {},
    board: { rev: 0, widgets: [] },
    cursors: {},
    dragging: {},
    paused: false,
    scrubOffset: 0,
    notices: [],
  }),

  getters: {
    metricById: (state) => {
      const map = new Map<MetricId, MetricMeta>();
      for (const m of state.metrics) map.set(m.id, m);
      return (id: MetricId): MetricMeta | undefined => map.get(id);
    },
    /** The series a widget should render — frozen + sliced when paused. */
    viewSeriesFor: (state) => {
      return (id: MetricId): Sample[] => {
        const full = state.series[id] ?? [];
        if (!state.paused || state.scrubOffset <= 0) return full;
        const end = full.length - state.scrubOffset;
        return end > 0 ? full.slice(0, end) : full.slice(0, 1);
      };
    },
    seriesFor: (state) => {
      return (id: MetricId): Sample[] => state.series[id] ?? [];
    },
    /** Latest value to show — respects the scrub position when paused. */
    latestFor(state): (id: MetricId) => number {
      return (id: MetricId): number => {
        if (state.paused && state.scrubOffset > 0) {
          const s = state.series[id] ?? [];
          const idx = s.length - 1 - state.scrubOffset;
          if (idx >= 0) return s[idx].v;
        }
        return state.latest[id] ?? 0;
      };
    },
    /** Peers other than self, for the cursor/avatar layers. */
    others(state): Peer[] {
      return state.peers.filter((p) => p.id !== state.self?.id);
    },
    /** Longest series length across metrics — the scrubber's range. */
    historyLength(state): number {
      let max = 0;
      for (const id in state.series) max = Math.max(max, state.series[id].length);
      return max;
    },
    peerById(state): (id: string) => Peer | undefined {
      const map = new Map(state.peers.map((p) => [p.id, p]));
      return (id: string) => map.get(id);
    },
    /** For a widget, the peer (if any) currently dragging it. */
    draggerOf(state): (widgetId: string) => Peer | undefined {
      return (widgetId: string): Peer | undefined => {
        const selfId = state.self?.id;
        for (const [peerId, wid] of Object.entries(state.dragging)) {
          if (wid === widgetId && peerId !== selfId) {
            return state.peers.find((p) => p.id === peerId);
          }
        }
        return undefined;
      };
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
        this.room = payload.room;
        this.self = payload.self;
        this.peers = payload.peers;
        this.metrics = payload.metrics;
        this.series = { ...payload.history };
        this.tickMs = payload.tickMs;
        this.presence = payload.presence;
        this.scenario = payload.scenario;
        this.board = payload.board;
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
        // Keep the scrub anchored to the same sample as new data streams in.
        if (this.paused && this.scrubOffset > 0) {
          this.scrubOffset = Math.min(this.scrubOffset + 1, MAX_POINTS - 1);
        }
      });

      socket.on('board:update', (board: BoardState) => {
        this.board = board;
      });

      socket.on('board:rejected', (payload: RejectedPayload) => {
        // Resync to authoritative state and surface why our action bounced.
        this.board = payload.board;
        this.pushNotice(payload.reason, payload.message);
      });

      socket.on('presence', (count: number) => {
        this.presence = count;
      });

      socket.on('peers:update', (peers: Peer[]) => {
        this.peers = peers;
        // Drop cursors/drag rings for peers who have left.
        const live = new Set(peers.map((p) => p.id));
        for (const id of Object.keys(this.cursors)) {
          if (!live.has(id)) delete this.cursors[id];
        }
        for (const id of Object.keys(this.dragging)) {
          if (!live.has(id)) delete this.dragging[id];
        }
      });

      socket.on('cursor:update', (cursor: CursorPos) => {
        this.cursors[cursor.id] = cursor;
      });

      socket.on('drag:update', (drag: DragState) => {
        if (drag.widgetId) this.dragging[drag.peerId] = drag.widgetId;
        else delete this.dragging[drag.peerId];
      });

      socket.on('scenario:update', (scenario: ScenarioId) => {
        this.scenario = scenario;
      });
    },

    pushNotice(kind: Notice['kind'], message: string) {
      const id = ++noticeSeq;
      this.notices.push({ id, kind, message });
      setTimeout(() => this.dismissNotice(id), 4000);
    },

    dismissNotice(id: number) {
      this.notices = this.notices.filter((n) => n.id !== id);
    },

    // --- Board mutations (rev-stamped for optimistic concurrency) -----------

    addWidget(kind: WidgetKind, metric: MetricId) {
      const meta = this.metricById(metric);
      const isChart = kind === 'line' || kind === 'area' || kind === 'bar';
      const widget: Omit<Widget, 'id'> = {
        kind,
        metric,
        title: meta?.label ?? metric,
        x: 1,
        y: this.nextFreeRow(),
        w: isChart ? 6 : 3,
        h: isChart ? 4 : 2,
      };
      socket.emit('board:addWidget', { ...widget, rev: this.board.rev });
    },

    moveWidget(id: string, x: number, y: number) {
      socket.emit('board:moveWidget', { id, x, y, rev: this.board.rev });
    },

    resizeWidget(id: string, w: number, h: number) {
      socket.emit('board:resizeWidget', { id, w, h, rev: this.board.rev });
    },

    updateWidget(
      id: string,
      patch: {
        kind?: WidgetKind;
        metric?: MetricId;
        title?: string;
        threshold?: { value: number; dir: 'above' | 'below' } | null;
      },
    ) {
      socket.emit('board:updateWidget', { id, ...patch, rev: this.board.rev });
    },

    removeWidget(id: string) {
      socket.emit('board:removeWidget', { id, rev: this.board.rev });
    },

    resetBoard() {
      socket.emit('board:reset', { rev: this.board.rev });
    },

    setScenario(scenario: ScenarioId) {
      socket.emit('scenario:set', { scenario });
    },

    // --- Collaboration signals ----------------------------------------------

    emitCursor(x: number, y: number) {
      socket.emit('cursor:move', { x, y });
    },

    emitDrag(widgetId: string | null) {
      socket.emit('drag:set', { widgetId });
    },

    // --- History scrubber ---------------------------------------------------

    setPaused(paused: boolean) {
      this.paused = paused;
      if (!paused) this.scrubOffset = 0;
    },

    setScrubOffset(offset: number) {
      this.scrubOffset = Math.max(0, Math.min(offset, MAX_POINTS - 1));
      this.paused = this.scrubOffset > 0 || this.paused;
    },

    /** Snap back to the live head. */
    goLive() {
      this.paused = false;
      this.scrubOffset = 0;
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
