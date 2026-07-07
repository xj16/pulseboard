<script setup lang="ts">
/**
 * Renders every other peer's live cursor as a colored arrow + name tag,
 * positioned by grid-normalized (0..1) coordinates relative to a bounding box
 * provided by the parent (the dashboard grid). This is what makes the
 * "collaborative" pitch true at a glance: you see other people moving.
 */
import { computed } from 'vue';
import { useDashboardStore } from '../store/dashboard';

const props = defineProps<{ box: { width: number; height: number } }>();
const store = useDashboardStore();

interface RenderedCursor {
  id: string;
  name: string;
  color: string;
  left: number;
  top: number;
}

const cursors = computed<RenderedCursor[]>(() => {
  const out: RenderedCursor[] = [];
  for (const peer of store.others) {
    const c = store.cursors[peer.id];
    if (!c) continue;
    out.push({
      id: peer.id,
      name: peer.name,
      color: peer.color,
      left: c.x * props.box.width,
      top: c.y * props.box.height,
    });
  }
  return out;
});
</script>

<template>
  <div class="cursors" aria-hidden="true">
    <div
      v-for="c in cursors"
      :key="c.id"
      class="cursor"
      :style="{ transform: `translate(${c.left}px, ${c.top}px)` }"
    >
      <svg class="cursor__arrow" width="18" height="18" viewBox="0 0 18 18">
        <path
          d="M2 2 L15 8 L8 9 L6 15 Z"
          :fill="c.color"
          stroke="#04121f"
          stroke-width="1"
          stroke-linejoin="round"
        />
      </svg>
      <span class="cursor__name" :style="{ background: c.color }">{{ c.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.cursors {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 20;
}
.cursor {
  position: absolute;
  top: 0;
  left: 0;
  /* Transitions are done with translate; keep it snappy but smooth. */
  transition: transform 0.08s linear;
  will-change: transform;
}
.cursor__arrow {
  display: block;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}
.cursor__name {
  position: absolute;
  left: 14px;
  top: 12px;
  font-size: 0.65rem;
  font-weight: 600;
  color: #04121f;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  white-space: nowrap;
}
</style>
