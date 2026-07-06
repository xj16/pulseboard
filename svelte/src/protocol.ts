/**
 * Client-side mirror of the PulseBoard wire protocol (see
 * `server/src/protocol.ts`). Kept minimal and dependency-free.
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

export interface HelloPayload {
  metrics: MetricMeta[];
  history: Record<MetricId, Sample[]>;
  board: { rev: number; widgets: unknown[] };
  presence: number;
  tickMs: number;
}
