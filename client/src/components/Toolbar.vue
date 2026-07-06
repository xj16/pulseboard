<script setup lang="ts">
import { ref } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import type { MetricId, WidgetKind } from '../protocol';

const store = useDashboardStore();

const kind = ref<WidgetKind>('line');
const metric = ref<MetricId>('requests_per_sec');

const kinds: { value: WidgetKind; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'bar', label: 'Bar' },
  { value: 'stat', label: 'Stat' },
  { value: 'gauge', label: 'Gauge' },
];

function add() {
  store.addWidget(kind.value, metric.value);
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar__group">
      <label class="field">
        <span>Widget</span>
        <select v-model="kind">
          <option v-for="k in kinds" :key="k.value" :value="k.value">
            {{ k.label }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>Metric</span>
        <select v-model="metric">
          <option v-for="m in store.metrics" :key="m.id" :value="m.id">
            {{ m.label }}
          </option>
        </select>
      </label>

      <button class="btn btn--primary" @click="add">+ Add widget</button>
      <button class="btn" title="Restore the default layout" @click="store.resetBoard()">
        Reset
      </button>
    </div>

    <div class="toolbar__status">
      <span class="pill" :class="{ live: store.connected }">
        <span class="pill__dot"></span>
        {{ store.connected ? 'Live' : 'Offline' }}
      </span>
      <span class="pill" title="People viewing this board">
        👥 {{ store.presence }}
      </span>
      <span class="pill" title="Board revision">rev {{ store.board.rev }}</span>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.toolbar__group,
.toolbar__status {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font-size: 0.85rem;
  min-width: 8rem;
}
.btn {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-end;
}
.btn:hover {
  border-color: var(--accent);
}
.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #04121f;
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
}
.pill.live {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.4);
}
.pill__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
}
.pill.live .pill__dot {
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
  animation: pulse 1.6s infinite;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}
</style>
