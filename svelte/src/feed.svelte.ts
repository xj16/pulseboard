/**
 * The live feed, exposed as a Svelte 5 rune-based reactive store.
 *
 * This is the Svelte counterpart to the Vue Pinia store: it subscribes to the
 * exact same Socket.IO server and keeps rolling per-metric series. Proving that
 * the PulseBoard backend is framework-agnostic is the whole point of this build.
 */

import { io, type Socket } from 'socket.io-client';
import type {
  HelloPayload,
  MetricId,
  MetricMeta,
  Sample,
  ScenarioId,
  Tick,
} from './protocol';

const MAX_POINTS = 90;

/** Derive the room slug from the URL so the Svelte view can join a shared board. */
function roomFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('room');
  if (q) return q;
  const m = window.location.pathname.match(/^\/b\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : 'main';
}

class Feed {
  connected = $state(false);
  presence = $state(0);
  room = $state('main');
  scenario = $state<ScenarioId>('calm');
  metrics = $state<MetricMeta[]>([]);
  series = $state<Record<string, Sample[]>>({});
  latest = $state<Record<string, number>>({});

  private socket: Socket;

  constructor() {
    const url = import.meta.env.VITE_SERVER_URL ?? '';
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      query: { room: roomFromLocation() },
    });

    this.socket.on('connect', () => (this.connected = true));
    this.socket.on('disconnect', () => (this.connected = false));

    this.socket.on('hello', (payload: HelloPayload) => {
      this.metrics = payload.metrics;
      this.series = { ...payload.history };
      this.presence = payload.presence;
      this.room = payload.room;
      this.scenario = payload.scenario;
      for (const m of payload.metrics) {
        const h = payload.history[m.id];
        this.latest[m.id] = h?.length ? h[h.length - 1].v : 0;
      }
    });

    this.socket.on('scenario:update', (scenario: ScenarioId) => {
      this.scenario = scenario;
    });

    this.socket.on('tick', (tick: Tick) => {
      const next = { ...this.series };
      for (const m of this.metrics) {
        const v = tick.values[m.id];
        if (v === undefined) continue;
        this.latest[m.id] = v;
        const buf = (next[m.id] ?? []).concat({ t: tick.t, v });
        next[m.id] = buf.length > MAX_POINTS ? buf.slice(-MAX_POINTS) : buf;
      }
      this.series = next;
    });

    this.socket.on('presence', (count: number) => (this.presence = count));
  }

  seriesFor(id: MetricId): Sample[] {
    return this.series[id] ?? [];
  }

  latestFor(id: MetricId): number {
    return this.latest[id] ?? 0;
  }
}

export const feed = new Feed();
