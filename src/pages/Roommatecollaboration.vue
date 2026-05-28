<template>
  <div class="roommate-collab-container">
    <div class="notes-content-grid" :class="{ 'is-calendar-mode': viewMode === 'calendar' }">

      <div class="left-cards-column">
        <div class="action-control-row">
          <div class="filter-pill-group">
            <button class="pill-btn" :class="{ active: currentFilter === 'all' }" @click="currentFilter = 'all'">全部</button>
            <button class="pill-btn" :class="{ active: currentFilter === 'todo' }" @click="currentFilter = 'todo'">待辦</button>
            <button class="pill-btn" :class="{ active: currentFilter === 'done' }" @click="currentFilter = 'done'">完成</button>
          </div>

          <div class="right-buttons-cluster">
            <div class="view-switch-box">
              <span class="switch-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">≡</span>
              <span class="switch-btn" :class="{ active: viewMode === 'calendar' }" @click="viewMode = 'calendar'">▦</span>
            </div>
          </div>
        </div>

        <div v-if="viewMode === 'list'" class="cards-stack">
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="task-card-item"
            :class="{ 'is-completed-grey': item.completed }"
          >
            <div class="task-card-left">
              <input type="checkbox" class="task-checkbox" v-model="item.completed" />
              <div class="task-text-info">
                <span class="task-title" :class="{ 'title-done': item.completed }">{{ item.title }}</span>
                <p class="task-desc">{{ item.desc }}</p>
                <div class="task-time-meta">👥 負責人：{{ item.owner }} | 📅 {{ item.completed ? '完成於' : '截止日' }}：{{ item.time }}</div>
              </div>
            </div>
            <span class="status-sticker" :class="item.stickerClass">{{ item.tag }}</span>
          </div>
        </div>

        <div v-else class="calendar-board-view">
          <div class="cal-header">
            <h2 class="cal-title">本週分工排程</h2>
            <div class="cal-nav">
              <button class="nav-btn-circle">&lsaquo;</button>
              <span class="date-range">5/24 – 5/30</span>
              <button class="nav-btn-circle">&rsaquo;</button>
            </div>
          </div>

          <div class="cal-grid">
            <div class="day-col" v-for="day in weekDays" :key="day.date">
              <div class="day-header">
                <span class="day-name">{{ day.name }}</span>
                <span class="day-date" :class="{ 'active': day.isToday }">{{ day.date }}</span>
              </div>

              <div class="day-tasks">
                <div
                  v-for="task in day.tasks"
                  :key="task.id"
                  class="cal-task-card"
                  :class="task.theme"
                >
                  <div class="cal-task-title">{{ task.title }}</div>
                  <div class="cal-task-owner">{{ task.owner }}</div>
                </div>
              </div>

              <button class="add-task-dashed-btn">+</button>
            </div>
          </div>

          <div class="cal-divider"></div>
          <div class="cal-legend">
            <div class="legend-item"><span class="dot dot-blue"></span>輪值</div>
            <div class="legend-item"><span class="dot dot-yellow"></span>公告</div>
            <div class="legend-item"><span class="dot dot-green"></span>提醒</div>
            <div class="legend-item"><span class="dot dot-purple"></span>採購</div>
            <div class="legend-item"><span class="dot dot-red"></span>維護</div>
          </div>
        </div>
      </div>

      <div v-if="viewMode === 'list'" class="right-summary-column">
        <div class="white-panel-card deep-blue-action-card">
          <div class="action-card-badge">發起協作</div>
          <p class="action-card-text">建立新的共同待辦事項</p>
          <button class="btn-add-task-full" @click="handleAction('發起協作事項')">+ 發起事項</button>
        </div>

        <div class="white-panel-card">
          <h3 class="panel-section-title">協作摘要</h3>
          <div class="summary-data-row">
            <span class="summary-label">⏳ 進行中事件</span>
            <span class="summary-value text-blue-num">{{ todoCount }}</span>
          </div>
          <div class="summary-data-row">
            <span class="summary-label">✓ 本月已結案</span>
            <span class="summary-value text-green-num">{{ doneCount }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

// 把預設視角改成日曆 (calendar)，方便你直接預覽
const viewMode = ref('calendar');
const currentFilter = ref('all');

// 原始清單資料
const items = ref([
  { id: 1, title: '採買公用公共物資', desc: '衛生紙快用完了，這次輪到 B 房小明採買', owner: '小明', time: '2026-05-30', tag: '公物', stickerClass: 'sticker-purple', completed: false, type: 'shopping' },
  { id: 2, title: '公共區域地板打掃', desc: '客廳與廚房垃圾倒掉', owner: '小華', time: '2026-05-25', tag: '家務', stickerClass: 'sticker-green', completed: true, type: 'chore' }
]);

// 🗓️ 完美還原圖片中的一週行事曆資料
const weekDays = computed(() => {
  return [
    { name: '週日', date: '24', isToday: false, tasks: [] },
    {
      name: '週一', date: '25', isToday: false,
      tasks: [{ id: 101, title: '廚房清潔', owner: '阿明', theme: 'theme-purple' }]
    },
    {
      name: '週二', date: '26', isToday: false,
      tasks: [{ id: 102, title: '申請曬衣架', owner: '小美', theme: 'theme-purple' }]
    },
    {
      name: '週三', date: '27', isToday: true,  // 藍色高亮圈圈
      tasks: [{ id: 103, title: '購買衛生紙', owner: '小美', theme: 'theme-purple' }]
    },
    { name: '週四', date: '28', isToday: false, tasks: [] },
    {
      name: '週五', date: '29', isToday: false,
      tasks: [{ id: 104, title: '倒垃圾', owner: '小林', theme: 'theme-purple' }]
    },
    {
      name: '週六', date: '30', isToday: false,
      tasks: [{ id: 105, title: '繳水電費', owner: '全屋', theme: 'theme-orange' }]
    }
  ];
});

// 計算屬性與操作
const filteredItems = computed(() => {
  if (currentFilter.value === 'todo') return items.value.filter(i => !i.completed);
  if (currentFilter.value === 'done') return items.value.filter(i => i.completed);
  return items.value;
});

const todoCount = computed(() => items.value.filter(i => !i.completed).length);
const doneCount = computed(() => items.value.filter(i => i.completed).length);

const handleAction = (name) => {
  alert(`成功響應：您點擊了「${name}」！`);
};
</script>

<style scoped>
.roommate-collab-container { padding: 32px 40px; }

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

/* 佈局：在日曆模式時隱藏側邊欄，讓版面變成單欄全寬 */
.notes-content-grid { display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; }
.notes-content-grid.is-calendar-mode { grid-template-columns: 1fr; }

/* 頂部操作列 */
.action-control-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; width: 100%; }
.pill-item.active { background: #4845A5; color: white; box-shadow: 0 2px 6px rgba(72,69,165,0.2); }

.right-buttons-cluster { display: flex; align-items: center; gap: 16px; }
.view-switch-box { background: #ffffff; border: 1px solid #e2e8f0; padding: 4px; border-radius: 12px; display: inline-flex; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.switch-btn { padding: 8px 12px; font-size: 16px; color: #94a3b8; cursor: pointer; border-radius: 8px; transition: all 0.2s; line-height: 1; }
.switch-btn.active { background: #f1f5f9; color: #1e293b; font-weight: 700; }

/* --- 🌟 全新週曆樣式 (完美還原圖片) --- */
.calendar-board-view {
  background: #ffffff;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
  border: 1px solid #f1f5f9;
}

.cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
.cal-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.cal-nav { display: flex; align-items: center; gap: 16px; }
.nav-btn-circle {
  width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e2e8f0; background: white;
  color: #64748b; font-size: 18px; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: 0.2s;
}
.nav-btn-circle:hover { border-color: #cbd5e1; background: #f8fafc; }
.date-range { font-size: 15px; font-weight: 500; color: #475569; }

.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; }
.day-col { display: flex; flex-direction: column; gap: 16px; }

/* 日期表頭 */
.day-header { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 8px; }
.day-name { font-size: 14px; font-weight: 500; color: #64748b; }
.day-date { width: 36px; height: 36px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 16px; font-weight: 700; color: #1e293b; }
.day-date.active { background: #4845A5; color: white; box-shadow: 0 4px 10px rgba(72,69,165,0.2); }

/* 任務卡片 */
.day-tasks { display: flex; flex-direction: column; gap: 8px; min-height: 70px; }
.cal-task-card { padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
.cal-task-title { font-size: 14px; font-weight: 700; }
.cal-task-owner { font-size: 13px; opacity: 0.8; }

/* 主題顏色設定 */
.theme-purple { background-color: #f5f3ff; color: #5b21b6; }
.theme-orange { background-color: #fff7ed; color: #c2410c; }

/* 新增虛線按鈕 */
.add-task-dashed-btn {
  width: 100%; height: 40px; border: 1px dashed #cbd5e1; border-radius: 8px;
  background: transparent; color: #cbd5e1; font-size: 20px; line-height: 1; cursor: pointer; transition: 0.2s;
}
.add-task-dashed-btn:hover { border-color: #94a3b8; color: #94a3b8; background: #f8fafc; }

/* 底部圖例 */
.cal-divider { height: 1px; background: #e2e8f0; margin: 32px 0 24px 0; }
.cal-legend { display: flex; gap: 20px; align-items: center; padding-left: 8px; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: #475569; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-blue { background: #4f46e5; }
.dot-yellow { background: #eab308; }
.dot-green { background: #22c55e; }
.dot-purple { background: #a855f7; }
.dot-red { background: #ef4444; }

/* --- 保留的清單列表樣式 --- */
.cards-stack { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
.task-card-item { background: #ffffff; border-radius: 16px; padding: 20px; display: flex; justify-content: space-between; align-items: flex-start; box-shadow: 0 4px 15px rgba(0,0,0,0.02); border: 1px solid #f1f5f9; transition: all 0.3s; }
.task-card-item.is-completed-grey { opacity: 0.55; background: #f8fafc; }
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

/* 右側面板樣式 */
.white-panel-card { background: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); border: 1px solid #f1f5f9; }
.deep-blue-action-card { background: #00668f; color: white; border: none; }
.action-card-badge { background: rgba(255, 255, 255, 0.2); display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
.action-card-text { font-size: 15px; font-weight: 700; color: white; margin-bottom: 16px; }
.btn-add-task-full { width: 100%; background: white; color: #00668f; border: none; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.btn-add-task-full:hover { background: #f1f5f9; }
.panel-section-title { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 20px; }
.summary-data-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f8fafc; }
.summary-data-row:last-child { border-bottom: none; }
.summary-label { color: #475569; font-size: 14px; }
.summary-value { font-size: 20px; font-weight: 700; color: #1e293b; }
.text-blue-num { color: #3b82f6; }
.text-green-num { color: #22c55e; }
</style>
