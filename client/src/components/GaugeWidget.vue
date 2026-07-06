<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import { formatValue } from '../format';
import type { MetricId } from '../protocol';

const props = defineProps<{ metric: MetricId }>();
const store = useDashboardStore();

const meta = computed(() => store.metricById(props.metric));
const value = computed(() => store.latestFor(props.metric));

const fraction = computed(() => {
  const m = meta.value;
  if (!m) return 0;
  const range = m.max - m.min || 1;
  return Math.min(1, Math.max(0, (value.value - m.min) / range));
});

// Half-circle gauge geometry.
const RADIUS = 52;
const CIRCUMFERENCE = Math.PI * RADIUS; // half circle
const dash = computed(
  () => `${fraction.value * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
);

// Color shifts from the metric color toward red as it approaches max.
const arcColor = computed(() => {
  if (fraction.value > 0.85) return '#ef4444';
  if (fraction.value > 0.7) return '#f59e0b';
  return meta.value?.color ?? '#3b82f6';
});
</script>

<template>
  <div class="gauge">
    <svg viewBox="0 0 120 70" class="gauge__svg">
      <path
        d="M 8 62 A 52 52 0 0 1 112 62"
        fill="none"
        stroke="rgba(148,163,184,0.18)"
        stroke-width="9"
        stroke-linecap="round"
      />
      <path
        d="M 8 62 A 52 52 0 0 1 112 62"
        fill="none"
        :stroke="arcColor"
        stroke-width="9"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        class="gauge__arc"
      />
    </svg>
    <div class="gauge__label" :style="{ color: arcColor }">
      {{ formatValue(value, meta) }}<span class="gauge__unit">{{ meta?.unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.gauge__svg {
  width: 100%;
  max-width: 180px;
}
.gauge__arc {
  transition: stroke-dasharray 0.4s ease;
}
.gauge__label {
  font-size: clamp(1.2rem, 3.5vw, 1.8rem);
  font-weight: 700;
  margin-top: -0.5rem;
  font-variant-numeric: tabular-nums;
}
.gauge__unit {
  font-size: 0.8rem;
  opacity: 0.6;
  margin-left: 0.2rem;
}
</style>
