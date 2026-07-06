<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import type { Widget } from '../protocol';
import StatWidget from './StatWidget.vue';
import GaugeWidget from './GaugeWidget.vue';
import ChartWidget from './ChartWidget.vue';

const props = defineProps<{ widget: Widget }>();
const emit = defineEmits<{
  (e: 'drag-start', ev: PointerEvent): void;
  (e: 'resize-start', ev: PointerEvent): void;
}>();

const store = useDashboardStore();
const meta = computed(() => store.metricById(props.widget.metric));

function remove() {
  store.removeWidget(props.widget.id);
}
</script>

<template>
  <div class="widget" :style="{ '--accent': meta?.color }">
    <header class="widget__head" @pointerdown="emit('drag-start', $event)">
      <span class="widget__dot"></span>
      <h3 class="widget__title">{{ widget.title }}</h3>
      <span class="widget__kind">{{ widget.kind }}</span>
      <button
        class="widget__close"
        title="Remove widget"
        @pointerdown.stop
        @click="remove"
      >
        ×
      </button>
    </header>

    <div class="widget__body">
      <StatWidget v-if="widget.kind === 'stat'" :metric="widget.metric" />
      <GaugeWidget v-else-if="widget.kind === 'gauge'" :metric="widget.metric" />
      <ChartWidget v-else :metric="widget.metric" :kind="widget.kind" />
    </div>

    <div
      class="widget__resize"
      title="Drag to resize"
      @pointerdown.stop="emit('resize-start', $event)"
    ></div>
  </div>
</template>

<style scoped>
.widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: border-color 0.15s ease;
}
.widget:hover {
  border-color: color-mix(in srgb, var(--accent, var(--border)) 45%, var(--border));
}
.widget__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 92%, #000);
}
.widget__head:active {
  cursor: grabbing;
}
.widget__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, var(--muted));
  flex: none;
}
.widget__title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.widget__kind {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  margin-left: auto;
}
.widget__close {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
  border-radius: 4px;
}
.widget__close:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
.widget__body {
  flex: 1;
  min-height: 0;
  padding: 0.75rem;
}
.widget__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg,
    transparent 50%,
    var(--border) 50%,
    var(--border) 60%,
    transparent 60%,
    transparent 72%,
    var(--border) 72%,
    var(--border) 82%,
    transparent 82%
  );
}
</style>
