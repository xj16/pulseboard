<script setup lang="ts">
import { onMounted } from 'vue';
import { useDashboardStore } from './store/dashboard';
import Toolbar from './components/Toolbar.vue';
import DashboardGrid from './components/DashboardGrid.vue';

const store = useDashboardStore();
onMounted(() => store.connect());
</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="brand">
        <span class="brand__mark">📈</span>
        <div>
          <h1 class="brand__name">PulseBoard</h1>
          <p class="brand__tag">Real-time collaborative analytics</p>
        </div>
      </div>
      <a
        class="app__repo"
        href="https://github.com/xj16/pulseboard"
        target="_blank"
        rel="noopener"
      >
        View source ↗
      </a>
    </header>

    <main class="app__main">
      <Toolbar />
      <DashboardGrid />
    </main>

    <footer class="app__footer">
      <span>Data is fully simulated locally — no external feed.</span>
      <span>Drag headers to move · drag corners to resize · changes sync to everyone.</span>
    </footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.app__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.brand__mark {
  font-size: 2rem;
}
.brand__name {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}
.brand__tag {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.app__repo {
  font-size: 0.85rem;
  color: var(--accent);
  text-decoration: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
}
.app__repo:hover {
  border-color: var(--accent);
}
.app__main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.app__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--muted);
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
</style>
