<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import { formatValue } from '../format';
import type { MetricId } from '../protocol';

const props = defineProps<{ metric: MetricId }>();
const store = useDashboardStore();

const meta = computed(() => store.metricById(props.metric));
const value = computed(() => store.latestFor(props.metric));

const series = computed(() => store.viewSeriesFor(props.metric));
// Trend vs the value ~10 ticks ago.
const trend = computed(() => {
  const s = series.value;
  if (s.length < 2) return 0;
  const prev = s[Math.max(0, s.length - 10)].v;
  if (prev === 0) return 0;
  return ((value.value - prev) / prev) * 100;
});

const display = computed(() => formatValue(value.value, meta.value));
</script>

<template>
  <div class="stat">
    <div class="stat__value" :style="{ color: meta?.color }">
      {{ display }}<span class="stat__unit">{{ meta?.unit }}</span>
    </div>
    <div
      class="stat__trend"
      :class="{ up: trend > 0.5, down: trend < -0.5 }"
      :title="'Change vs ~10 ticks ago'"
    >
      <span v-if="trend > 0.5">▲</span>
      <span v-else-if="trend < -0.5">▼</span>
      <span v-else>▬</span>
      {{ Math.abs(trend).toFixed(1) }}%
    </div>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  gap: 0.35rem;
}
.stat__value {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat__unit {
  font-size: 0.85rem;
  font-weight: 500;
  opacity: 0.6;
  margin-left: 0.25rem;
}
.stat__trend {
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.stat__trend.up {
  color: #22c55e;
}
.stat__trend.down {
  color: #ef4444;
}
</style>
