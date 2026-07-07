<script setup lang="ts">
/**
 * A live/pause + time-travel scrubber for the whole dashboard.
 *
 * The server already retains recent history per metric; this control lets a
 * viewer freeze the feed and scrub backward through it, with a LIVE snap-back
 * button. It reuses data the client already holds — no extra transport.
 */
import { computed } from 'vue';
import { useDashboardStore } from '../store/dashboard';

const store = useDashboardStore();

const maxOffset = computed(() => Math.max(0, store.historyLength - 1));

// The slider runs newest→oldest as offset grows; we invert so dragging left
// goes back in time, which reads naturally.
const sliderValue = computed({
  get: () => maxOffset.value - store.scrubOffset,
  set: (v: number) => store.setScrubOffset(maxOffset.value - Number(v)),
});

/** How far back the current view is, in seconds (approx, from tickMs). */
const secondsBack = computed(() =>
  Math.round((store.scrubOffset * store.tickMs) / 1000),
);

function togglePause() {
  store.setPaused(!store.paused);
}
</script>

<template>
  <div class="scrubber" :class="{ paused: store.paused }">
    <button
      class="scrubber__btn"
      :title="store.paused ? 'Resume live feed' : 'Pause live feed'"
      @click="togglePause"
    >
      <span v-if="store.paused">▶</span>
      <span v-else>❚❚</span>
    </button>

    <div class="scrubber__track">
      <input
        type="range"
        min="0"
        :max="maxOffset"
        step="1"
        :value="sliderValue"
        @input="sliderValue = ($event.target as HTMLInputElement).valueAsNumber"
      />
    </div>

    <div class="scrubber__label">
      <template v-if="store.paused && store.scrubOffset > 0">
        <span class="scrubber__past">−{{ secondsBack }}s</span>
      </template>
      <template v-else-if="store.paused">
        <span class="scrubber__past">paused</span>
      </template>
      <template v-else>
        <span class="scrubber__live">● LIVE</span>
      </template>
    </div>

    <button
      class="scrubber__snap"
      :disabled="!store.paused && store.scrubOffset === 0"
      title="Jump back to the live head"
      @click="store.goLive()"
    >
      LIVE ⟶
    </button>
  </div>
</template>

<style scoped>
.scrubber {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.85rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.scrubber.paused {
  border-color: var(--accent);
}
.scrubber__btn {
  flex: none;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
}
.scrubber__btn:hover {
  border-color: var(--accent);
}
.scrubber__track {
  flex: 1;
  display: flex;
  align-items: center;
}
.scrubber__track input {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}
.scrubber__label {
  flex: none;
  min-width: 4.5rem;
  text-align: center;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.scrubber__live {
  color: #22c55e;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.scrubber__past {
  color: var(--accent);
  font-weight: 600;
}
.scrubber__snap {
  flex: none;
  background: var(--bg);
  color: var(--accent);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.4rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.scrubber__snap:disabled {
  opacity: 0.4;
  cursor: default;
}
.scrubber__snap:not(:disabled):hover {
  border-color: var(--accent);
}
</style>
