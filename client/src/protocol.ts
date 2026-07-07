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
  threshold?: { value: number; dir: 'above' | 'below' } | null;
}

export interface BoardState {
  rev: number;
  widgets: Widget[];
}

export interface Peer {
  id: string;
  name: string;
  color: string;
}

export interface CursorPos {
  id: string;
  x: number;
  y: number;
}

export interface DragState {
  peerId: string;
  widgetId: string | null;
}

export type ScenarioId = 'calm' | 'traffic-spike' | 'incident' | 'deploy-blip';

export interface HelloPayload {
  room: string;
  self: Peer;
  peers: Peer[];
  metrics: MetricMeta[];
  history: Record<MetricId, Sample[]>;
  board: BoardState;
  presence: number;
  tickMs: number;
  scenario: ScenarioId;
}

export interface RejectedPayload {
  reason: 'stale-rev' | 'rate-limited' | 'invalid' | 'capacity';
  board: BoardState;
  message: string;
}

export interface RevStamped {
  rev: number;
}

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

export const GRID_COLUMNS = 12;

/** Human labels for the named simulator scenarios. */
export const SCENARIOS: { id: ScenarioId; label: string; blurb: string }[] = [
  { id: 'calm', label: 'Calm', blurb: 'Quiet, well-behaved system' },
  { id: 'traffic-spike', label: 'Traffic spike', blurb: 'Sustained load surge' },
  { id: 'incident', label: 'Incident', blurb: 'Errors + latency on fire' },
  { id: 'deploy-blip', label: 'Deploy blip', blurb: 'Brief bad-deploy jolt' },
];
