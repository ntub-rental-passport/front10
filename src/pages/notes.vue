<template>
  <div>
    <div class="notes-header">
      <div class="breadcrumb">租屋管理</div>

      <div class="page-heading">
        <h1 class="page-title">記事板</h1>
      </div>

      <div class="notes-tabs">
        <router-link to="/app/notes/personal" class="n-tab">
          <i class="ti ti-notebook"></i> 個人備忘
        </router-link>
        <router-link to="/app/notes/roommates" class="n-tab">
          <i class="ti ti-users"></i> 室友協作
        </router-link>
      </div>
    </div>

    <router-view />
  </div>
</template>

<style scoped>
.notes-header {
  background: #fff;
  border-bottom: 1px solid #e8e4f4;
  padding: 0 2rem;
}
.breadcrumb {
  font-size: 13px;
  color: #aaa;
  padding: 16px 0 0;
}
.page-heading {
  padding: 8px 0 14px; /* 優化標題上下間距，讓視覺更流暢 */
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #1e1b4b;
  margin: 0;
}
.notes-tabs {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  /* 💡 核心魔術：讓頁籤的外框向下位移 1px，完美與 header 的底線融合 */
  margin-bottom: -1px;
}
.n-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 500;
  color: #888;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.n-tab:hover {
  color: #5b4ecb;
}
.n-tab.router-link-active {
  color: #5b4ecb;
  border-bottom-color: #5b4ecb;
  font-weight: 600;
}
</style>
