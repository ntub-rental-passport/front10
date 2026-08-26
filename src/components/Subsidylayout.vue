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
  { path: '/app/subsidy/calculator', label: '租補試算' },
  { path: '/app/subsidy/apply',      label: '租補申請' },
  { path: '/app/subsidy/progress',   label: '申請進度' },
  { path: '/app/subsidy/upload',     label: '補件上傳' },
]
</script>

<style scoped>
.subsidy-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* ── Header 區塊 (改為上下排列) ── */
.subsidy-header {
  padding: 0 0 0 0; 
  display: flex;
  flex-direction: column;
  gap: 16px; 
  background-color: transparent !important;
}

/* 獨立出來的頁面大標題 */
.page-title {
  font-size: 28px; /* 加大字體更顯眼 */
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  letter-spacing: 0.05em; /* 稍微加一點字距提升質感 */
}

/* 膠囊導覽列容器 */
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

/* 按鈕群組容器 */
.nav-tabs {
  display: flex;
  align-items: center;
  gap: 6px; /* 按鈕之間的間隔 */
}

/* 獨立 Tab 按鈕 */
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

/* 游標移過去的顏色 */
.nav-tab:hover:not(.active) {
  color: #4845A5;
  background-color: #f1f5f9; /* 移過去時帶有一點淺灰底色，手感更好 */
}

/* 作用中的 Tab 狀態 */
.nav-tab.active {
  background-color: #4845A5; 
  color: #ffffff; 
  box-shadow: 0 2px 4px rgba(72, 69, 165, 0.2); 
}

/* ── 內容區 ── */
.subsidy-body {
  flex: 1;
  padding: 2rem;
}

/* RWD 響應式設計調整 (手機版) */
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