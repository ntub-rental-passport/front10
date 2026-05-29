<template>
  <div class="page-wrap">

    <div class="page-body">
      <div class="main-layout">
        <!-- 左側主區 -->
        <div class="main-col">
          <!-- Tab 列 -->
          <div class="tab-bar">
            <div class="tabs">
            </div>
            <button class="btn-add" @click="openAddModal">+ 新增</button>
          </div>

          <!-- 篩選列 -->
          <div class="filter-bar">
            <button
              v-for="f in filters"
              :key="f.key"
              class="filter-btn"
              :class="{ active: activeFilter === f.key }"
              @click="activeFilter = f.key"
            >
              {{ f.label }}
            </button>
            <!-- 檢視切換 -->
            <div class="view-toggle">
              <button
                class="view-btn"
                :class="{ active: viewMode === 'list' }"
                @click="viewMode = 'list'"
                title="列表"
              >
                ≡
              </button>
              <button
                class="view-btn"
                :class="{ active: viewMode === 'week' }"
                @click="viewMode = 'week'"
                title="週曆"
              >
                ▦
              </button>
            </div>
          </div>

          <!-- ── 週曆檢視 ── -->
          <transition name="slide-fade" mode="out-in">
            <div v-if="viewMode === 'week'" key="week">
              <div class="week-card">
                <div class="week-header-row">
                  <span class="week-title">本週分工排程</span>
                  <div class="week-nav">
                    <button class="week-nav-btn" @click="prevWeek">‹</button>
                    <span class="week-range">{{ weekRangeLabel }}</span>
                    <button class="week-nav-btn" @click="nextWeek">›</button>
                  </div>
                </div>

                <!-- 週曆格 -->
                <div class="week-grid">
                  <div v-for="day in weekDays" :key="day.dateStr" class="week-col">
                    <div class="week-day-label">{{ day.weekLabel }}</div>
                    <div class="week-date-circle" :class="{ today: day.isToday }">
                      {{ day.dayNum }}
                    </div>

                    <!-- 當天任務 -->
                    <div class="week-tasks">
                      <div
                        v-for="task in getTasksForDay(day.dateStr)"
                        :key="task.id"
                        class="week-task-chip"
                        :style="{ background: tagBg(task.tag), color: tagColor(task.tag) }"
                        @click="openEditModal(task)"
                        :title="task.title"
                      >
                        <div class="chip-title">{{ task.title }}</div>
                        <div class="chip-assignee">{{ task.assignee }}</div>
                      </div>
                    </div>

                    <!-- 新增拖放區 -->
                    <div class="week-drop-zone" @click="openAddOnDay(day.dateStr)" title="新增事項">
                      +
                    </div>
                  </div>
                </div>

                <!-- 標籤圖例 -->
                <div class="week-legend">
                  <span v-for="t in tagOptions" :key="t.name" class="legend-item">
                    <span class="legend-dot" :style="{ background: t.color }"></span>
                    {{ t.name }}
                  </span>
                </div>
              </div>
            </div>

            <!-- ── 列表檢視 ── -->
            <div v-else key="list">
              <div class="notes-list">
                <transition-group name="note-list">
                  <div
                    v-for="task in filteredTasks"
                    :key="task.id"
                    class="note-card"
                    :class="{ completed: task.done }"
                  >
                    <button
                      class="note-checkbox"
                      :class="{ checked: task.done }"
                      @click="toggleDone(task.id)"
                    >
                      <span v-if="task.done">✓</span>
                    </button>
                    <div class="note-body" @click="openEditModal(task)">
                      <div class="note-title-row">
                        <span class="note-title" :class="{ 'done-text': task.done }">{{
                          task.title
                        }}</span>
                        <span
                          class="note-tag"
                          :style="{ background: tagBg(task.tag), color: tagColor(task.tag) }"
                          >{{ task.tag }}</span
                        >
                      </div>
                      <div class="note-content" v-if="task.content">{{ task.content }}</div>
                      <div class="note-meta">
                        <span v-if="task.date" class="meta-item"
                          ><span class="meta-icon">📅</span>{{ task.date }}</span
                        >
                        <span v-if="task.assignee" class="meta-item"
                          ><span class="meta-icon">👤</span>{{ task.assignee }}</span
                        >
                      </div>
                    </div>
                    <button class="note-delete" @click="deleteTask(task.id)">🗑</button>
                  </div>
                </transition-group>
                <div v-if="filteredTasks.length === 0" class="empty-state">
                  <div class="empty-icon">🤝</div>
                  <div class="empty-text">尚無協作事項，點擊「+ 新增」建立</div>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- 右側統計 -->
        <div class="side-col">
          <!-- 協作摘要 -->
          <div class="card summary-card">
            <div class="summary-title">協作摘要</div>
            <div class="summary-rows">
              <div class="summary-row">
                <span class="summary-label">待處理</span>
                <span class="summary-val blue">{{ tasks.filter((t) => !t.done).length }}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">已完成</span>
                <span class="summary-val green">{{ tasks.filter((t) => t.done).length }}</span>
              </div>
            </div>
          </div>

          <!-- 室友負責分佈 -->
          <div class="card roommate-card" style="margin-top: 14px">
            <div class="summary-title">室友負責分佈</div>
            <div class="roommate-rows">
              <div v-for="rm in roommateStats" :key="rm.name" class="roommate-row">
                <span class="rm-name">{{ rm.name }}</span>
                <div class="rm-progress-wrap">
                  <div class="rm-progress-track">
                    <div
                      class="rm-progress-fill"
                      :style="{ width: rm.total ? (rm.done / rm.total) * 100 + '%' : '0%' }"
                    ></div>
                  </div>
                </div>
                <span class="rm-stat">{{ rm.done }}/{{ rm.total }} 完成</span>
              </div>
            </div>
          </div>

          <!-- 事項類型 -->
          <div class="card tag-card" style="margin-top: 14px">
            <div class="summary-title">事項類型</div>
            <div class="type-rows">
              <div v-for="t in tagStats" :key="t.name" class="type-row">
                <span
                  class="type-chip"
                  :style="{ background: tagBg(t.name), color: tagColor(t.name) }"
                  >{{ t.name }}</span
                >
                <span class="type-count">{{ t.count }} 項</span>
              </div>
            </div>
          </div>

          <!-- AI 建議 -->
          <transition name="slide-fade">
            <div v-if="showAI" class="card ai-card" style="margin-top: 14px">
              <div class="ai-header">
                <span class="ai-icon">✨</span>
                <span class="ai-title">AI 協作建議</span>
              </div>
              <div class="ai-suggestions">
                <div v-for="s in aiSuggestions" :key="s" class="ai-item">{{ s }}</div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- 新增 / 編輯 Modal -->
    <transition name="fade">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">{{ editingTask ? '編輯事項' : '新增協作事項' }}</span>
            <button class="modal-close" @click="closeModal">×</button>
          </div>
          <div class="modal-body">
            <div class="mfield">
              <label class="mlabel">標題 *</label>
              <input class="minput" v-model="modalForm.title" placeholder="事項標題" />
            </div>
            <div class="mfield">
              <label class="mlabel">說明</label>
              <textarea
                class="mtextarea"
                v-model="modalForm.content"
                rows="2"
                placeholder="詳細說明（選填）"
              ></textarea>
            </div>
            <div class="mfield-row">
              <div class="mfield">
                <label class="mlabel">日期</label>
                <input class="minput" type="date" v-model="modalForm.date" />
              </div>
              <div class="mfield">
                <label class="mlabel">負責人</label>
                <select class="mselect" v-model="modalForm.assignee">
                  <option value="">請選擇</option>
                  <option v-for="rm in roommates" :key="rm" :value="rm">{{ rm }}</option>
                </select>
              </div>
            </div>
            <div class="mfield">
              <label class="mlabel">標籤</label>
              <div class="tag-options">
                <button
                  v-for="t in tagOptions"
                  :key="t.name"
                  class="tag-opt-btn"
                  :class="{ selected: modalForm.tag === t.name }"
                  :style="
                    modalForm.tag === t.name
                      ? { borderColor: t.color, background: t.color + '18', color: t.color }
                      : {}
                  "
                  @click="modalForm.tag = t.name"
                >
                  {{ t.name }}
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="closeModal">取消</button>
            <button class="btn-save" :disabled="!modalForm.title" @click="saveTask">
              {{ editingTask ? '儲存變更' : '新增事項' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Toast -->
    <transition name="toast">
      <div v-if="showToast" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import SectionTabs from '@/src/components/section-tabs.vue'

const router = useRouter()

// ── 日期工具 ──────────────────────────────────
const todayDate = new Date()
todayDate.setHours(0, 0, 0, 0)

function toDateStr(d) {
  return d.toISOString().slice(0, 10)
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// 週起始（本週日）
const weekOffset = ref(0)
const weekStart = computed(() => {
  const d = new Date(todayDate)
  const day = d.getDay() // 0=日
  d.setDate(d.getDate() - day + weekOffset.value * 7)
  return d
})
const weekDays = computed(() => {
  const labels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart.value, i)
    return {
      dateStr: toDateStr(d),
      weekLabel: labels[i],
      dayNum: d.getDate(),
      isToday: toDateStr(d) === toDateStr(todayDate),
    }
  })
})
const weekRangeLabel = computed(() => {
  const s = weekStart.value
  const e = addDays(s, 6)
  return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
})
function prevWeek() {
  weekOffset.value--
}
function nextWeek() {
  weekOffset.value++
}

// ── 資料 ──────────────────────────────────────
const roommates = ['小林', '阿明', '小美', '全屋']
const tagOptions = [
  { name: '輪值', color: '#4845A5' },
  { name: '公告', color: '#F59E0B' },
  { name: '提醒', color: '#10B981' },
  { name: '採購', color: '#8B5CF6' },
  { name: '維護', color: '#EF4444' },
]
function tagColor(tag) {
  return tagOptions.find((t) => t.name === tag)?.color ?? '#64748B'
}
function tagBg(tag) {
  return (tagOptions.find((t) => t.name === tag)?.color ?? '#64748B') + '18'
}

// 產生本週相對日期
function thisWeekDay(offset) {
  const d = new Date(todayDate)
  const sun = new Date(d)
  sun.setDate(d.getDate() - d.getDay())
  sun.setDate(sun.getDate() + offset)
  return toDateStr(sun)
}

let nextId = 8
const tasks = ref([
  {
    id: 1,
    title: '申請曬衣架',
    content: '向管委會申請頂樓曬衣架使用',
    date: thisWeekDay(2),
    assignee: '小美',
    tag: '輪值',
    done: false,
  },
  {
    id: 2,
    title: '倒垃圾',
    content: '週五晚上記得倒垃圾',
    date: thisWeekDay(5),
    assignee: '小林',
    tag: '輪值',
    done: false,
  },
  {
    id: 3,
    title: '繳水電費',
    content: '全屋分攤，每人 400 元',
    date: thisWeekDay(6),
    assignee: '全屋',
    tag: '公告',
    done: false,
  },
  {
    id: 4,
    title: '廚房清潔',
    content: '輪到阿明本週清潔',
    date: thisWeekDay(1),
    assignee: '阿明',
    tag: '輪值',
    done: false,
  },
  {
    id: 5,
    title: '購買衛生紙',
    content: '家樂福買兩串',
    date: thisWeekDay(3),
    assignee: '小美',
    tag: '採購',
    done: true,
  },
])

// ── Filter / View ──────────────────────────────
const activeFilter = ref('all')
const viewMode = ref('week')
const filters = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待辦' },
  { key: 'done', label: '完成' },
]
const filteredTasks = computed(() =>
  tasks.value.filter((t) => {
    if (activeFilter.value === 'todo') return !t.done
    if (activeFilter.value === 'done') return t.done
    return true
  }),
)
function getTasksForDay(dateStr) {
  return tasks.value.filter((t) => t.date === dateStr)
}

// ── 統計 ──────────────────────────────────────
const roommateStats = computed(() =>
  roommates
    .filter((r) => r !== '全屋')
    .map((r) => ({
      name: r,
      total: tasks.value.filter((t) => t.assignee === r || t.assignee === '全屋').length,
      done: tasks.value.filter((t) => (t.assignee === r || t.assignee === '全屋') && t.done).length,
    })),
)
const tagStats = computed(() =>
  tagOptions
    .map((t) => ({ name: t.name, count: tasks.value.filter((tk) => tk.tag === t.name).length }))
    .filter((t) => t.count > 0),
)

// ── Modal ──────────────────────────────────────
const showModal = ref(false)
const editingTask = ref(null)
const modalForm = ref({ title: '', content: '', date: '', assignee: '', tag: '輪值' })

function openAddModal() {
  editingTask.value = null
  modalForm.value = {
    title: '',
    content: '',
    date: toDateStr(todayDate),
    assignee: '',
    tag: '輪值',
  }
  showModal.value = true
}
function openAddOnDay(dateStr) {
  editingTask.value = null
  modalForm.value = { title: '', content: '', date: dateStr, assignee: '', tag: '輪值' }
  showModal.value = true
}
function openEditModal(task) {
  editingTask.value = task
  modalForm.value = {
    title: task.title,
    content: task.content,
    date: task.date,
    assignee: task.assignee,
    tag: task.tag,
  }
  showModal.value = true
}
function closeModal() {
  showModal.value = false
}
function saveTask() {
  if (!modalForm.value.title) return
  if (editingTask.value) {
    Object.assign(editingTask.value, modalForm.value)
    showToastMsg('✓ 事項已更新')
  } else {
    tasks.value.push({ id: ++nextId, done: false, ...modalForm.value })
    showToastMsg('✓ 事項已新增')
  }
  closeModal()
}
function toggleDone(id) {
  const t = tasks.value.find((t) => t.id === id)
  if (t) t.done = !t.done
}
function deleteTask(id) {
  tasks.value = tasks.value.filter((t) => t.id !== id)
  showToastMsg('已刪除事項')
}

// ── AI ────────────────────────────────────────
const showAI = ref(false)
const aiSuggestions = [
  '🔄 小林 和 阿明 本週尚無完成事項，可提醒確認',
  '📢 繳水電費 截止日為週六，建議提前通知全屋',
  '🧹 廚房清潔已設定輪值，可開啟自動週期提醒',
]

// ── Toast ──────────────────────────────────────
const showToast = ref(false)
const toastMsg = ref('')
function showToastMsg(msg) {
  toastMsg.value = msg
  showToast.value = true
  setTimeout(() => (showToast.value = false), 2200)
}

function goPersonal() {
  router.push('/app/notes/personal')
}
</script>

<style scoped>
.page-wrap {
  --c-primary: #4845A5;
  --c-primary-light: #F0EFFE;
  --c-primary-dark: #393684;
  --c-success: #10b981;
  --c-success-light: #ecfdf5;
  --c-warning: #f59e0b;
  --c-danger: #ef4444;
  --c-text: #1e293b;
  --c-muted: #64748b;
  --c-border: #e2e8f0;
  --c-bg: #f8fafc;
  --c-card: #ffffff;
  --radius: 14px;
  --radius-sm: 9px;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.06);

  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  min-height: 100%;
  color: var(--c-text);
  padding: 0 0 48px;
}

/* ── Topbar ── */
.page-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px 0;
}
.breadcrumb {
  font-size: 13px;
  color: var(--c-muted);
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.security-badge {
  font-size: 12px;
  color: var(--c-success);
  font-weight: 600;
  background: var(--c-success-light);
  padding: 4px 12px;
  border-radius: 99px;
}
.ai-btn {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text);
  background: var(--c-card);
  border: 1.5px solid var(--c-border);
  padding: 4px 12px;
  border-radius: 99px;
  cursor: pointer;
  transition: all 0.2s;
}
.ai-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}

/* ── Heading ── */
.page-heading {
  padding: 8px 28px 14px;
}
.page-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}

/* ── Body ── */
.page-body {
  padding: 0 28px;
}
.main-layout {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 20px;
}

/* ── Tab Bar ── */
.tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px 8px 0 0;
  border: 1.5px solid var(--c-border);
  border-bottom: none;
  background: var(--c-bg);
  font-size: 13px;
  font-weight: 500;
  color: var(--c-muted);
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  background: var(--c-card);
  color: var(--c-text);
  font-weight: 700;
}
.tab-count {
  font-size: 11px;
  background: #f1f5f9;
  color: var(--c-muted);
  padding: 1px 7px;
  border-radius: 99px;
  font-weight: 600;
}
.tab-count-active {
  background: var(--c-primary-light);
  color: var(--c-primary);
}
.tab-close {
  font-size: 16px;
  color: var(--c-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 6px;
}
.tab-close:hover {
  color: var(--c-danger);
}
.btn-add {
  padding: 7px 16px;
  background: var(--c-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add:hover {
  background: var(--c-primary-dark);
}

/* ── Filter Bar ── */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  border-bottom: 1.5px solid var(--c-border);
  padding-bottom: 10px;
}
.filter-btn {
  padding: 4px 14px;
  border-radius: 99px;
  border: 1.5px solid var(--c-border);
  background: var(--c-card);
  font-size: 12px;
  font-weight: 500;
  color: var(--c-muted);
  cursor: pointer;
  transition: all 0.2s;
}
.filter-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.filter-btn.active {
  background: var(--c-primary);
  color: #fff;
  border-color: var(--c-primary);
}
.view-toggle {
  margin-left: auto;
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;
}
.view-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: var(--c-muted);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.view-btn.active {
  background: #fff;
  color: var(--c-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

/* ── Week Card ── */
.week-card {
  background: var(--c-card);
  border-radius: var(--radius);
  border: 1.5px solid var(--c-border);
  box-shadow: var(--shadow);
  padding: 18px;
}
.week-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.week-title {
  font-size: 14px;
  font-weight: 700;
}
.week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.week-nav-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px solid var(--c-border);
  background: #fff;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-muted);
}
.week-nav-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.week-range {
  font-size: 12px;
  color: var(--c-muted);
  min-width: 80px;
  text-align: center;
}

/* ── Week Grid ── */
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.week-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 120px;
}
.week-day-label {
  font-size: 11px;
  color: var(--c-muted);
  margin-bottom: 4px;
}
.week-date-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 6px;
  transition: all 0.2s;
}
.week-date-circle.today {
  background: var(--c-primary);
  color: #fff;
}
.week-tasks {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.week-task-chip {
  border-radius: 6px;
  padding: 5px 7px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.week-task-chip:hover {
  filter: brightness(0.95);
  transform: translateY(-1px);
}
.chip-title {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-assignee {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 1px;
}
.week-drop-zone {
  width: 100%;
  margin-top: 4px;
  height: 22px;
  border: 1.5px dashed var(--c-border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--c-border);
  cursor: pointer;
  transition: all 0.2s;
}
.week-drop-zone:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-light);
}

/* ── Legend ── */
.week-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--c-border);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--c-muted);
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* ── Note Cards (list mode) ── */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.note-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--c-card);
  border-radius: var(--radius);
  border: 1.5px solid var(--c-border);
  padding: 14px 16px;
  box-shadow: var(--shadow);
  transition: all 0.2s;
}
.note-card:hover {
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.1);
  border-color: #c7d7f5;
}
.note-card.completed {
  opacity: 0.65;
  background: #fafafa;
}
.note-checkbox {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  flex-shrink: 0;
  margin-top: 1px;
  border: 2px solid var(--c-border);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}
.note-checkbox:hover {
  border-color: var(--c-primary);
}
.note-checkbox.checked {
  background: var(--c-success);
  border-color: var(--c-success);
}
.note-body {
  flex: 1;
  cursor: pointer;
}
.note-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.note-title {
  font-size: 14px;
  font-weight: 600;
}
.note-title.done-text {
  text-decoration: line-through;
  color: var(--c-muted);
}
.note-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 99px;
}
.note-content {
  font-size: 12px;
  color: var(--c-muted);
  margin-bottom: 7px;
  line-height: 1.6;
}
.note-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.meta-item {
  font-size: 11px;
  color: var(--c-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
.meta-icon {
  font-size: 12px;
}
.note-delete {
  font-size: 14px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-muted);
  opacity: 0;
  transition: opacity 0.2s;
}
.note-card:hover .note-delete {
  opacity: 1;
}
.note-delete:hover {
  color: var(--c-danger);
}
.empty-state {
  text-align: center;
  padding: 48px 0;
}
.empty-icon {
  font-size: 36px;
  margin-bottom: 10px;
}
.empty-text {
  font-size: 13px;
  color: var(--c-muted);
}

/* ── Side Cards ── */
.card {
  background: var(--c-card);
  border-radius: var(--radius);
  border: 1.5px solid var(--c-border);
  box-shadow: var(--shadow);
}
.summary-card {
  padding: 16px 18px;
}
.summary-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
}
.summary-rows {
  display: flex;
  flex-direction: column;
}
.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--c-border);
}
.summary-row:last-child {
  border-bottom: none;
}
.summary-label {
  font-size: 13px;
  color: var(--c-muted);
}
.summary-val {
  font-size: 20px;
  font-weight: 800;
}
.summary-val.blue {
  color: var(--c-primary);
}
.summary-val.green {
  color: var(--c-success);
}

.roommate-card {
  padding: 16px 18px;
}
.roommate-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.roommate-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rm-name {
  font-size: 12px;
  color: var(--c-text);
  min-width: 32px;
}
.rm-progress-wrap {
  flex: 1;
}
.rm-progress-track {
  height: 5px;
  background: #f1f5f9;
  border-radius: 99px;
  overflow: hidden;
}
.rm-progress-fill {
  height: 100%;
  background: var(--c-primary);
  border-radius: 99px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.rm-stat {
  font-size: 11px;
  color: var(--c-muted);
  white-space: nowrap;
}

.tag-card {
  padding: 16px 18px;
}
.type-rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.type-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 99px;
}
.type-count {
  font-size: 12px;
  color: var(--c-muted);
}

.ai-card {
  padding: 14px 16px;
  background: linear-gradient(135deg, #F0EFFE, #f5f3ff);
}
.ai-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.ai-icon {
  font-size: 16px;
}
.ai-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-primary);
}
.ai-suggestions {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.ai-item {
  font-size: 12px;
  color: #3730a3;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 7px;
  padding: 6px 10px;
  line-height: 1.5;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal {
  background: var(--c-card);
  border-radius: var(--radius);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
  width: 100%;
  max-width: 460px;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--c-border);
}
.modal-title {
  font-size: 15px;
  font-weight: 700;
}
.modal-close {
  font-size: 20px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-muted);
  padding: 0 4px;
}
.modal-close:hover {
  color: var(--c-danger);
}
.modal-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mfield {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.mfield-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mlabel {
  font-size: 12px;
  font-weight: 600;
}
.minput {
  padding: 8px 11px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--c-text);
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.minput:focus {
  outline: none;
  border-color: var(--c-primary);
}
.mselect {
  padding: 8px 11px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--c-text);
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s;
}
.mselect:focus {
  outline: none;
  border-color: var(--c-primary);
}
.mtextarea {
  padding: 8px 11px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--c-text);
  resize: vertical;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}
.mtextarea:focus {
  outline: none;
  border-color: var(--c-primary);
}
.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.tag-opt-btn {
  padding: 4px 13px;
  border-radius: 99px;
  border: 1.5px solid var(--c-border);
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--c-muted);
}
.modal-footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--c-border);
}
.btn-cancel {
  padding: 9px 18px;
  background: #fff;
  color: var(--c-muted);
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.btn-save {
  flex: 1;
  padding: 9px;
  background: var(--c-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-save:hover:not(:disabled) {
  background: var(--c-primary-dark);
}
.btn-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #fff;
  padding: 10px 22px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  z-index: 999;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
}
.toast-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* ── Transitions ── */
.slide-fade-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.note-list-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.note-list-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.note-list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.note-list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.fade-enter-active {
  transition: opacity 0.25s;
}
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ── RWD ── */
@media (max-width: 900px) {
  .week-grid {
    grid-template-columns: repeat(7, 1fr);
  }
  .chip-assignee {
    display: none;
  }
}
@media (max-width: 700px) {
  .page-topbar,
  .page-heading,
  .page-body {
    padding-left: 16px;
    padding-right: 16px;
  }
  .main-layout {
    grid-template-columns: 1fr;
  }
  .week-grid {
    grid-template-columns: repeat(4, 1fr);
    overflow-x: auto;
  }
}
</style>
