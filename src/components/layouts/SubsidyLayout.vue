<template>
  <div class="subsidy-layout">
    <div class="subsidy-header">
      <h1 class="page-title">租金補貼</h1>
      
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

    <div class="subsidy-body">
      <router-view />
    </div>
  </div>
</template>

<script setup>

const tabs = [
  { path: '/app/subsidy', label: '租補總覽' },
  { path: '/app/subsidy/calculator', label: '資格初步檢核' },
  { path: '/app/subsidy/housing', label: '房屋條件確認' },
  { path: '/app/subsidy/apply', label: '申請準備' },
  { path: '/app/subsidy/progress', label: '申請後提醒' },
  { path: '/app/subsidy/recovery', label: '追繳協助' },
]
</script>

<style scoped>
.subsidy-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.subsidy-header {
  padding: 0 0 0 0; 
  display: flex;
  flex-direction: column;
  gap: 16px; 
  background-color: transparent !important;
}

.page-title {
  font-size: 28px; /* 加大字體更顯眼 */
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  letter-spacing: 0.05em; /* 稍微加一點字距提升質感 */
}

.nav-pill-container {
  display: inline-flex; 
  align-self: flex-start; /* 加上這行！讓白色底色只包住按鈕，不會延伸到最右邊 */
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
  gap: 6px; /* 按鈕之間的間隔 */
}

.nav-tab {
  padding: 8px 16px; /* 稍微增加上下高度 */
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
  background-color: #f1f5f9; /* 移過去時帶有一點淺灰底色，手感更好 */
}

.nav-tab.active {
  background-color: #4845A5; 
  color: #ffffff; 
  box-shadow: 0 2px 4px rgba(72, 69, 165, 0.2); 
}

.subsidy-body {
  flex: 1;
  padding: 2rem;
}

@media (max-width: 640px) {
  .subsidy-header { 
    padding: 16px 1rem; 
    gap: 12px;
  }
  .subsidy-body {
  flex: 1;
  padding: 16px 0; 
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
