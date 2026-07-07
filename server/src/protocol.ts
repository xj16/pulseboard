/**
 * Shared wire protocol between the PulseBoard server and any client
 * (the Vue flagship app and the Svelte parity build both consume this).
 *
 * This file is the single source of truth for the shape of every event
 * that crosses the Socket.IO boundary. The clients keep their own copy of
 * these types; keeping them small and dependency-free makes that trivial.
 */

/** Identifiers for every metric stream produced by the simulator. */
export type MetricId =
  | 'requests_per_sec'
  | 'active_users'
  | 'error_rate'
  | 'cpu_load'
  | 'revenue'
  | 'latency_ms';

/** All valid metric ids, for runtime validation of untrusted payloads. */
export const METRIC_IDS: readonly MetricId[] = [
  'requests_per_sec',
  'active_users',
  'error_rate',
  'cpu_load',
  'revenue',
  'latency_ms',
];

/** Static description of a metric — sent once on connect. */
export interface MetricMeta {
  id: MetricId;
  /** Human-friendly label for widget titles. */
  label: string;
  /** Unit suffix, e.g. "req/s", "%", "ms", "$". */
  unit: string;
  /** Suggested chart color (hex). Clients may override. */
  color: string;
  /** Soft minimum for gauge widgets. */
  min: number;
  /** Soft maximum for gauge widgets. */
  max: number;
  /** How many decimal places to render. */
  precision: number;
}

/** A single time-stamped sample for one metric. */
export interface Sample {
  /** Epoch milliseconds. */
  t: number;
  /** The value at time t. */
  v: number;
}

/** A batch of the latest sample for every metric, emitted each tick. */
export interface Tick {
  /** Epoch milliseconds of this tick. */
  t: number;
  /** Latest value per metric id. */
  values: Record<MetricId, number>;
}

/** Widget kinds the dashboard can render. */
export type WidgetKind = 'line' | 'area' | 'gauge' | 'stat' | 'bar';

/** All valid widget kinds, for runtime validation of untrusted payloads. */
export const WIDGET_KINDS: readonly WidgetKind[] = [
  'line',
  'area',
  'gauge',
  'stat',
  'bar',
];

/** A placed widget on the collaborative board. */
export interface Widget {
  id: string;
  kind: WidgetKind;
  metric: MetricId;
  title: string;
  /** Grid column start (1-based). */
  x: number;
  /** Grid row start (1-based). */
  y: number;
  /** Width in grid columns. */
  w: number;
  /** Height in grid rows. */
  h: number;
  /**
   * Optional threshold: when the widget's live metric crosses this value the
   * card flips into an alert state. `dir` decides whether high or low breaches.
   */
  threshold?: { value: number; dir: 'above' | 'below' } | null;
}

/** The full collaborative board layout, shared by all clients in a room. */
export interface BoardState {
  /** Monotonic revision — bumped on every mutation for conflict detection. */
  rev: number;
  widgets: Widget[];
}

/** A connected participant, assigned a stable identity on join. */
export interface Peer {
  id: string;
  /** Friendly generated handle, e.g. "Teal Otter". */
  name: string;
  /** Hex color used for this peer's cursor and drag rings. */
  color: string;
}

/** Where a peer's pointer is, in grid-normalized coords (0..1 of the grid box). */
export interface CursorPos {
  id: string;
  /** 0..1 fraction across the grid width. */
  x: number;
  /** 0..1 fraction down the grid height. */
  y: number;
}

/** Announces that a peer has grabbed (or released) a widget. */
export interface DragState {
  /** Peer holding the widget. */
  peerId: string;
  /** Widget being dragged, or null to release. */
  widgetId: string | null;
}

/** Named simulator scenarios that bias the world for a scripted demo moment. */
export type ScenarioId = 'calm' | 'traffic-spike' | 'incident' | 'deploy-blip';

export const SCENARIO_IDS: readonly ScenarioId[] = [
  'calm',
  'traffic-spike',
  'incident',
  'deploy-blip',
];

/** Snapshot sent to a client immediately after it joins. */
export interface HelloPayload {
  /** The room this client joined. */
  room: string;
  /** The identity the server assigned to this client. */
  self: Peer;
  /** Everyone currently in the room (including self). */
  peers: Peer[];
  /** All metric metadata, keyed by id. */
  metrics: MetricMeta[];
  /** Recent history per metric so charts render instantly (not empty). */
  history: Record<MetricId, Sample[]>;
  /** Current shared board layout. */
  board: BoardState;
  /** Number of clients currently connected to the room. */
  presence: number;
  /** Milliseconds between simulator ticks. */
  tickMs: number;
  /** The active simulator scenario. */
  scenario: ScenarioId;
}

/** Sent when a mutation is rejected because the client's rev was stale. */
export interface RejectedPayload {
  /** Why the mutation was refused. */
  reason: 'stale-rev' | 'rate-limited' | 'invalid' | 'capacity';
  /** The fresh authoritative board so the client can rebase. */
  board: BoardState;
  /** Human-readable explanation for surfacing in the UI. */
  message: string;
}

/* ------------------------------------------------------------------ *
 * Typed Socket.IO event maps.
 * ------------------------------------------------------------------ */

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  hello: (payload: HelloPayload) => void;
  tick: (tick: Tick) => void;
  'board:update': (board: BoardState) => void;
  'board:rejected': (payload: RejectedPayload) => void;
  presence: (count: number) => void;
  'peers:update': (peers: Peer[]) => void;
  'cursor:update': (cursor: CursorPos) => void;
  'drag:update': (drag: DragState) => void;
  'scenario:update': (scenario: ScenarioId) => void;
}

/**
 * Board mutations carry the client's last-known `rev` so the server can reject
 * a mutation that raced against someone else's change (optimistic concurrency).
 */
export interface RevStamped {
  /** The board rev the client believed was current when it acted. */
  rev: number;
}

/** Events clients emit to the server. */
export interface ClientToServerEvents {
  'board:addWidget': (widget: Omit<Widget, 'id'> & Partial<RevStamped>) => void;
  'board:moveWidget': (
    payload: { id: string; x: number; y: number } & Partial<RevStamped>,
  ) => void;
  'board:resizeWidget': (
    payload: { id: string; w: number; h: number } & Partial<RevStamped>,
  ) => void;
  'board:removeWidget': (payload: { id: string } & Partial<RevStamped>) => void;
  'board:updateWidget': (
    payload: {
      id: string;
      kind?: WidgetKind;
      metric?: MetricId;
      title?: string;
      threshold?: { value: number; dir: 'above' | 'below' } | null;
    } & Partial<RevStamped>,
  ) => void;
  'board:reset': (payload?: Partial<RevStamped>) => void;
  'cursor:move': (payload: { x: number; y: number }) => void;
  'drag:set': (payload: { widgetId: string | null }) => void;
  'scenario:set': (payload: { scenario: ScenarioId }) => void;
}

/** Per-socket data attached by the server (identity + room). */
export interface SocketData {
  peer: Peer;
  room: string;
}
