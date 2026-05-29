<template>
  <div class="page-wrap">



    <!-- Heading -->
    <div class="page-heading">
      <div class="heading-row">
        <div>
          <p class="page-sub">請依照補件通知上傳所需文件，以繼續審核流程</p>
        </div>
        <div class="case-chip">
          <span class="case-chip-label">申請案號</span>
          <span class="case-chip-no">{{ caseNo }}</span>
        </div>
      </div>
    </div>

    <!-- 主內容 -->
    <div class="page-body">
      <!-- 補件通知橫幅 -->
      <div class="alert-banner">
        <span class="alert-icon">📋</span>
        <div class="alert-body">
          <strong>補件通知</strong>
          您的申請於 <strong>{{ noticeDate }}</strong> 經審核確認，以下文件需補充或重新上傳， 請於
          <strong class="deadline">{{ deadline }}</strong> 前完成，逾期將影響審核進度。
        </div>
        <div class="alert-countdown" :class="countdownClass">
          <div class="countdown-num">{{ daysLeft }}</div>
          <div class="countdown-label">天後截止</div>
        </div>
      </div>

      <!-- 兩欄佈局 -->
      <div class="two-col">
        <!-- 左：必填補件 -->
        <div>
          <div class="section-label">
            <span>需補件項目</span>
            <span class="section-count">{{ requiredItems.length }} 項</span>
          </div>

          <div class="doc-cards">
            <div
              v-for="doc in requiredItems"
              :key="doc.key"
              class="card doc-card"
              :class="{
                'card-uploaded': fileStates[doc.key]?.status === 'done',
                'card-uploading': fileStates[doc.key]?.status === 'uploading',
                'card-error': fileStates[doc.key]?.status === 'error',
              }"
            >
              <div class="doc-status-bar" :class="fileStates[doc.key]?.status || 'pending'"></div>
              <div class="doc-card-inner">
                <div class="doc-top">
                  <div class="doc-meta">
                    <span class="doc-tag" :class="doc.urgent ? 'tag-urgent' : 'tag-req'">
                      {{ doc.urgent ? '⚠ 緊急' : '必填' }}
                    </span>
                    <span class="doc-name">{{ doc.label }}</span>
                  </div>
                  <span v-if="!fileStates[doc.key]" class="state-chip chip-pending">待上傳</span>
                  <span
                    v-else-if="fileStates[doc.key].status === 'uploading'"
                    class="state-chip chip-uploading"
                    >上傳中…</span
                  >
                  <span
                    v-else-if="fileStates[doc.key].status === 'done'"
                    class="state-chip chip-done"
                    >✓ 已上傳</span
                  >
                  <span
                    v-else-if="fileStates[doc.key].status === 'error'"
                    class="state-chip chip-error"
                    >✗ 失敗</span
                  >
                </div>

                <div class="doc-reason">
                  <span class="reason-label">補件原因：</span>{{ doc.reason }}
                </div>
                <div class="doc-requirement">{{ doc.requirement }}</div>

                <!-- 上傳區 -->
                <div class="upload-row">
                  <div
                    class="drop-zone"
                    :class="{
                      'dz-drag': dragOver[doc.key],
                      'dz-done': fileStates[doc.key]?.status === 'done',
                    }"
                    @dragover.prevent="dragOver[doc.key] = true"
                    @dragleave="dragOver[doc.key] = false"
                    @drop.prevent="(e) => handleDrop(doc.key, e)"
                    @click="fileInputs[doc.key]?.click()"
                  >
                    <input
                      type="file"
                      :ref="(el) => (fileInputs[doc.key] = el)"
                      :accept="doc.accept"
                      hidden
                      @change="(e) => handleFileChange(doc.key, e)"
                    />

                    <template v-if="!fileStates[doc.key] || fileStates[doc.key].status === 'error'">
                      <div class="dz-icon">📁</div>
                      <div class="dz-main">點擊選擇或拖曳至此</div>
                      <div class="dz-sub">JPG / PNG / PDF，最大 10MB</div>
                    </template>
                    <template v-else-if="fileStates[doc.key].status === 'uploading'">
                      <div class="upload-spinner"></div>
                      <div class="dz-main">{{ fileStates[doc.key].name }}</div>
                      <div class="progress-track">
                        <div
                          class="progress-fill"
                          :style="{ width: fileStates[doc.key].progress + '%' }"
                        ></div>
                      </div>
                      <div class="dz-sub">{{ fileStates[doc.key].progress }}%</div>
                    </template>
                    <template v-else-if="fileStates[doc.key].status === 'done'">
                      <div class="dz-done-icon">✅</div>
                      <div class="dz-main done-name">{{ fileStates[doc.key].name }}</div>
                      <div class="dz-sub">{{ fileStates[doc.key].size }}</div>
                      <button class="replace-btn" @click.stop="replaceFile(doc.key)">
                        重新上傳
                      </button>
                    </template>
                  </div>
                  <div v-if="fileStates[doc.key]?.preview" class="preview-thumb">
                    <img :src="fileStates[doc.key].preview" alt="預覽" />
                  </div>
                </div>

                <div v-if="fileStates[doc.key]?.status === 'error'" class="error-msg">
                  ⚠ {{ fileStates[doc.key].errorMsg }} — 請重新上傳
                </div>
              </div>
            </div>
          </div>

          <!-- 選填補充 -->
          <div class="section-label" style="margin-top: 20px">
            <span>選填補充文件</span>
            <span class="section-count optional">{{ optionalItems.length }} 項</span>
          </div>
          <div class="card">
            <div v-for="doc in optionalItems" :key="doc.key" class="optional-row">
              <div class="optional-info">
                <div class="optional-name">{{ doc.label }}</div>
                <div class="optional-hint">{{ doc.hint }}</div>
              </div>
              <label
                class="upload-btn"
                :class="{ uploaded: fileStates[doc.key]?.status === 'done' }"
              >
                <input
                  type="file"
                  :accept="doc.accept"
                  hidden
                  @change="(e) => handleFileChange(doc.key, e)"
                />
                <span v-if="fileStates[doc.key]?.status !== 'done'">📎 上傳</span>
                <span v-else class="uploaded-name">✓ {{ fileStates[doc.key].name }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 右：說明 + 進度 + 操作 -->
        <div class="side-col">
          <!-- 上傳進度卡 -->
          <div class="card info-card">
            <div class="info-icon">📊</div>
            <div class="info-title">補件進度</div>
            <div class="progress-display">
              <span class="prog-text"
                >已完成 <strong>{{ doneCount }}</strong> / {{ requiredItems.length }} 項</span
              >
            </div>
            <div class="progress-track" style="margin-top: 8px">
              <div
                class="progress-fill"
                :style="{ width: (doneCount / requiredItems.length) * 100 + '%' }"
              ></div>
            </div>
            <div v-for="doc in requiredItems" :key="doc.key" class="prog-item">
              <span class="prog-dot" :class="fileStates[doc.key]?.status || 'pending'"></span>
              <span class="prog-name">{{ doc.label }}</span>
              <span class="prog-state">{{
                fileStates[doc.key]?.status === 'done' ? '✓' : '○'
              }}</span>
            </div>
          </div>

          <!-- 注意事項 -->
          <div class="card info-card" style="margin-top: 12px">
            <div class="info-icon">📌</div>
            <div class="info-title">上傳注意事項</div>
            <ul class="info-list">
              <li>文件需清晰可辨，勿遮蔽重要資訊</li>
              <li>照片請以 JPG/PNG 上傳</li>
              <li>文件建議使用 PDF 格式</li>
              <li>單一檔案大小不超過 <strong>10MB</strong></li>
              <li>影像建議解析度 300 dpi 以上</li>
              <li>請確認文件在有效期限內</li>
            </ul>
          </div>

          <!-- 操作按鈕 -->
          <div class="card info-card" style="margin-top: 12px">
            <button class="btn-outline full-btn" @click="saveDraft" style="margin-bottom: 10px">
              💾 暫存草稿
            </button>
            <button
              class="btn-primary full-btn"
              :disabled="!allRequiredDone"
              @click="submitSupplement"
            >
              送出補件 →
            </button>
            <p class="footer-note">所有必填文件上傳完成後方可送出</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <transition name="toast">
      <div v-if="showToast" class="toast" :class="toastType">{{ toastMsg }}</div>
    </transition>

    <!-- 送出成功 Overlay -->
    <transition name="fade">
      <div v-if="submitted" class="overlay">
        <div class="success-modal">
          <div class="success-anim">✅</div>
          <h2>補件資料已送出！</h2>
          <p>系統將通知審核人員繼續處理，<br />請於 3～5 個工作天後查看進度。</p>
          <div class="case-block">案號：{{ caseNo }}</div>
          <button class="btn-primary" @click="goProgress">查看申請進度 →</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import SectionTabs from '@/src/components/section-tabs.vue'

const router = useRouter()
const today = new Date()
  .toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\//g, '-')

const caseNo = ref('RM20240409-38271')
const noticeDate = ref('2024-04-05')
const deadline = ref('2024-04-19')

const daysLeft = computed(() =>
  Math.max(Math.ceil((new Date(deadline.value) - new Date()) / 86400000), 0),
)
const countdownClass = computed(() =>
  daysLeft.value <= 3 ? 'urgent' : daysLeft.value <= 7 ? 'warning' : 'safe',
)

const requiredItems = [
  {
    key: 'household',
    label: '戶籍謄本',
    reason: '所提供之戶籍謄本已逾三個月，請重新申請核發',
    requirement: '請至戶政事務所或 MyData 申請最新戶籍謄本（三個月內核發）',
    accept: 'image/*,.pdf',
    urgent: true,
  },
  {
    key: 'income',
    label: '所得證明文件',
    reason: '所得證明文件不完整，缺少雇主蓋章或薪資明細',
    requirement: '請提供最近三個月薪資明細並由雇主蓋章，或最新年度所得稅申報資料',
    accept: 'image/*,.pdf',
    urgent: false,
  },
  {
    key: 'lease_sign',
    label: '租賃契約書（簽名頁）',
    reason: '上傳之契約缺少房東或租客簽名',
    requirement: '請補充含雙方完整簽名之契約頁面（含封面、雙方資料頁及簽名頁）',
    accept: 'image/*,.pdf',
    urgent: false,
  },
]
const optionalItems = [
  {
    key: 'disability',
    label: '身心障礙手冊',
    hint: '如有身心障礙身分，可附上以加速審核',
    accept: 'image/*,.pdf',
  },
  {
    key: 'singleParent',
    label: '單親家庭證明',
    hint: '單親家庭可附上相關證明文件',
    accept: 'image/*,.pdf',
  },
  {
    key: 'other',
    label: '其他補充說明',
    hint: '如有其他說明文件，可一併上傳',
    accept: 'image/*,.pdf',
  },
]

const fileStates = reactive({})
const fileInputs = reactive({})
const dragOver = reactive({})

function handleDrop(key, e) {
  dragOver[key] = false
  const file = e.dataTransfer.files[0]
  if (file) processFile(key, file)
}
function handleFileChange(key, e) {
  const file = e.target.files[0]
  if (file) processFile(key, file)
}
function replaceFile(key) {
  fileStates[key] = null
  fileInputs[key]?.click()
}

function processFile(key, file) {
  if (file.size > 10 * 1024 * 1024) {
    fileStates[key] = { status: 'error', name: file.name, errorMsg: '檔案超過 10MB 限制' }
    return
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowed.includes(file.type)) {
    fileStates[key] = { status: 'error', name: file.name, errorMsg: '不支援的檔案格式' }
    return
  }
  let preview = null
  if (file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (fileStates[key]) fileStates[key].preview = e.target.result
    }
    reader.readAsDataURL(file)
  }
  fileStates[key] = { status: 'uploading', name: file.name, progress: 0, preview }
  let prog = 0
  const timer = setInterval(() => {
    prog += Math.floor(Math.random() * 18) + 8
    if (prog >= 100) {
      clearInterval(timer)
      fileStates[key] = {
        status: 'done',
        name: file.name,
        size: formatSize(file.size),
        preview: fileStates[key]?.preview || null,
      }
    } else {
      fileStates[key].progress = prog
    }
  }, 120)
}
function formatSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}

const doneCount = computed(
  () => requiredItems.filter((d) => fileStates[d.key]?.status === 'done').length,
)
const allRequiredDone = computed(() => doneCount.value === requiredItems.length)

const showToast = ref(false)
const toastMsg = ref('')
const toastType = ref('info')
function showToastMsg(msg, type = 'info') {
  toastMsg.value = msg
  toastType.value = type
  showToast.value = true
  setTimeout(() => (showToast.value = false), 2800)
}
function saveDraft() {
  showToastMsg('✓ 草稿已暫存，可稍後繼續上傳', 'success')
}

const submitted = ref(false)
function submitSupplement() {
  submitted.value = true
}
function goProgress() {
  submitted.value = false
  router.push('/app/subsidy/progress')
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
  min-height: 100%;
  color: var(--c-text);
  padding: 0 0 48px;
  position: relative;
}
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
.page-heading {
  padding: 10px 28px 16px;
}
.heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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
.case-chip {
  background: var(--c-primary-light);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  text-align: right;
  flex-shrink: 0;
}
.case-chip-label {
  font-size: 11px;
  color: var(--c-muted);
  display: block;
  margin-bottom: 2px;
}
.case-chip-no {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-primary);
  letter-spacing: 1px;
}
.page-body {
  padding: 0 28px;
}
.alert-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fffbeb;
  border: 1.5px solid #fde68a;
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 20px;
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
.deadline {
  color: var(--c-danger) !important;
}
.alert-countdown {
  text-align: center;
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  flex-shrink: 0;
  min-width: 60px;
}
.alert-countdown.safe {
  background: var(--c-success-light);
  color: #065f46;
}
.alert-countdown.warning {
  background: #fef3c7;
  color: #92400e;
}
.alert-countdown.urgent {
  background: var(--c-danger-light);
  color: #991b1b;
}
.countdown-num {
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
}
.countdown-label {
  font-size: 10px;
  margin-top: 2px;
  font-weight: 600;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 16px;
}
.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
}
.section-count {
  font-size: 11px;
  background: var(--c-danger-light);
  color: var(--c-danger);
  padding: 2px 8px;
  border-radius: 99px;
  font-weight: 600;
}
.section-count.optional {
  background: #f1f5f9;
  color: var(--c-muted);
}
.doc-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--c-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1.5px solid var(--c-border);
}
.doc-card {
  display: flex;
  overflow: hidden;
  transition: border-color 0.2s;
}
.doc-card.card-uploaded {
  border-color: var(--c-success);
}
.doc-card.card-error {
  border-color: var(--c-danger);
}
.doc-status-bar {
  width: 4px;
  flex-shrink: 0;
  background: var(--c-border);
  transition: background 0.3s;
}
.doc-status-bar.pending {
  background: var(--c-border);
}
.doc-status-bar.uploading {
  background: var(--c-warning);
}
.doc-status-bar.done {
  background: var(--c-success);
}
.doc-status-bar.error {
  background: var(--c-danger);
}
.doc-card-inner {
  flex: 1;
  padding: 14px 16px;
}
.doc-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  flex-wrap: wrap;
}
.doc-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
}
.doc-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
}
.tag-urgent {
  background: #fee2e2;
  color: #dc2626;
}
.tag-req {
  background: #E7E6FA;
  color: #393684;
}
.doc-name {
  font-size: 14px;
  font-weight: 700;
}
.state-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 99px;
}
.chip-pending {
  background: #f1f5f9;
  color: var(--c-muted);
}
.chip-uploading {
  background: #fef3c7;
  color: #92400e;
}
.chip-done {
  background: var(--c-success-light);
  color: #065f46;
}
.chip-error {
  background: var(--c-danger-light);
  color: #991b1b;
}
.doc-reason {
  font-size: 12px;
  color: #92400e;
  background: #fef9c3;
  border-radius: 6px;
  padding: 5px 9px;
  margin-bottom: 6px;
  line-height: 1.6;
}
.reason-label {
  font-weight: 700;
}
.doc-requirement {
  font-size: 12px;
  color: var(--c-muted);
  border-left: 3px solid var(--c-primary-light);
  padding-left: 9px;
  margin-bottom: 10px;
  line-height: 1.6;
}
.upload-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.drop-zone {
  flex: 1;
  border: 2px dashed var(--c-border);
  border-radius: var(--radius-sm);
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--c-bg);
  min-height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.drop-zone:hover,
.dz-drag {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.dz-done {
  border-color: var(--c-success);
  background: var(--c-success-light);
  border-style: solid;
}
.dz-icon {
  font-size: 24px;
}
.dz-main {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text);
}
.dz-sub {
  font-size: 11px;
  color: var(--c-muted);
}
.done-name {
  color: #065f46;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dz-done-icon {
  font-size: 22px;
}
.upload-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--c-border);
  border-top-color: var(--c-primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.progress-track {
  width: 100%;
  height: 5px;
  background: var(--c-border);
  border-radius: 99px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-primary), var(--c-success));
  border-radius: 99px;
  transition: width 0.1s linear;
}
.replace-btn {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--c-success);
  background: #fff;
  color: var(--c-success);
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 2px;
}
.replace-btn:hover {
  background: var(--c-success);
  color: #fff;
}
.preview-thumb {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1.5px solid var(--c-border);
}
.preview-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.error-msg {
  font-size: 12px;
  color: var(--c-danger);
  margin-top: 7px;
  background: var(--c-danger-light);
  padding: 5px 9px;
  border-radius: 6px;
}
.optional-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  gap: 12px;
  border-bottom: 1px solid var(--c-border);
}
.optional-row:last-child {
  border-bottom: none;
}
.optional-name {
  font-size: 13px;
  font-weight: 600;
}
.optional-hint {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 1px;
}
.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 13px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--c-border);
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  color: var(--c-muted);
  flex-shrink: 0;
}
.upload-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.upload-btn.uploaded {
  border-color: var(--c-success);
  background: var(--c-success-light);
  color: #065f46;
}
.uploaded-name {
  font-size: 11px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-col {
  display: flex;
  flex-direction: column;
}
.info-card {
  padding: 16px;
}
.info-icon {
  font-size: 20px;
  margin-bottom: 6px;
}
.info-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}
.info-text {
  font-size: 12px;
  color: var(--c-muted);
  line-height: 1.7;
}
.info-list {
  margin: 0;
  padding-left: 16px;
}
.info-list li {
  font-size: 12px;
  color: var(--c-muted);
  margin-bottom: 4px;
  line-height: 1.6;
}
.progress-display {
  margin-bottom: 4px;
}
.prog-text {
  font-size: 13px;
  color: var(--c-muted);
}
.prog-text strong {
  color: var(--c-primary);
  font-size: 15px;
}
.prog-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--c-border);
}
.prog-item:last-child {
  border-bottom: none;
}
.prog-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c-border);
}
.prog-dot.done {
  background: var(--c-success);
}
.prog-dot.uploading {
  background: var(--c-warning);
}
.prog-dot.error {
  background: var(--c-danger);
}
.prog-name {
  font-size: 12px;
  flex: 1;
}
.prog-state {
  font-size: 12px;
  color: var(--c-muted);
}
.full-btn {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-outline {
  background: #fff;
  color: var(--c-muted);
  border: 1.5px solid var(--c-border);
}
.btn-outline:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.btn-primary {
  background: var(--c-primary);
  color: #fff;
  border: none;
}
.btn-primary:hover:not(:disabled) {
  background: var(--c-primary-dark);
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.footer-note {
  font-size: 11px;
  color: var(--c-muted);
  text-align: center;
  margin: 8px 0 0;
}
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 22px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  z-index: 999;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
}
.toast.success {
  background: #065f46;
  color: #fff;
}
.toast.info {
  background: var(--c-primary);
  color: #fff;
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
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.success-modal {
  background: var(--c-card);
  border-radius: var(--radius);
  padding: 36px 28px;
  max-width: 380px;
  width: 100%;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
}
.success-anim {
  font-size: 52px;
  margin-bottom: 12px;
}
.success-modal h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 8px;
}
.success-modal p {
  font-size: 13px;
  color: var(--c-muted);
  line-height: 1.7;
  margin: 0 0 16px;
}
.case-block {
  font-size: 13px;
  color: var(--c-primary);
  font-weight: 600;
  background: var(--c-primary-light);
  display: inline-block;
  padding: 4px 14px;
  border-radius: 99px;
  margin-bottom: 20px;
}
.fade-enter-active {
  transition: opacity 0.3s;
}
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (max-width: 700px) {
  .page-topbar,
  .page-heading,
  .page-body {
    padding-left: 16px;
    padding-right: 16px;
  }
  .two-col {
    grid-template-columns: 1fr;
  }
  .heading-row {
    flex-direction: column;
  }
}
</style>
