<script setup lang="ts">
/**
 * The drag-to-arrange grid.
 *
 * Widgets are laid out on a 12-column CSS grid. Dragging a widget's header
 * moves it; dragging the bottom-right handle resizes it. During a gesture we
 * track a local "ghost" override for instant feedback, then commit the final
 * cell to the server on pointer-up (the server rebroadcasts to everyone).
 *
 * This component also drives the collaboration layer: it emits the local
 * pointer position (grid-normalized, throttled) so peers see a live cursor,
 * broadcasts drag-start/drag-end so peers get a soft-lock ring on the widget
 * being moved, and renders every other peer's cursor via {@link PeerCursors}.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import { GRID_COLUMNS, type Widget } from '../protocol';
import DashboardWidget from './DashboardWidget.vue';
import PeerCursors from './PeerCursors.vue';

const store = useDashboardStore();
const gridEl = ref<HTMLElement | null>(null);

/** Pixel height of one grid row. Columns are fluid (fr units). */
const ROW_H = 70;
const GAP = 12;

/** Bounding box of the grid, kept fresh for cursor normalization. */
const box = reactive({ width: 1, height: 1 });

interface Ghost {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
const ghost = reactive<{ current: Ghost | null }>({ current: null });

type Mode = 'move' | 'resize' | null;
const drag = reactive<{
  mode: Mode;
  id: string | null;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  colWidth: number;
}>({
  mode: null,
  id: null,
  startPointerX: 0,
  startPointerY: 0,
  startX: 1,
  startY: 1,
  startW: 1,
  startH: 1,
  colWidth: 100,
});

const widgets = computed(() => store.board.widgets);

/** Effective placement for a widget (ghost overrides during a drag). */
function placement(w: Widget) {
  if (ghost.current && ghost.current.id === w.id) return ghost.current;
  return w;
}

function styleFor(w: Widget) {
  const p = placement(w);
  return {
    gridColumn: `${p.x} / span ${p.w}`,
    gridRow: `${p.y} / span ${p.h}`,
    zIndex: drag.id === w.id ? 10 : 1,
  };
}

function begin(mode: Exclude<Mode, null>, widget: Widget, ev: PointerEvent) {
  const grid = gridEl.value;
  if (!grid) return;
  // Never grab a widget another peer is actively moving (soft lock).
  if (store.draggerOf(widget.id)) return;
  const rect = grid.getBoundingClientRect();
  drag.colWidth = (rect.width - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  drag.mode = mode;
  drag.id = widget.id;
  drag.startPointerX = ev.clientX;
  drag.startPointerY = ev.clientY;
  drag.startX = widget.x;
  drag.startY = widget.y;
  drag.startW = widget.w;
  drag.startH = widget.h;
  ghost.current = { id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h };

  // Tell peers we grabbed this widget so they get a lock ring.
  store.emitDrag(widget.id);

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function onMove(ev: PointerEvent) {
  if (!drag.mode || !drag.id || !ghost.current) return;
  const dx = ev.clientX - drag.startPointerX;
  const dy = ev.clientY - drag.startPointerY;
  const cellX = Math.round(dx / (drag.colWidth + GAP));
  const cellY = Math.round(dy / (ROW_H + GAP));

  if (drag.mode === 'move') {
    const x = clamp(drag.startX + cellX, 1, GRID_COLUMNS - drag.startW + 1);
    const y = Math.max(1, drag.startY + cellY);
    ghost.current.x = x;
    ghost.current.y = y;
  } else {
    const w = clamp(drag.startW + cellX, 1, GRID_COLUMNS - drag.startX + 1);
    const h = Math.max(2, drag.startH + cellY);
    ghost.current.w = w;
    ghost.current.h = h;
  }
}

function onUp() {
  window.removeEventListener('pointermove', onMove);
  const g = ghost.current;
  const mode = drag.mode;
  if (g && mode === 'move') {
    if (g.x !== drag.startX || g.y !== drag.startY) {
      store.moveWidget(g.id, g.x, g.y);
    }
  } else if (g && mode === 'resize') {
    if (g.w !== drag.startW || g.h !== drag.startH) {
      store.resizeWidget(g.id, g.w, g.h);
    }
  }
  // Release the lock ring for peers.
  store.emitDrag(null);
  drag.mode = null;
  drag.id = null;
  ghost.current = null;
}

// --- Live cursor broadcasting (throttled to ~20/s) -------------------------

let lastCursor = 0;
function onPointerMove(ev: PointerEvent) {
  const grid = gridEl.value;
  if (!grid) return;
  const now = performance.now();
  if (now - lastCursor < 50) return;
  lastCursor = now;
  const rect = grid.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width;
  const y = (ev.clientY - rect.top) / rect.height;
  if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return;
  store.emitCursor(x, y);
}

let resizeObserver: ResizeObserver | null = null;
function measure() {
  const grid = gridEl.value;
  if (!grid) return;
  const rect = grid.getBoundingClientRect();
  box.width = rect.width;
  box.height = rect.height;
}

onMounted(() => {
  measure();
  gridEl.value?.addEventListener('pointermove', onPointerMove);
  resizeObserver = new ResizeObserver(measure);
  if (gridEl.value) resizeObserver.observe(gridEl.value);
});

onBeforeUnmount(() => {
  gridEl.value?.removeEventListener('pointermove', onPointerMove);
  resizeObserver?.disconnect();
  window.removeEventListener('pointermove', onMove);
});

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
</script>

<template>
  <div class="grid-wrap">
    <div ref="gridEl" class="grid">
      <div
        v-for="w in widgets"
        :key="w.id"
        class="grid__cell"
        :class="{ dragging: drag.id === w.id }"
        :style="styleFor(w)"
      >
        <DashboardWidget
          :widget="w"
          @drag-start="begin('move', w, $event)"
          @resize-start="begin('resize', w, $event)"
        />
      </div>

      <p v-if="widgets.length === 0" class="grid__empty">
        No widgets yet — add one from the toolbar above.
      </p>
    </div>
    <PeerCursors :box="box" />
  </div>
</template>

<style scoped>
.grid-wrap {
  position: relative;
}
.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 70px;
  gap: 12px;
  align-content: start;
  min-height: 60vh;
}
.grid__cell {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.grid__cell.dragging {
  opacity: 0.92;
  filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.35));
}
.grid__empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--muted);
  padding: 3rem 0;
}

@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
  /* On narrow screens each widget spans the single column, stacked. */
  .grid__cell {
    grid-column: 1 / -1 !important;
  }
}
</style>
