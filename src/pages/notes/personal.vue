<template>
  <div class="personal-notes-container">

    <div class="notes-content-grid">

      <div class="left-cards-column">
        <div class="action-control-row">
          <div class="filter-pill-group">
            <button class="pill-btn" :class="{ active: currentFilter === 'all' }" @click="currentFilter = 'all'">全部</button>
            <button class="pill-btn" :class="{ active: currentFilter === 'todo' }" @click="currentFilter = 'todo'">待辦</button>
            <button class="pill-btn" :class="{ active: currentFilter === 'done' }" @click="currentFilter = 'done'">完成</button>
          </div>
          <button class="btn-add-task" @click="handleAction('新增事項')">+ 新增事項</button>
        </div>

        <div class="cards-stack">
          <div
            v-for="note in filteredNotes"
            :key="note.id"
            class="task-card-item"
            :class="{ 'is-completed-grey': note.completed }"
          >
            <div class="task-card-left">
              <input type="checkbox" class="task-checkbox" v-model="note.completed" />
              <div class="task-text-info">
                <span class="task-title" :class="{ 'title-done': note.completed }">{{ note.title }}</span>
                <p class="task-desc">{{ note.desc }}</p>
                <div class="task-time-meta">📅 提醒時間：{{ note.time }}</div>
              </div>
            </div>
            <span class="status-sticker" :class="note.stickerClass">{{ note.tag }}</span>
          </div>
        </div>

        <div class="purple-gradient-banner">
          <div class="banner-inner-content">
            <h3>重要公告</h3>
            <p>本月 25 號將進行大樓水塔清洗，屆時將停水 4 小時。請各位室友提前做好儲水準備，並確保洗衣機等用水設備已關閉。</p>
            <button class="btn-banner-more" @click="handleAction('查看公告詳情')">了解詳情</button>
          </div>
          <div class="banner-water-drop">💧</div>
        </div>
      </div>

      <div class="right-summary-column">
        <div class="white-panel-card">
          <h3 class="panel-section-title">個人摘要</h3>
          <div class="summary-data-row">
            <span class="summary-label">✓ 待辦事項</span>
            <span class="summary-value text-blue-num">{{ todoCount }}</span>
          </div>
          <div class="summary-data-row">
            <span class="summary-label">🔔 今日提醒</span>
            <span class="summary-value">0</span>
          </div>
          <div class="summary-data-row">
            <span class="summary-label">✓ 已完成</span>
            <span class="summary-value text-green-num">{{ doneCount }}</span>
          </div>
        </div>

        <div class="white-panel-card">
          <h3 class="panel-section-title">標籤分佈</h3>
          <div class="progress-group-row">
            <div class="progress-txt-info"><span>匯款 (Remittance)</span> <span>{{ tagCounts.remit }}</span></div>
            <div class="progress-rail"><div class="progress-fill fill-red" :style="{ width: tagProgress.remit }"></div></div>
          </div>
          <div class="progress-group-row">
            <div class="progress-txt-info"><span>提醒 (Reminder)</span> <span>{{ tagCounts.alert }}</span></div>
            <div class="progress-rail"><div class="progress-fill fill-purple" :style="{ width: tagProgress.alert }"></div></div>
          </div>
          <div class="progress-group-row">
            <div class="progress-txt-info"><span>維護 (Maintenance)</span> <span>{{ tagCounts.maintain }}</span></div>
            <div class="progress-rail"><div class="progress-fill fill-green" :style="{ width: tagProgress.maintain }"></div></div>
          </div>
        </div>

        <div class="white-panel-card deep-blue-action-card">
          <div class="action-card-badge">下一步？</div>
          <p class="action-card-text">排定下週的室友會議</p>
          <router-link to="/app/notes/roommates" class="action-card-link">前往日曆 ➔</router-link>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

// 控制過濾狀態：'all' | 'todo' | 'done'
const currentFilter = ref('all');

// 響應式備忘錄數據
const notes = ref([
  { id: 1, title: '繳交三月房租', desc: '記得 ATM 轉帳給陳大文，帳號末四碼 5678', time: '2026-03-10 09:00', tag: '匯款', stickerClass: 'sticker-red', completed: false, type: 'remit' },
  { id: 2, title: '外出前確認事項', desc: '帶鑰匙、悠遊卡、雨傘（週末有雨）', time: '2026-03-15 08:30', tag: '提醒', stickerClass: 'sticker-purple', completed: false, type: 'alert' },
  { id: 3, title: '冷氣濾網清洗', desc: '上次清洗是一月，建議每兩個月一次', time: '2026-03-20 --:--', tag: '維護', stickerClass: 'sticker-green', completed: true, type: 'maintain' }
]);

// 根據過濾條件動態篩選
const filteredNotes = computed(() => {
  if (currentFilter.value === 'todo') return notes.value.filter(n => !n.completed);
  if (currentFilter.value === 'done') return notes.value.filter(n => n.completed);
  return notes.value;
});

// 動態統計摘要
const todoCount = computed(() => notes.value.filter(n => !n.completed).length);
const doneCount = computed(() => notes.value.filter(n => n.completed).length);

// 統計標籤數量
const tagCounts = computed(() => {
  const counts = { remit: 0, alert: 0, maintain: 0 };
  notes.value.forEach(n => { counts[n.type]++; });
  return counts;
});

// 計算進度條比例
const tagProgress = computed(() => {
  const total = notes.value.length || 1;
  return {
    remit: `${(tagCounts.value.remit / total) * 100}%`,
    alert: `${(tagCounts.value.alert / total) * 100}%`,
    maintain: `${(tagCounts.value.maintain / total) * 100}%`,
  };
});

// 按鈕點擊事件監聽
const handleAction = (actionName) => {
  alert(`您點擊了「${actionName}」功能，後端串接完成後即可開啟彈窗或執行動作！`);
};
</script>

<style scoped>

/* 裝著三個按鈕的容器，設定間距把它們推開 */
.filter-pill-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* 獨立的白色膠囊按鈕 */
.pill-btn {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #64748b;
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}

/* 滑鼠移過去的效果 */
.pill-btn:hover:not(.active) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

/* 點擊作用中的紫色按鈕 */
.pill-btn.active {
  background: #4845A5;
  color: #ffffff;
  border-color: #4845A5;
  box-shadow: 0 4px 10px rgba(72, 69, 165, 0.2);
  font-weight: 600;
}



/* 樣式保持與前一版相同 */
.personal-notes-container { padding: 32px 40px; }
.top-unified-bar { background: #ffffff; border-radius: 30px; padding: 16px 32px; display: flex; align-items: center; gap: 32px; box-shadow: 0 4px 20px rgba(148, 163, 184, 0.04); margin-bottom: 32px; border: 1px solid #f1f5f9; }
.board-main-title { font-size: 24px; font-weight: 700; color: #1e293b; margin: 0; }
.capsule-nav-group { background: #f1f5f9; padding: 4px; border-radius: 99px; display: flex; align-items: center; }
.capsule-btn { padding: 8px 20px; font-size: 14px; font-weight: 500; color: #64748b; text-decoration: none; border-radius: 99px; transition: all 0.2s ease; }
.capsule-btn.active { background: #4845A5; color: #ffffff; font-weight: 600; }
.notes-content-grid { display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; }
.action-control-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.filter-pill-box { background: #e2e8f0; padding: 4px; border-radius: 10px; display: flex; }
.pill-item { padding: 6px 18px; font-size: 14px; font-weight: 500; color: #64748b; cursor: pointer; border-radius: 8px; transition: background 0.2s; }
.pill-item.active { background: #4845A5; color: white; }
.btn-add-task { background: #4845A5; color: white; border: none; padding: 8px 18px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; }
.cards-stack { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
.task-card-item { background: #ffffff; border-radius: 16px; padding: 20px; display: flex; justify-content: space-between; align-items: flex-start; box-shadow: 0 4px 15px rgba(148, 163, 184, 0.03); border: 1px solid #f1f5f9; transition: opacity 0.3s; }
.task-card-item.is-completed-grey { opacity: 0.6; background: #fafafa; }
.task-card-left { display: flex; gap: 16px; }
.task-checkbox { width: 20px; height: 20px; margin-top: 3px; cursor: pointer; accent-color: #4845A5; }
.task-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.task-title.title-done { text-decoration: line-through; color: #94a3b8; }
.task-desc { color: #64748b; font-size: 14px; margin: 6px 0 12px 0; }
.task-time-meta { font-size: 12px; color: #94a3b8; }
.status-sticker { padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.sticker-red { background: #fee2e2; color: #ef4444; }
.sticker-purple { background: #f3e8ff; color: #a855f7; }
.sticker-green { background: #dcfce7; color: #22c55e; }
.purple-gradient-banner { background: linear-gradient(135deg, #4845A5, #312e81); color: white; border-radius: 24px; padding: 24px; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden; }
.banner-inner-content { z-index: 2; max-width: 80%; }
.purple-gradient-banner h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; color: white; }
.purple-gradient-banner p { font-size: 14px; opacity: 0.9; line-height: 1.6; margin-bottom: 16px; color: white; }
.btn-banner-more { background: white; color: #4845A5; border: none; padding: 8px 24px; border-radius: 99px; font-weight: 700; cursor: pointer; }
.banner-water-drop { font-size: 90px; position: absolute; right: 16px; bottom: -20px; opacity: 0.15; z-index: 1; }
.white-panel-card { background: #ffffff; border-radius: 24px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 15px rgba(148, 163, 184, 0.02); border: 1px solid #f1f5f9; }
.panel-section-title { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 20px; }
.summary-data-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f8fafc; }
.summary-data-row:last-child { border-bottom: none; }
.summary-label { color: #475569; font-size: 14px; }
.summary-value { font-size: 24px; font-weight: 700; color: #1e293b; }
.text-blue-num { color: #3b82f6; }
.text-green-num { color: #22c55e; }
.progress-group-row { margin-bottom: 16px; }
.progress-group-row:last-child { margin-bottom: 0; }
.progress-txt-info { display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 6px; }
.progress-rail { background: #f1f5f9; height: 6px; border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 99px; transition: width 0.3s ease; }
.fill-red { background: #ef4444; }
.fill-purple { background: #a855f7; }
.fill-green { background: #22c55e; }
.deep-blue-action-card { background: #00668f; color: white; }
.action-card-badge { background: rgba(255, 255, 255, 0.2); display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
.action-card-text { font-size: 15px; font-weight: 700; color: white; margin-bottom: 16px; }
.action-card-link { color: white; text-decoration: none; font-size: 14px; font-weight: 600; }
</style>
