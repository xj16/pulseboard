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
}

/** The full collaborative board layout, shared by all clients in a room. */
export interface BoardState {
  /** Monotonic revision — bumped on every mutation for conflict detection. */
  rev: number;
  widgets: Widget[];
}

/** Snapshot sent to a client immediately after it joins. */
export interface HelloPayload {
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
}

/* ------------------------------------------------------------------ *
 * Typed Socket.IO event maps.
 * ------------------------------------------------------------------ */

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  hello: (payload: HelloPayload) => void;
  tick: (tick: Tick) => void;
  'board:update': (board: BoardState) => void;
  presence: (count: number) => void;
}

/** Events clients emit to the server. */
export interface ClientToServerEvents {
  'board:addWidget': (widget: Omit<Widget, 'id'>) => void;
  'board:moveWidget': (payload: { id: string; x: number; y: number }) => void;
  'board:resizeWidget': (payload: { id: string; w: number; h: number }) => void;
  'board:removeWidget': (payload: { id: string }) => void;
  'board:reset': () => void;
}
