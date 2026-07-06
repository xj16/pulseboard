<script setup lang="ts">
/**
 * The drag-to-arrange grid.
 *
 * Widgets are laid out on a 12-column CSS grid. Dragging a widget's header
 * moves it; dragging the bottom-right handle resizes it. During a gesture we
 * track a local "ghost" override for instant feedback, then commit the final
 * cell to the server on pointer-up (the server rebroadcasts to everyone).
 */
import { computed, reactive, ref } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import { GRID_COLUMNS, type Widget } from '../protocol';
import DashboardWidget from './DashboardWidget.vue';

const store = useDashboardStore();
const gridEl = ref<HTMLElement | null>(null);

/** Pixel height of one grid row. Columns are fluid (fr units). */
const ROW_H = 70;
const GAP = 12;

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
  drag.mode = null;
  drag.id = null;
  ghost.current = null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
</script>

<template>
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
</template>

<style scoped>
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
