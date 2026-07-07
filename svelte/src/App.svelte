<script lang="ts">
  import { feed } from './feed.svelte';
  import Sparkline from './Sparkline.svelte';

  function format(v: number, precision: number): string {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return v.toFixed(precision);
  }
</script>

<main>
  <header>
    <div class="brand">
      <span class="mark">📈</span>
      <div>
        <h1>PulseBoard <span class="badge">Svelte</span></h1>
        <p>Same live server, rendered by Svelte 5 — framework parity demo.</p>
      </div>
    </div>
    <div class="status">
      <span class="pill" class:live={feed.connected}>
        <span class="dot"></span>{feed.connected ? 'Live' : 'Offline'}
      </span>
      <span class="pill">👥 {feed.presence}</span>
      <span class="pill" title="Active simulator scenario">🎬 {feed.scenario}</span>
      <a class="pill link" href="/">Open Vue app →</a>
    </div>
  </header>

  <section class="grid">
    {#each feed.metrics as m (m.id)}
      <article class="card" style={`--accent:${m.color}`}>
        <div class="card__head">
          <span class="card__dot"></span>
          <h2>{m.label}</h2>
        </div>
        <div class="card__value" style={`color:${m.color}`}>
          {format(feed.latestFor(m.id), m.precision)}<small>{m.unit}</small>
        </div>
        <Sparkline data={feed.seriesFor(m.id)} color={m.color} />
      </article>
    {/each}

    {#if feed.metrics.length === 0}
      <p class="empty">Connecting to the PulseBoard server…</p>
    {/if}
  </section>

  <footer>
    Data is fully simulated on the Node server. This minimal build exists to show
    the same feed drives Vue and Svelte identically.
  </footer>
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }
  .brand {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .mark {
    font-size: 2rem;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #ff3e00;
    color: #fff;
    padding: 0.15rem 0.4rem;
    border-radius: 6px;
  }
  .brand p {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .status {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.65rem;
    text-decoration: none;
  }
  .pill.link {
    color: var(--accent);
  }
  .pill.live {
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.4);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ef4444;
  }
  .pill.live .dot {
    background: #22c55e;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }
  .card__head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .card__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .card h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
  }
  .card__value {
    font-size: 2rem;
    font-weight: 700;
    margin: 0.5rem 0;
    font-variant-numeric: tabular-nums;
  }
  .card__value small {
    font-size: 0.8rem;
    opacity: 0.6;
    margin-left: 0.25rem;
  }
  .empty {
    color: var(--muted);
    grid-column: 1 / -1;
    text-align: center;
    padding: 3rem 0;
  }
  footer {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
