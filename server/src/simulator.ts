/**
 * The built-in data simulator.
 *
 * PulseBoard needs NO paid data feed. Instead this module synthesizes six
 * plausibly-correlated operational metrics using bounded random walks with
 * mean reversion, a slow sinusoidal "time of day" component, and occasional
 * spikes. The output looks like a real telemetry stream but is fully local
 * and deterministic enough to be testable.
 */

import type { MetricId, MetricMeta, Sample, ScenarioId } from './protocol.js';

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

/**
 * How a named scenario biases the world. `driverBias` nudges the traffic
 * driver's target up or down (fraction of its range); `couplingGain` amplifies
 * how hard traffic drags downstream metrics; `spikeRate` overrides the chance
 * of a per-tick spike; `spikeMetrics` (when set) restricts spikes to a subset,
 * so e.g. a "deploy blip" only jolts errors + latency, not revenue.
 */
interface ScenarioConfig {
  driverBias: number;
  couplingGain: number;
  spikeRate: number;
  spikeMetrics?: MetricId[];
  /** Extra positive-only spike magnitude bias for the affected metrics. */
  spikeUpward?: boolean;
}

export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  // Quiet, well-behaved system — low volatility, almost no spikes.
  calm: { driverBias: -0.1, couplingGain: 0.8, spikeRate: 0.003 },
  // Sustained traffic surge — driver pushed high, strong downstream coupling.
  'traffic-spike': { driverBias: 0.32, couplingGain: 1.35, spikeRate: 0.02 },
  // Something is on fire — errors + latency + cpu jolt upward, frequently.
  incident: {
    driverBias: 0.1,
    couplingGain: 1.5,
    spikeRate: 0.06,
    spikeMetrics: ['error_rate', 'latency_ms', 'cpu_load'],
    spikeUpward: true,
  },
  // A bad deploy: a brief, sharp error/latency blip against a normal baseline.
  'deploy-blip': {
    driverBias: 0,
    couplingGain: 1.1,
    spikeRate: 0.04,
    spikeMetrics: ['error_rate', 'latency_ms'],
    spikeUpward: true,
  },
};

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
  /** Initial named scenario. Defaults to 'calm'. */
  scenario?: ScenarioId;
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
  private scenario: ScenarioId = 'calm';

  constructor(options: SimulatorOptions = {}) {
    this.tickMs = options.tickMs ?? 1000;
    this.historyLength = options.historyLength ?? 120;
    this.rand = mulberry32(options.seed ?? (Date.now() & 0xffffffff));
    if (options.scenario) this.scenario = options.scenario;

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

  /** The currently active scenario. */
  getScenario(): ScenarioId {
    return this.scenario;
  }

  /** Switch the active scenario. Takes effect from the next tick. */
  setScenario(scenario: ScenarioId): void {
    this.scenario = scenario;
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
    const cfg = SCENARIOS[this.scenario];

    // Requests-per-sec acts as the "driver": high traffic pushes CPU,
    // latency and errors up. We compute it first, then couple the rest.
    // The scenario's driverBias nudges the driver's own target so a
    // "traffic-spike" run genuinely lifts the whole coupled system.
    const rps = this.step('requests_per_sec', now, cfg.driverBias * 2);
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
    const g = cfg.couplingGain;

    values.active_users = this.step('active_users', now, loadDeviation * 0.4 * g);
    values.cpu_load = this.step('cpu_load', now, loadDeviation * 0.55 * g);
    values.latency_ms = this.step('latency_ms', now, loadDeviation * 0.6 * g);
    values.error_rate = this.step('error_rate', now, loadDeviation * 0.5 * g);
    values.revenue = this.step('revenue', now, loadDeviation * 0.45 * g);
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

    // Spike behaviour is scenario-dependent. By default a rare (~1.5%) spike
    // that can go either way; under an "incident"/"deploy-blip" it is more
    // frequent, restricted to the affected metrics, and biased upward so the
    // fault visibly propagates (errors/latency jump, not dip).
    const cfg = SCENARIOS[this.scenario];
    const spikeAllowed =
      !cfg.spikeMetrics || cfg.spikeMetrics.includes(id);
    let spike = 0;
    if (spikeAllowed && this.rand() < cfg.spikeRate) {
      const bias = cfg.spikeUpward ? 0.15 : -0.3;
      spike = (this.rand() + bias) * range * 0.5;
    }

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
