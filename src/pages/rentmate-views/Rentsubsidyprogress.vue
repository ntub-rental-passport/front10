<template>
  <div class="progress-page">
    <SectionTabs group="subsidy" />

    <div class="page-topbar">
      <div class="breadcrumb">租補申請管理 / <span>申請進度查詢</span></div>
      <div class="topbar-right">
        <span class="topbar-date">{{ today }}</span>
      </div>
    </div>

    <div class="page-heading">
      <h1 class="page-title">租補申請進度</h1>
      <p class="page-sub">追蹤您的租金補貼申請審核狀態，並管理補件與通知</p>
    </div>

    <div class="case-tabs">
      <button
        v-for="c in cases"
        :key="c.caseNo"
        class="case-tab"
        :class="{ active: selectedCase === c.caseNo }"
        @click="selectedCase = c.caseNo"
      >
        <span class="case-tab-no">{{ c.caseNo }}</span>
        <span class="case-tab-scheme">{{ c.scheme }}</span>
        <span class="case-tab-badge" :class="c.statusCls">{{ c.statusLabel }}</span>
      </button>
    </div>

    <!-- 主內容 -->
    <template v-if="current">
      <!-- 警示補件通知（如有） -->
      <div v-if="current.pendingSupplement" class="alert-banner">
        <span class="alert-icon">⚠️</span>
        <div class="alert-body">
          <strong>需要補件</strong>
          「{{ current.pendingSupplement }}」尚未上傳，補件截止日：<strong>{{
            current.supplementDeadline
          }}</strong
          >。逾期將影響本期補貼申請。
        </div>
        <button class="alert-btn" @click="goSupplement">立即補件 →</button>
      </div>

      <!-- 四個統計卡 -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-label">申請案號</div>
          <div class="stat-value mono">{{ current.caseNo }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-label">申請日期</div>
          <div class="stat-value">{{ current.applyDate }}</div>
        </div>
        <div class="stat-card highlight">
          <div class="stat-icon">💰</div>
          <div class="stat-label">核定補貼金額</div>
          <div class="stat-value large" v-if="current.approvedAmount">
            NT$ {{ current.approvedAmount.toLocaleString() }}
            <span class="stat-unit">/月</span>
          </div>
          <div class="stat-value pending-text" v-else>審核中</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🏦</div>
          <div class="stat-label">下次撥款日</div>
          <div class="stat-value" v-if="current.nextPayDate">{{ current.nextPayDate }}</div>
          <div class="stat-value pending-text" v-else>待核定</div>
        </div>
      </div>

      <!-- 主要內容兩欄 -->
      <div class="main-cols">
        <!-- 左：審核流程時間軸 -->
        <div class="col-left">
          <div class="card">
            <div class="card-header">
              <span class="card-title">審核流程</span>
              <span class="card-badge" :class="current.statusCls">{{ current.statusLabel }}</span>
            </div>

            <div class="timeline">
              <div
                v-for="(step, i) in current.timeline"
                :key="i"
                class="tl-item"
                :class="{
                  done: step.status === 'done',
                  active: step.status === 'active',
                  pending: step.status === 'pending',
                  failed: step.status === 'failed',
                }"
              >
                <!-- 連接線 -->
                <div class="tl-line" v-if="i < current.timeline.length - 1"></div>

                <!-- 節點圓圈 -->
                <div class="tl-dot">
                  <span v-if="step.status === 'done'">✓</span>
                  <span v-else-if="step.status === 'active'" class="pulse-dot"></span>
                  <span v-else-if="step.status === 'failed'">✗</span>
                  <span v-else>{{ i + 1 }}</span>
                </div>

                <!-- 內容 -->
                <div class="tl-content">
                  <div class="tl-title">{{ step.title }}</div>
                  <div class="tl-date" v-if="step.date">{{ step.date }}</div>
                  <div class="tl-note" v-if="step.note">{{ step.note }}</div>
                  <!-- 補件標籤 -->
                  <div class="tl-supplement" v-if="step.supplement">
                    <span class="supp-tag">📎 補件</span>
                    <span
                      class="supp-item"
                      v-for="s in step.supplement"
                      :key="s"
                      :class="s.done ? 'supp-done' : 'supp-pending'"
                    >
                      {{ s.done ? '✓' : '○' }} {{ s.name }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：文件狀態 + 撥款紀錄 -->
        <div class="col-right">
          <!-- 文件上傳狀態 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">文件狀態</span>
              <span class="doc-summary"> {{ docDoneCount }}/{{ current.docs.length }} 已上傳 </span>
            </div>
            <div class="doc-list">
              <div v-for="doc in current.docs" :key="doc.key" class="doc-row">
                <div class="doc-row-left">
                  <span class="doc-status-dot" :class="doc.status"></span>
                  <div>
                    <div class="doc-row-name">{{ doc.label }}</div>
                    <div class="doc-row-hint" v-if="doc.hint">{{ doc.hint }}</div>
                  </div>
                </div>
                <div class="doc-row-right">
                  <span class="doc-chip" :class="'chip-' + doc.status">
                    {{ docStatusLabel(doc.status) }}
                  </span>
                  <button
                    v-if="doc.status === 'missing' || doc.status === 'rejected'"
                    class="doc-upload-btn"
                    @click="goSupplement"
                  >
                    上傳
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 撥款紀錄 -->
          <div class="card" style="margin-top: 16px">
            <div class="card-header">
              <span class="card-title">撥款紀錄</span>
            </div>
            <div v-if="current.payments.length" class="payment-list">
              <div v-for="p in current.payments" :key="p.period" class="payment-row">
                <div class="payment-left">
                  <div class="payment-period">{{ p.period }}</div>
                  <div class="payment-date">{{ p.date }}</div>
                </div>
                <div class="payment-right">
                  <div class="payment-amount">NT$ {{ p.amount.toLocaleString() }}</div>
                  <span class="payment-chip" :class="p.done ? 'chip-done' : 'chip-pending'">
                    {{ p.done ? '已撥款' : '待撥款' }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="empty-state">
              <div class="empty-icon">💳</div>
              <div class="empty-text">尚無撥款紀錄，審核通過後將顯示於此</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按鈕列 -->
      <div class="action-bar">
        <button
          class="action-btn outline"
          @click="goSupplement"
          v-if="current.pendingSupplement"
        >
          📎 前往補件上傳
        </button>
        <button class="action-btn outline" @click="downloadReceipt">⬇ 下載申請收據</button>
        <button class="action-btn outline" @click="contactAgent">💬 聯絡承辦人員</button>
        <button class="action-btn primary" @click="goApply" v-if="current.canReapply">
          重新申請 →
        </button>
      </div>
    </template>

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

// ── 今日日期 ──────────────────────────────────
const today = new Date()
  .toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  .replace(/\//g, '-')

// ── 案件資料（實際由 API 取得） ──────────────
const cases = ref([
  {
    caseNo: 'RM20240409-38271',
    scheme: '住宅補貼 – 租金補貼',
    statusLabel: '補件中',
    statusCls: 'status-warning',
    applyDate: '2024-03-15',
    approvedAmount: null,
    nextPayDate: null,
    pendingSupplement: '在職證明',
    supplementDeadline: '2026/04/19',
    canReapply: false,
    timeline: [
      {
        title: '申請送出',
        status: 'done',
        date: '2024-03-15 14:22',
        note: '系統已收件，申請資料完整',
      },
      {
        title: '資格初審',
        status: 'done',
        date: '2024-03-20 09:05',
        note: '基本資格符合，進入文件審查',
      },
      {
        title: '文件審查',
        status: 'active',
        date: '進行中',
        note: '部分文件需補充，請依通知上傳',
        supplement: [
          { name: '戶籍謄本', done: true },
          { name: '租賃契約書', done: true },
          { name: '在職證明', done: false },
        ],
      },
      { title: '複審核定', status: 'pending', date: null, note: null },
      { title: '核定通知', status: 'pending', date: null, note: null },
      { title: '補貼撥款', status: 'pending', date: null, note: null },
    ],
    docs: [
      { key: 'id', label: '身分證正反面', status: 'approved', hint: null },
      { key: 'lease', label: '租賃契約書', status: 'approved', hint: null },
      { key: 'household', label: '戶籍謄本', status: 'approved', hint: '2024-03-18 重新上傳' },
      { key: 'income', label: '在職證明', status: 'missing', hint: '請上傳最新版本' },
      { key: 'bankbook', label: '存摺封面', status: 'approved', hint: null },
    ],
    payments: [],
  },
  {
    caseNo: 'RM20230901-19045',
    scheme: '青年安心成家補貼',
    statusLabel: '撥款中',
    statusCls: 'status-success',
    applyDate: '2023-08-10',
    approvedAmount: 5000,
    nextPayDate: '2024-05-01',
    pendingSupplement: null,
    supplementDeadline: null,
    canReapply: false,
    timeline: [
      { title: '申請送出', status: 'done', date: '2023-08-10', note: null },
      { title: '資格初審', status: 'done', date: '2023-08-18', note: null },
      { title: '文件審查', status: 'done', date: '2023-08-25', note: '文件審查通過' },
      { title: '複審核定', status: 'done', date: '2023-09-05', note: null },
      { title: '核定通知', status: 'done', date: '2023-09-10', note: '核定每月補貼 NT$5,000' },
      { title: '補貼撥款', status: 'active', date: '撥款中', note: '每月 1 日撥入指定帳戶' },
    ],
    docs: [
      { key: 'id', label: '身分證正反面', status: 'approved', hint: null },
      { key: 'lease', label: '租賃契約書', status: 'approved', hint: null },
      { key: 'household', label: '戶籍謄本', status: 'approved', hint: null },
      { key: 'income', label: '所得證明', status: 'approved', hint: null },
      { key: 'bankbook', label: '存摺封面', status: 'approved', hint: null },
    ],
    payments: [
      { period: '2024年4月', date: '2024-04-01', amount: 5000, done: true },
      { period: '2024年3月', date: '2024-03-01', amount: 5000, done: true },
      { period: '2024年2月', date: '2024-02-01', amount: 5000, done: true },
      { period: '2024年5月', date: '2024-05-01', amount: 5000, done: false },
    ],
  },
])

const selectedCase = ref(cases.value[0].caseNo)
const current = computed(() => cases.value.find((c) => c.caseNo === selectedCase.value))

// ── 文件 ──────────────────────────────────────
const docDoneCount = computed(
  () => current.value?.docs.filter((d) => d.status === 'approved').length ?? 0,
)

function docStatusLabel(status) {
  return (
    { approved: '✓ 審核通過', pending: '審核中', missing: '未上傳', rejected: '需重傳' }[status] ??
    status
  )
}

// ── Toast ──────────────────────────────────────
const showToast = ref(false)
const toastMsg = ref('')
function toast(msg) {
  toastMsg.value = msg
  showToast.value = true
  setTimeout(() => (showToast.value = false), 2500)
}

function downloadReceipt() {
  toast('📄 申請收據已開始下載')
}
function contactAgent() {
  toast('💬 已複製承辦人員聯絡信箱')
}

function goSupplement() {
  router.push('/app/subsidy/upload')
}

function goApply() {
  router.push('/app/subsidy/apply')
}
</script>

<style scoped>
.progress-page {
  --c-primary: #4845A5;
  --c-primary-light: #F0EFFE;
  --c-primary-dark: #393684;
  --c-success: #10b981;
  --c-success-light: #ecfdf5;
  --c-warning: #f59e0b;
  --c-warning-light: #fffbeb;
  --c-danger: #ef4444;
  --c-danger-light: #fef2f2;
  --c-text: #1e293b;
  --c-muted: #64748b;
  --c-border: #e2e8f0;
  --c-bg: #f8fafc;
  --c-card: #ffffff;
  --radius: 14px;
  --radius-sm: 9px;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.06);

  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  background: var(--c-bg);
  min-height: 100%;
  color: var(--c-text);
  padding: 0 0 48px;
  position: relative;
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
.breadcrumb span {
  color: var(--c-text);
  font-weight: 600;
}
.topbar-right {
  font-size: 13px;
  color: var(--c-muted);
}

/* ── Heading ── */
.page-heading {
  padding: 10px 28px 18px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 3px;
}
.page-sub {
  font-size: 13px;
  color: var(--c-muted);
  margin: 0;
}

/* ── Case Tabs ── */
.case-tabs {
  display: flex;
  gap: 10px;
  padding: 0 28px 20px;
  overflow-x: auto;
  flex-wrap: wrap;
}
.case-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 99px;
  border: 1.5px solid var(--c-border);
  background: var(--c-card);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.case-tab:hover {
  border-color: var(--c-primary);
}
.case-tab.active {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.case-tab-no {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-primary);
  font-variant-numeric: tabular-nums;
}
.case-tab-scheme {
  font-size: 12px;
  color: var(--c-muted);
}
.case-tab-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 99px;
  font-weight: 600;
}

/* ── Alert Banner ── */
.alert-banner {
  margin: 0 28px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fffbeb;
  border: 1.5px solid #fde68a;
  border-radius: var(--radius);
  padding: 14px 16px;
}
.alert-icon {
  font-size: 20px;
  flex-shrink: 0;
}
.alert-body {
  flex: 1;
  font-size: 13px;
  color: #78350f;
  line-height: 1.6;
}
.alert-body strong {
  color: #92400e;
}
.alert-btn {
  padding: 7px 16px;
  background: #d97706;
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.alert-btn:hover {
  background: #b45309;
}

/* ── Stat Grid ── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  padding: 0 28px 20px;
}
.stat-card {
  background: var(--c-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px 18px;
  border: 1.5px solid var(--c-border);
}
.stat-card.highlight {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.stat-icon {
  font-size: 20px;
  margin-bottom: 6px;
}
.stat-label {
  font-size: 12px;
  color: var(--c-muted);
  margin-bottom: 4px;
}
.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.stat-value.large {
  font-size: 20px;
  color: var(--c-primary);
}
.stat-value.pending-text {
  color: var(--c-muted);
  font-weight: 500;
  font-size: 13px;
}
.stat-value.mono {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.stat-unit {
  font-size: 13px;
  color: var(--c-muted);
  font-weight: 400;
}

/* ── Main Cols ── */
.main-cols {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  padding: 0 28px;
}

/* ── Card ── */
.card {
  background: var(--c-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1.5px solid var(--c-border);
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--c-border);
}
.card-title {
  font-size: 14px;
  font-weight: 700;
}
.card-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 99px;
  font-weight: 600;
}
.doc-summary {
  font-size: 12px;
  color: var(--c-muted);
}

/* ── Status Colors ── */
.status-success {
  background: var(--c-success-light);
  color: #065f46;
}
.status-warning {
  background: #fef3c7;
  color: #92400e;
}
.status-danger {
  background: var(--c-danger-light);
  color: #991b1b;
}
.status-info {
  background: var(--c-primary-light);
  color: var(--c-primary);
}
.status-muted {
  background: #f1f5f9;
  color: var(--c-muted);
}

/* ── Timeline ── */
.timeline {
  padding: 18px 18px 10px;
}
.tl-item {
  display: flex;
  gap: 14px;
  padding-bottom: 22px;
  position: relative;
}
.tl-item:last-child {
  padding-bottom: 0;
}

.tl-line {
  position: absolute;
  left: 15px;
  top: 32px;
  width: 2px;
  height: calc(100% - 10px);
  background: var(--c-border);
}
.tl-item.done .tl-line {
  background: var(--c-success);
}
.tl-item.active .tl-line {
  background: linear-gradient(var(--c-primary), var(--c-border));
}

.tl-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  z-index: 1;
  border: 2px solid var(--c-border);
  background: var(--c-card);
  color: var(--c-muted);
  transition: all 0.2s;
}
.tl-item.done .tl-dot {
  background: var(--c-success);
  border-color: var(--c-success);
  color: #fff;
}
.tl-item.active .tl-dot {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}
.tl-item.failed .tl-dot {
  background: var(--c-danger);
  border-color: var(--c-danger);
  color: #fff;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.6);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(255, 255, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
}

.tl-content {
  padding-top: 4px;
  flex: 1;
}
.tl-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
}
.tl-item.pending .tl-title {
  color: var(--c-muted);
  font-weight: 500;
}
.tl-date {
  font-size: 12px;
  color: var(--c-muted);
  margin-bottom: 4px;
}
.tl-item.active .tl-date {
  color: var(--c-primary);
  font-weight: 600;
}
.tl-note {
  font-size: 12px;
  color: var(--c-muted);
  line-height: 1.6;
}

.tl-supplement {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}
.supp-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-muted);
}
.supp-item {
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 99px;
  font-weight: 500;
}
.supp-done {
  background: var(--c-success-light);
  color: #065f46;
}
.supp-pending {
  background: #fef3c7;
  color: #92400e;
}

/* ── Doc List ── */
.doc-list {
  padding: 8px 0;
}
.doc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 18px;
  gap: 10px;
  border-bottom: 1px solid var(--c-border);
}
.doc-row:last-child {
  border-bottom: none;
}
.doc-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}
.doc-row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.doc-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.doc-status-dot.approved {
  background: var(--c-success);
}
.doc-status-dot.pending {
  background: var(--c-warning);
}
.doc-status-dot.missing {
  background: var(--c-danger);
}
.doc-status-dot.rejected {
  background: var(--c-danger);
}
.doc-row-name {
  font-size: 13px;
  font-weight: 500;
}
.doc-row-hint {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 1px;
}
.doc-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 99px;
}
.chip-approved {
  background: var(--c-success-light);
  color: #065f46;
}
.chip-pending {
  background: #fef3c7;
  color: #92400e;
}
.chip-missing {
  background: var(--c-danger-light);
  color: #991b1b;
}
.chip-rejected {
  background: var(--c-danger-light);
  color: #991b1b;
}
.chip-done {
  background: var(--c-success-light);
  color: #065f46;
}

.doc-upload-btn {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--c-primary);
  color: var(--c-primary);
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.doc-upload-btn:hover {
  background: var(--c-primary);
  color: #fff;
}

/* ── Payment List ── */
.payment-list {
  padding: 4px 0;
}
.payment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid var(--c-border);
}
.payment-row:last-child {
  border-bottom: none;
}
.payment-period {
  font-size: 13px;
  font-weight: 600;
}
.payment-date {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 1px;
}
.payment-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.payment-amount {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-primary);
}
.chip-pending {
  background: #fef3c7;
  color: #92400e;
}

.empty-state {
  padding: 28px;
  text-align: center;
}
.empty-icon {
  font-size: 28px;
  margin-bottom: 8px;
}
.empty-text {
  font-size: 13px;
  color: var(--c-muted);
  line-height: 1.6;
}

/* ── Action Bar ── */
.action-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 20px 28px 0;
}
.action-btn {
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn.outline {
  background: var(--c-card);
  color: var(--c-text);
  border: 1.5px solid var(--c-border);
}
.action-btn.outline:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.action-btn.primary {
  background: var(--c-primary);
  color: #fff;
  border: none;
}
.action-btn.primary:hover {
  background: var(--c-primary-dark);
}

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #fff;
  padding: 11px 22px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  z-index: 999;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
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

/* ── RWD ── */
@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .main-cols {
    grid-template-columns: 1fr;
  }
  .col-right {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
}
@media (max-width: 600px) {
  .page-topbar,
  .page-heading,
  .case-tabs,
  .alert-banner,
  .stat-grid,
  .main-cols,
  .action-bar {
    padding-left: 16px;
    padding-right: 16px;
  }
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .col-right {
    grid-template-columns: 1fr;
  }
}
</style>
