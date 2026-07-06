/**
 * Client-side mirror of the server wire protocol.
 * Kept in sync manually with `server/src/protocol.ts` — it is intentionally
 * dependency-free so it can be copied across the workspace boundary.
 */

export type MetricId =
  | 'requests_per_sec'
  | 'active_users'
  | 'error_rate'
  | 'cpu_load'
  | 'revenue'
  | 'latency_ms';

export interface MetricMeta {
  id: MetricId;
  label: string;
  unit: string;
  color: string;
  min: number;
  max: number;
  precision: number;
}

export interface Sample {
  t: number;
  v: number;
}

export interface Tick {
  t: number;
  values: Record<MetricId, number>;
}

export type WidgetKind = 'line' | 'area' | 'gauge' | 'stat' | 'bar';

export interface Widget {
  id: string;
  kind: WidgetKind;
  metric: MetricId;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardState {
  rev: number;
  widgets: Widget[];
}

export interface HelloPayload {
  metrics: MetricMeta[];
  history: Record<MetricId, Sample[]>;
  board: BoardState;
  presence: number;
  tickMs: number;
}

export interface ServerToClientEvents {
  hello: (payload: HelloPayload) => void;
  tick: (tick: Tick) => void;
  'board:update': (board: BoardState) => void;
  presence: (count: number) => void;
}

export interface ClientToServerEvents {
  'board:addWidget': (widget: Omit<Widget, 'id'>) => void;
  'board:moveWidget': (payload: { id: string; x: number; y: number }) => void;
  'board:resizeWidget': (payload: { id: string; w: number; h: number }) => void;
  'board:removeWidget': (payload: { id: string }) => void;
  'board:reset': () => void;
}

export const GRID_COLUMNS = 12;
