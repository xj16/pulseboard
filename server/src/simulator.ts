/**
 * The built-in data simulator.
 *
 * PulseBoard needs NO paid data feed. Instead this module synthesizes six
 * plausibly-correlated operational metrics using bounded random walks with
 * mean reversion, a slow sinusoidal "time of day" component, and occasional
 * spikes. The output looks like a real telemetry stream but is fully local
 * and deterministic enough to be testable.
 */

import type { MetricId, MetricMeta, Sample } from './protocol.js';

/** Static metadata for every simulated metric. */
export const METRICS: MetricMeta[] = [
  {
    id: 'requests_per_sec',
    label: 'Requests / sec',
    unit: 'req/s',
    color: '#3b82f6',
    min: 0,
    max: 5000,
    precision: 0,
  },
  {
    id: 'active_users',
    label: 'Active Users',
    unit: 'users',
    color: '#10b981',
    min: 0,
    max: 12000,
    precision: 0,
  },
  {
    id: 'error_rate',
    label: 'Error Rate',
    unit: '%',
    color: '#ef4444',
    min: 0,
    max: 12,
    precision: 2,
  },
  {
    id: 'cpu_load',
    label: 'CPU Load',
    unit: '%',
    color: '#f59e0b',
    min: 0,
    max: 100,
    precision: 1,
  },
  {
    id: 'revenue',
    label: 'Revenue / min',
    unit: '$',
    color: '#8b5cf6',
    min: 0,
    max: 8000,
    precision: 0,
  },
  {
    id: 'latency_ms',
    label: 'p95 Latency',
    unit: 'ms',
    color: '#06b6d4',
    min: 0,
    max: 800,
    precision: 0,
  },
];

/** Internal per-metric state used to evolve the walk. */
interface StreamState {
  meta: MetricMeta;
  value: number;
  /** Baseline the value reverts toward (mid of range by default). */
  center: number;
  /** How strongly the value pulls back to center (0..1). */
  reversion: number;
  /** Std-dev of the per-tick gaussian step, as a fraction of range. */
  volatility: number;
  /** Phase offset for the daily sine component. */
  phase: number;
  /** Amplitude of the daily sine, as a fraction of range. */
  seasonAmp: number;
}

/** A tiny seeded PRNG (mulberry32) so runs can be made reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform for a standard normal from two uniforms. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round(x: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(x * f) / f;
}

export interface SimulatorOptions {
  /** Milliseconds between ticks. Defaults to 1000. */
  tickMs?: number;
  /** Number of historical samples to retain per metric. Defaults to 120. */
  historyLength?: number;
  /** PRNG seed. Defaults to a value derived from the current time. */
  seed?: number;
}

/**
 * Generates correlated metric streams. Call {@link tick} on an interval to
 * advance the world; read {@link history} to seed a newly-connected client.
 */
export class Simulator {
  readonly tickMs: number;
  private readonly historyLength: number;
  private readonly rand: () => number;
  private readonly streams = new Map<MetricId, StreamState>();
  private readonly buffers = new Map<MetricId, Sample[]>();

  constructor(options: SimulatorOptions = {}) {
    this.tickMs = options.tickMs ?? 1000;
    this.historyLength = options.historyLength ?? 120;
    this.rand = mulberry32(options.seed ?? (Date.now() & 0xffffffff));

    for (const meta of METRICS) {
      const range = meta.max - meta.min;
      const center = meta.min + range * 0.45;
      this.streams.set(meta.id, {
        meta,
        value: center,
        center,
        reversion: 0.05,
        volatility: 0.03,
        phase: this.rand() * Math.PI * 2,
        seasonAmp: 0.18,
      });
      this.buffers.set(meta.id, []);
    }

    // Pre-fill history so the very first client sees populated charts.
    this.prefillHistory();
  }

  /** Retained history for a metric (oldest first). */
  history(id: MetricId): Sample[] {
    return this.buffers.get(id) ?? [];
  }

  /** Full history keyed by metric id — used to build the hello snapshot. */
  allHistory(): Record<MetricId, Sample[]> {
    const out = {} as Record<MetricId, Sample[]>;
    for (const meta of METRICS) {
      out[meta.id] = this.history(meta.id);
    }
    return out;
  }

  /**
   * Advance every stream by one step, append to history, and return the
   * latest value for each metric keyed by id.
   */
  tick(now: number = Date.now()): Record<MetricId, number> {
    const values = {} as Record<MetricId, number>;
    // Requests-per-sec acts as the "driver": high traffic pushes CPU,
    // latency and errors up. We compute it first, then couple the rest.
    const rps = this.step('requests_per_sec', now, 0);
    values.requests_per_sec = rps;

    const rpsMeta = this.streams.get('requests_per_sec')!.meta;
    // Traffic pressure as a *deviation* from the driver's own baseline, in
    // roughly [-1, 1]. Positive means "busier than usual", which should push
    // downstream metrics above their center; negative pulls them below. This
    // is what keeps the coupled streams from saturating at max — the nudge is
    // zero-centered, not a constant additive push.
    const driverCenterFraction = 0.45;
    const loadDeviation =
      (rps / rpsMeta.max - driverCenterFraction) / (1 - driverCenterFraction);

    values.active_users = this.step('active_users', now, loadDeviation * 0.4);
    values.cpu_load = this.step('cpu_load', now, loadDeviation * 0.55);
    values.latency_ms = this.step('latency_ms', now, loadDeviation * 0.6);
    values.error_rate = this.step('error_rate', now, loadDeviation * 0.5);
    values.revenue = this.step('revenue', now, loadDeviation * 0.45);
    return values;
  }

  /**
   * Evolve one stream one step. `coupling` is a zero-centered signal (roughly
   * [-1, 1]) from the traffic driver: it shifts this stream's effective target
   * up or down as a fraction of its range, without accumulating.
   */
  private step(id: MetricId, now: number, coupling: number): number {
    const s = this.streams.get(id)!;
    const range = s.meta.max - s.meta.min;

    // The coupling moves the target this stream reverts toward, capped so a
    // busy period lifts it toward (but not past) the top of its range.
    const couplingShift = clamp(coupling, -1, 1) * range * 0.35;
    const target = clamp(s.center + couplingShift, s.meta.min, s.meta.max);

    // Mean reversion toward the (possibly load-shifted) target.
    const pull = (target - s.value) * s.reversion;

    // Daily seasonality: a slow sine over a simulated 24h cycle.
    const dayFraction = ((now / 1000) % 86400) / 86400;
    const season =
      Math.sin(dayFraction * Math.PI * 2 + s.phase) * s.seasonAmp * range;

    // Random gaussian shock.
    const shock = gaussian(this.rand) * s.volatility * range;

    // Rare spike (~1.5% of ticks) that decays via reversion afterward.
    const spike = this.rand() < 0.015 ? (this.rand() - 0.3) * range * 0.5 : 0;

    let next = s.value + pull + shock + spike;
    // Blend the seasonal + load target in gently so it shapes the baseline.
    next = next * 0.9 + (target + season) * 0.1;

    s.value = clamp(next, s.meta.min, s.meta.max);

    const sample: Sample = { t: now, v: round(s.value, s.meta.precision) };
    const buf = this.buffers.get(id)!;
    buf.push(sample);
    if (buf.length > this.historyLength) buf.shift();

    return sample.v;
  }

  /** Walk backwards to synthesize a believable pre-connect history. */
  private prefillHistory(): void {
    const start = Date.now() - this.historyLength * this.tickMs;
    for (let i = 0; i < this.historyLength; i++) {
      this.tick(start + i * this.tickMs);
    }
  }
}
