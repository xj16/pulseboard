/**
 * A composable that binds a Chart.js instance to a reactive series and keeps
 * it updated in place (no full re-render per tick — we mutate the dataset and
 * call `update('none')` for smooth, cheap live charts).
 */

import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  type ChartType,
} from 'chart.js';
import type { Sample } from '../protocol';

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
);

export interface LiveChartOptions {
  kind: 'line' | 'area' | 'bar';
  color: string;
  /** How many trailing points to show. */
  window?: number;
}

export function useLiveChart(
  canvas: Ref<HTMLCanvasElement | null>,
  series: () => Sample[],
  options: LiveChartOptions,
) {
  let chart: Chart | null = null;
  const window = options.window ?? 60;

  function build() {
    if (!canvas.value) return;
    const type: ChartType = options.kind === 'bar' ? 'bar' : 'line';
    const fill = options.kind === 'area';

    chart = new Chart(canvas.value, {
      type,
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: options.color,
            backgroundColor: fill
              ? hexToRgba(options.color, 0.18)
              : options.kind === 'bar'
                ? hexToRgba(options.color, 0.7)
                : options.color,
            borderWidth: 2,
            fill,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: {
            display: false,
            grid: { display: false },
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.12)' },
            ticks: {
              color: 'rgba(148, 163, 184, 0.8)',
              maxTicksLimit: 4,
              font: { size: 10 },
            },
          },
        },
      },
    });
    sync();
  }

  function sync() {
    if (!chart) return;
    const pts = series().slice(-window);
    chart.data.labels = pts.map((p) => formatTime(p.t));
    chart.data.datasets[0].data = pts.map((p) => p.v);
    chart.update('none');
  }

  onMounted(build);
  watch(series, sync, { deep: true });
  onBeforeUnmount(() => {
    chart?.destroy();
    chart = null;
  });

  return { sync };
}

function formatTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
