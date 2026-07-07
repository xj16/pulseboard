<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDashboardStore } from '../store/dashboard';
import type { MetricId, Widget, WidgetKind } from '../protocol';
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

const editing = ref(false);

// Draft edit state, seeded from the widget when the editor opens.
const draftKind = ref<WidgetKind>(props.widget.kind);
const draftMetric = ref<MetricId>(props.widget.metric);
const draftTitle = ref(props.widget.title);
const draftThresholdOn = ref(!!props.widget.threshold);
const draftThresholdValue = ref(props.widget.threshold?.value ?? 0);
const draftThresholdDir = ref<'above' | 'below'>(
  props.widget.threshold?.dir ?? 'above',
);

const kinds: { value: WidgetKind; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'bar', label: 'Bar' },
  { value: 'stat', label: 'Stat' },
  { value: 'gauge', label: 'Gauge' },
];

/** Another peer is currently dragging this widget → soft-lock it. */
const dragger = computed(() => store.draggerOf(props.widget.id));

/** Live value vs the widget's threshold decides the alert state. */
const breached = computed(() => {
  const t = props.widget.threshold;
  if (!t) return false;
  const v = store.latestFor(props.widget.metric);
  return t.dir === 'above' ? v >= t.value : v <= t.value;
});

function openEdit() {
  draftKind.value = props.widget.kind;
  draftMetric.value = props.widget.metric;
  draftTitle.value = props.widget.title;
  draftThresholdOn.value = !!props.widget.threshold;
  draftThresholdValue.value = props.widget.threshold?.value ?? 0;
  draftThresholdDir.value = props.widget.threshold?.dir ?? 'above';
  editing.value = true;
}

function applyEdit() {
  store.updateWidget(props.widget.id, {
    kind: draftKind.value,
    metric: draftMetric.value,
    title: draftTitle.value.trim() || (meta.value?.label ?? draftMetric.value),
    threshold: draftThresholdOn.value
      ? { value: Number(draftThresholdValue.value), dir: draftThresholdDir.value }
      : null,
  });
  editing.value = false;
}

function remove() {
  store.removeWidget(props.widget.id);
}
</script>

<template>
  <div
    class="widget"
    :class="{ alert: breached, locked: !!dragger }"
    :style="{ '--accent': meta?.color, '--peer': dragger?.color }"
  >
    <header class="widget__head" @pointerdown="dragger ? null : emit('drag-start', $event)">
      <span class="widget__dot"></span>
      <h3 class="widget__title">{{ widget.title }}</h3>
      <span v-if="breached" class="widget__badge" title="Threshold breached">⚠ alert</span>
      <span v-else class="widget__kind">{{ widget.kind }}</span>
      <button
        class="widget__icon"
        title="Edit widget"
        @pointerdown.stop
        @click="openEdit"
      >
        ✎
      </button>
      <button
        class="widget__icon widget__close"
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

    <!-- Soft-lock overlay: someone else is moving this widget. -->
    <div v-if="dragger" class="widget__lock">
      <span class="widget__lock-tag" :style="{ background: dragger.color }">
        {{ dragger.name }} is moving this
      </span>
    </div>

    <!-- Inline editor -->
    <div v-if="editing" class="editor" @pointerdown.stop>
      <label class="editor__field">
        <span>Title</span>
        <input v-model="draftTitle" type="text" maxlength="60" />
      </label>
      <div class="editor__row">
        <label class="editor__field">
          <span>Kind</span>
          <select v-model="draftKind">
            <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
        </label>
        <label class="editor__field">
          <span>Metric</span>
          <select v-model="draftMetric">
            <option v-for="m in store.metrics" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
        </label>
      </div>
      <div class="editor__row editor__threshold">
        <label class="editor__check">
          <input v-model="draftThresholdOn" type="checkbox" />
          <span>Alert when</span>
        </label>
        <select v-model="draftThresholdDir" :disabled="!draftThresholdOn">
          <option value="above">above</option>
          <option value="below">below</option>
        </select>
        <input
          v-model.number="draftThresholdValue"
          type="number"
          :disabled="!draftThresholdOn"
          class="editor__num"
        />
      </div>
      <div class="editor__actions">
        <button class="btn btn--primary" @click="applyEdit">Save</button>
        <button class="btn" @click="editing = false">Cancel</button>
      </div>
    </div>

    <div
      class="widget__resize"
      title="Drag to resize"
      @pointerdown.stop="dragger ? null : emit('resize-start', $event)"
    ></div>
  </div>
</template>

<style scoped>
.widget {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.widget:hover {
  border-color: color-mix(in srgb, var(--accent, var(--border)) 45%, var(--border));
}
.widget.alert {
  border-color: #ef4444;
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.5), 0 8px 24px rgba(239, 68, 68, 0.15);
}
.widget.locked {
  border-color: var(--peer, var(--accent));
  box-shadow: 0 0 0 2px var(--peer, var(--accent));
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
.widget.locked .widget__head {
  cursor: not-allowed;
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
.widget__kind,
.widget__badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  margin-left: auto;
  flex: none;
}
.widget__badge {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.12);
}
.widget__icon {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
  border-radius: 4px;
  flex: none;
}
.widget__icon:hover {
  color: var(--text);
  background: rgba(148, 163, 184, 0.14);
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
.widget__lock {
  position: absolute;
  inset: 0;
  top: 37px;
  background: color-mix(in srgb, var(--panel) 70%, transparent);
  backdrop-filter: blur(1px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.6rem;
  pointer-events: none;
}
.widget__lock-tag {
  font-size: 0.7rem;
  font-weight: 600;
  color: #04121f;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
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

/* Inline editor overlay */
.editor {
  position: absolute;
  inset: 37px 0 0 0;
  background: color-mix(in srgb, var(--panel) 97%, #000);
  border-top: 1px solid var(--border);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  overflow: auto;
  z-index: 5;
}
.editor__row {
  display: flex;
  gap: 0.5rem;
}
.editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  flex: 1;
  min-width: 0;
}
.editor__threshold {
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.editor__check {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: var(--muted);
}
.editor input[type='text'],
.editor input[type='number'],
.editor select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  width: 100%;
}
.editor__num {
  max-width: 6rem;
}
.editor__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}
.btn {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover {
  border-color: var(--accent);
}
.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #04121f;
}
</style>
