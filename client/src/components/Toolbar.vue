<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import { SCENARIOS, type MetricId, type ScenarioId, type WidgetKind } from '../protocol';

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

function onScenario(e: Event) {
  store.setScenario((e.target as HTMLSelectElement).value as ScenarioId);
}

// Up to 4 avatars in the stack; the rest collapse into a "+N".
const shownPeers = computed(() => store.peers.slice(0, 4));
const overflow = computed(() => Math.max(0, store.peers.length - shownPeers.value.length));

const copied = ref(false);
async function shareRoom() {
  const url = `${window.location.origin}/?room=${encodeURIComponent(store.room)}`;
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    store.pushNotice('info', `Share this link: ${url}`);
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
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

      <label class="field field--scenario">
        <span>Scenario</span>
        <select :value="store.scenario" @change="onScenario">
          <option v-for="s in SCENARIOS" :key="s.id" :value="s.id" :title="s.blurb">
            {{ s.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="toolbar__status">
      <span class="pill" :class="{ live: store.connected }">
        <span class="pill__dot"></span>
        {{ store.connected ? 'Live' : 'Offline' }}
      </span>

      <!-- Avatar stack replaces the bare presence count. -->
      <div class="peers" :title="`${store.presence} viewing this board`">
        <span
          v-for="p in shownPeers"
          :key="p.id"
          class="avatar"
          :class="{ 'avatar--self': p.id === store.self?.id }"
          :style="{ background: p.color }"
          :title="p.id === store.self?.id ? `${p.name} (you)` : p.name"
        >
          {{ initials(p.name) }}
        </span>
        <span v-if="overflow > 0" class="avatar avatar--more">+{{ overflow }}</span>
      </div>

      <button class="pill pill--btn" title="Copy a shareable link to this room" @click="shareRoom">
        🔗 {{ copied ? 'Copied!' : store.room }}
      </button>

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
.pill--btn {
  cursor: pointer;
  background: var(--bg);
  color: var(--text);
  font-weight: 600;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill--btn:hover {
  border-color: var(--accent);
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
.peers {
  display: flex;
  align-items: center;
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.62rem;
  font-weight: 700;
  color: #04121f;
  border: 2px solid var(--panel);
  margin-left: -8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.avatar:first-child {
  margin-left: 0;
}
.avatar--self {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.avatar--more {
  background: var(--border);
  color: var(--text);
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
