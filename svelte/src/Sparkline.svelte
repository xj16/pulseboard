<script lang="ts">
  import type { Sample } from './protocol';

  let {
    data = [],
    color = '#38bdf8',
    fill = true,
    width = 300,
    height = 60,
  }: {
    data?: Sample[];
    color?: string;
    fill?: boolean;
    width?: number;
    height?: number;
  } = $props();

  // Build an SVG polyline path from the samples, scaled to the viewBox.
  const path = $derived.by(() => {
    if (data.length < 2) return { line: '', area: '' };
    const values = data.map((d) => d.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = width / (data.length - 1);

    const pts = data.map((d, i) => {
      const x = i * stepX;
      const y = height - ((d.v - min) / span) * (height - 6) - 3;
      return [x, y] as const;
    });

    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  });
</script>

<svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" class="spark">
  {#if fill && path.area}
    <path d={path.area} fill={color} opacity="0.15" />
  {/if}
  {#if path.line}
    <path d={path.line} fill="none" stroke={color} stroke-width="2" vector-effect="non-scaling-stroke" />
  {/if}
</svg>

<style>
  .spark {
    width: 100%;
    height: 60px;
    display: block;
  }
</style>
