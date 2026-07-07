<script setup lang="ts">
/** Transient toasts for server rejections (stale rev, rate limit, capacity). */
import { useDashboardStore } from '../store/dashboard';

const store = useDashboardStore();

function icon(kind: string): string {
  switch (kind) {
    case 'stale-rev':
      return '↻';
    case 'rate-limited':
      return '⏱';
    case 'capacity':
      return '▣';
    case 'invalid':
      return '⚠';
    default:
      return 'ℹ';
  }
}
</script>

<template>
  <div class="notices" aria-live="polite">
    <div
      v-for="n in store.notices"
      :key="n.id"
      class="notice"
      :class="`notice--${n.kind}`"
      @click="store.dismissNotice(n.id)"
    >
      <span class="notice__icon">{{ icon(n.kind) }}</span>
      <span>{{ n.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.notices {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 50;
  max-width: min(90vw, 22rem);
}
.notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: 10px;
  font-size: 0.8rem;
  color: var(--text);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: slide-in 0.18s ease;
}
.notice--stale-rev {
  border-left-color: var(--accent);
}
.notice--rate-limited {
  border-left-color: #f59e0b;
}
.notice--capacity {
  border-left-color: #f59e0b;
}
.notice--invalid {
  border-left-color: #ef4444;
}
.notice__icon {
  font-size: 1rem;
}
@keyframes slide-in {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
