<template>
  <div class="notes-layout">
    <div class="notes-header">
      <h1 class="page-title">記事板</h1>

      <div class="nav-pill-container">
        <div class="nav-tabs">
          <router-link
            v-for="tab in tabs"
            :key="tab.path"
            :to="tab.path"
            class="nav-tab"
            exact-active-class="active"
          >
            {{ tab.label }}
          </router-link>
        </div>
      </div>
    </div>

    <div class="notes-body">
      <router-view />
    </div>
  </div>
</template>

<script setup>
// 你的路由陣列
const tabs = [
  { path: '/app/notes/personal',  label: '個人記事' },
  { path: '/app/notes/roommates', label: '室友協作' },
]
</script>

<style scoped>
.notes-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.notes-header {
  padding: 0 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: transparent !important;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  letter-spacing: 0.05em;
}

.nav-pill-container {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  background-color: #ffffff;
  border-radius: 9999px;
  padding: 6px 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);

  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.nav-pill-container::-webkit-scrollbar {
  display: none;
}

.nav-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-tab {
  padding: 8px 16px;
  font-size: 15px;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  border-radius: 9999px;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.nav-tab:hover:not(.active) {
  color: #4845A5;
  background-color: #f1f5f9;
}

.nav-tab.active {
  background-color: #4845A5;
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(72, 69, 165, 0.2);
}

.notes-body {
  flex: 1;
  padding: 0 0;
}

@media (max-width: 640px) {
  .notes-header {
    padding: 16px 0;
    gap: 12px;
  }
  .page-title {
    font-size: 24px;
  }
  .nav-tab {
    padding: 6px 14px;
    font-size: 14px;
  }
}
</style>
