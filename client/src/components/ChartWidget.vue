<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import { useLiveChart } from '../composables/useLiveChart';
import type { MetricId, WidgetKind } from '../protocol';

const props = defineProps<{ metric: MetricId; kind: WidgetKind }>();
const store = useDashboardStore();

const canvas = ref<HTMLCanvasElement | null>(null);
const meta = computed(() => store.metricById(props.metric));

// Map widget kind to a chart kind (only line/area/bar reach this component).
const chartKind = computed<'line' | 'area' | 'bar'>(() =>
  props.kind === 'area' ? 'area' : props.kind === 'bar' ? 'bar' : 'line',
);

useLiveChart(canvas, () => store.viewSeriesFor(props.metric), {
  kind: chartKind.value,
  color: meta.value?.color ?? '#3b82f6',
  window: chartKind.value === 'bar' ? 24 : 60,
});
</script>

<template>
  <div class="chart">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}
canvas {
  width: 100% !important;
  height: 100% !important;
}
</style>
