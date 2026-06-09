<template>
  <div class="page-wrap">

    <!-- 步驟進度 -->
    <div class="step-progress-wrap">
      <div
        v-for="(s, i) in steps"
        :key="i"
        class="step-node"
        :class="{ done: currentStep > i + 1, active: currentStep === i + 1 }"
      >
        <div class="step-circle">
          <span v-if="currentStep > i + 1">✓</span>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <div class="step-label">{{ s.short }}</div>
        <div v-if="i < steps.length - 1" class="step-connector"></div>
      </div>
    </div>

    <!-- 主內容 -->
    <div class="page-body">
      <transition name="slide-fade" mode="out-in">
        <!-- STEP 1 -->
        <div v-if="currentStep === 1" key="s1" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">{{ steps[0].title }}</span>
              <span class="step-badge">STEP 01 / 05</span>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <div class="field-group full">
                  <label class="field-label req">姓名</label>
                  <input class="text-input" v-model="form.name" placeholder="請輸入真實姓名" />
                </div>
                <div class="field-group">
                  <label class="field-label req">身分證字號</label>
                  <input
                    class="text-input"
                    v-model="form.idNo"
                    placeholder="A123456789"
                    maxlength="10"
                  />
                </div>
                <div class="field-group">
                  <label class="field-label req">出生日期</label>
                  <input class="text-input" type="date" v-model="form.birthday" />
                </div>
                <div class="field-group">
                  <label class="field-label req">聯絡電話</label>
                  <input class="text-input" v-model="form.phone" placeholder="09xxxxxxxx" />
                </div>
                <div class="field-group">
                  <label class="field-label req">電子信箱</label>
                  <input
                    class="text-input"
                    type="email"
                    v-model="form.email"
                    placeholder="example@mail.com"
                  />
                </div>
                <div class="field-group full">
                  <label class="field-label req">戶籍地址</label>
                  <input
                    class="text-input"
                    v-model="form.registeredAddress"
                    placeholder="請輸入戶籍登記地址"
                  />
                </div>
                <div class="field-group full">
                  <label class="field-label req">現居租屋地址</label>
                  <input
                    class="text-input"
                    v-model="form.rentAddress"
                    placeholder="請輸入目前租屋地址"
                  />
                </div>
              </div>
            </div>
            <div class="card-footer">
              <button class="btn-primary" :disabled="!step1Valid" @click="next">
                下一步：租屋資訊 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">🔒</div>
              <div class="info-title">資料安全說明</div>
              <div class="info-text">
                您填寫的個人資料依個人資料保護法規定蒐集，僅用於租金補貼申請審核使用。
              </div>
            </div>
            <div class="card info-card" style="margin-top: 12px">
              <div class="info-icon">📋</div>
              <div class="info-title">申請人資格</div>
              <ul class="info-list">
                <li>具中華民國國籍</li>
                <li>設籍與租屋地不同</li>
                <li>無自有住宅</li>
                <li>符合所得限制</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- STEP 2 -->
        <div v-else-if="currentStep === 2" key="s2" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">{{ steps[1].title }}</span>
              <span class="step-badge">STEP 02 / 05</span>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <div class="field-group">
                  <label class="field-label req">每月租金（元）</label>
                  <div class="input-unit">
                    <input
                      class="text-input"
                      type="number"
                      v-model.number="form.rent"
                      placeholder="例：8000"
                    />
                    <span class="unit">元</span>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label req">租賃起始日</label>
                  <input class="text-input" type="date" v-model="form.leaseStart" />
                </div>
                <div class="field-group">
                  <label class="field-label req">租賃截止日</label>
                  <input class="text-input" type="date" v-model="form.leaseEnd" />
                </div>
                <div class="field-group">
                  <label class="field-label req">房東姓名</label>
                  <input
                    class="text-input"
                    v-model="form.landlordName"
                    placeholder="請輸入房東姓名"
                  />
                </div>
                <div class="field-group">
                  <label class="field-label req">房東電話</label>
                  <input
                    class="text-input"
                    v-model="form.landlordPhone"
                    placeholder="房東聯絡電話"
                  />
                </div>
                <div class="field-group full">
                  <label class="field-label">備註（選填）</label>
                  <textarea
                    class="textarea"
                    v-model="form.rentNote"
                    rows="2"
                    placeholder="如有特殊租約說明可填寫於此"
                  ></textarea>
                </div>
              </div>
              <div class="field-group" style="margin-top: 4px">
                <label class="field-label req">申請補貼方案</label>
                <div class="scheme-list">
                  <label
                    v-for="s in schemeOptions"
                    :key="s.value"
                    class="scheme-card"
                    :class="{ selected: form.scheme === s.value }"
                    @click="form.scheme = s.value"
                  >
                    <div class="scheme-left">
                      <div class="scheme-radio" :class="{ active: form.scheme === s.value }"></div>
                      <div>
                        <div class="scheme-name">{{ s.name }}</div>
                        <div class="scheme-desc">{{ s.desc }}</div>
                      </div>
                    </div>
                    <div class="scheme-max">
                      最高<br /><strong>{{ s.max }}</strong
                      ><br />元/月
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="prev">← 上一步</button>
              <button class="btn-primary" :disabled="!step2Valid" @click="next">
                下一步：家庭資料 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">💰</div>
              <div class="info-title">各縣市補貼上限</div>
              <div class="city-limit-list">
                <div class="city-row">
                  <span>台北市</span><span class="city-amt">6,000 元/月</span>
                </div>
                <div class="city-row">
                  <span>新北、桃園</span><span class="city-amt">5,500 元/月</span>
                </div>
                <div class="city-row">
                  <span>六都（其餘）</span><span class="city-amt">5,000 元/月</span>
                </div>
                <div class="city-row">
                  <span>其他縣市</span><span class="city-amt">4,000 元/月</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3 -->
        <div v-else-if="currentStep === 3" key="s3" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">{{ steps[2].title }}</span>
              <span class="step-badge">STEP 03 / 05</span>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <div class="field-group">
                  <label class="field-label req">家庭人口數</label>
                  <div class="counter-row">
                    <button
                      class="counter-btn"
                      @click="form.familySize = Math.max(1, form.familySize - 1)"
                    >
                      −
                    </button>
                    <span class="counter-val">{{ form.familySize }} 人</span>
                    <button
                      class="counter-btn"
                      @click="form.familySize = Math.min(20, form.familySize + 1)"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label req">家庭年收入（萬元）</label>
                  <div class="input-unit">
                    <input
                      class="text-input"
                      type="number"
                      v-model.number="form.income"
                      placeholder="例：60"
                    />
                    <span class="unit">萬元</span>
                  </div>
                </div>
                <div class="field-group full">
                  <label class="field-label">特殊身分（可複選）</label>
                  <div class="radio-grid cols-3">
                    <label
                      v-for="o in specialOptions"
                      :key="o.value"
                      class="radio-card"
                      :class="{ selected: form.special.includes(o.value) }"
                      @click="toggleSpecial(o.value)"
                    >
                      <span class="rc-icon">{{ o.icon }}</span>
                      <span class="rc-text">{{ o.label }}</span>
                      <span class="rc-check" v-if="form.special.includes(o.value)">✓</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="prev">← 上一步</button>
              <button class="btn-primary" :disabled="!step3Valid" @click="next">
                下一步：文件上傳 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">📊</div>
              <div class="info-title">收入限制說明</div>
              <div class="info-text">
                家庭年收入以最近一年度綜合所得稅申報資料為準，上限依家庭人口數計算。
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 4 -->
        <div v-else-if="currentStep === 4" key="s4" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">{{ steps[3].title }}</span>
              <span class="step-badge">STEP 04 / 05</span>
            </div>
            <div class="card-body">
              <div class="doc-list">
                <div v-for="doc in requiredDocs" :key="doc.key" class="doc-row">
                  <div class="doc-info">
                    <div class="doc-name">
                      {{ doc.label }}
                      <span class="doc-tag" :class="doc.required ? 'tag-req' : 'tag-opt'">
                        {{ doc.required ? '必填' : '選填' }}
                      </span>
                    </div>
                    <div class="doc-hint">{{ doc.hint }}</div>
                  </div>
                  <label class="upload-btn" :class="{ uploaded: uploads[doc.key] }">
                    <input
                      type="file"
                      :accept="doc.accept"
                      hidden
                      @change="(e) => handleUpload(doc.key, e)"
                    />
                    <span v-if="!uploads[doc.key]">📎 選擇檔案</span>
                    <span v-else class="uploaded-name">✓ {{ uploads[doc.key] }}</span>
                  </label>
                </div>
              </div>
              <div class="upload-note">
                <span>📌</span>
                <span>支援 JPG、PNG、PDF，單檔不超過 10MB。文件需清晰可辨。</span>
              </div>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="prev">← 上一步</button>
              <button class="btn-primary" :disabled="!step4Valid" @click="next">
                下一步：確認送出 →
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">📄</div>
              <div class="info-title">必要文件清單</div>
              <ul class="info-list">
                <li>身分證正反面影本</li>
                <li>租賃契約書（含簽名頁）</li>
                <li>三個月內戶籍謄本</li>
                <li>所得證明或薪資明細</li>
                <li>本人銀行存摺封面</li>
              </ul>
            </div>
            <div class="card info-card" style="margin-top: 12px">
              <div class="info-icon">📊</div>
              <div class="info-title">上傳進度</div>
              <div class="upload-progress-row">
                <span class="upload-progress-text"
                  >已上傳 {{ docDoneCount }} /
                  {{ requiredDocs.filter((d) => d.required).length }} 項</span
                >
              </div>
              <div class="upload-progress-bar">
                <div
                  class="upload-progress-fill"
                  :style="{
                    width:
                      (docDoneCount / requiredDocs.filter((d) => d.required).length) * 100 + '%',
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 5 確認 -->
        <div v-else-if="currentStep === 5" key="s5" class="two-col">
          <div class="card main-card">
            <div class="card-header">
              <span class="card-title">{{ steps[4].title }}</span>
              <span class="step-badge">STEP 05 / 05</span>
            </div>
            <div class="card-body">
              <div class="summary-block">
                <div class="summary-section">
                  <div class="summary-section-title">申請人資料</div>
                  <div class="sum-row">
                    <span>姓名</span><span>{{ form.name }}</span>
                  </div>
                  <div class="sum-row">
                    <span>身分證</span><span>{{ maskId(form.idNo) }}</span>
                  </div>
                  <div class="sum-row">
                    <span>電話</span><span>{{ form.phone }}</span>
                  </div>
                  <div class="sum-row">
                    <span>信箱</span><span>{{ form.email }}</span>
                  </div>
                  <div class="sum-row">
                    <span>租屋地址</span><span>{{ form.rentAddress }}</span>
                  </div>
                </div>
                <div class="summary-section">
                  <div class="summary-section-title">租屋資訊</div>
                  <div class="sum-row">
                    <span>月租金</span><span>{{ form.rent?.toLocaleString() }} 元</span>
                  </div>
                  <div class="sum-row">
                    <span>租期</span><span>{{ form.leaseStart }} ～ {{ form.leaseEnd }}</span>
                  </div>
                  <div class="sum-row">
                    <span>申請方案</span
                    ><span>{{
                      schemeOptions.find((s) => s.value === form.scheme)?.name ?? '—'
                    }}</span>
                  </div>
                </div>
                <div class="summary-section">
                  <div class="summary-section-title">家庭資料</div>
                  <div class="sum-row">
                    <span>家庭人口</span><span>{{ form.familySize }} 人</span>
                  </div>
                  <div class="sum-row">
                    <span>家庭年收入</span><span>{{ form.income }} 萬元</span>
                  </div>
                </div>
              </div>
              <label class="declare-row" @click="form.declared = !form.declared">
                <span class="declare-cb" :class="{ checked: form.declared }">
                  <span v-if="form.declared">✓</span>
                </span>
                <span class="declare-text"
                  >本人聲明以上填寫資料均屬實，如有不實願負相關法律責任，並同意依個人資料保護法蒐集使用上述資料。</span
                >
              </label>
            </div>
            <div class="card-footer two-btn">
              <button class="btn-outline" @click="prev">← 修改資料</button>
              <button class="btn-submit" :disabled="!form.declared" @click="submit">
                確認送出申請 ✓
              </button>
            </div>
          </div>
          <div class="side-cards">
            <div class="card info-card">
              <div class="info-icon">⏱</div>
              <div class="info-title">後續時程</div>
              <ul class="info-list">
                <li>送出後 7～14 個工作天初審</li>
                <li>資料不足時系統發送補件通知</li>
                <li>審核通過後寄送核定通知書</li>
                <li>核定次月起撥入指定帳戶</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 送出成功 -->
        <div v-else-if="currentStep === 6" key="s6">
          <div class="card success-card">
            <div class="success-icon">🎉</div>
            <h2 class="success-title">申請已送出！</h2>
            <p class="success-sub">您的租金補貼申請已成功提交，請留意後續審核通知。</p>
            <div class="case-block">
              <div class="case-label">申請案號</div>
              <div class="case-no">{{ caseNo }}</div>
            </div>
            <div class="success-actions">
              <button class="btn-outline" @click="reset">返回首頁</button>
              <button class="btn-primary" @click="goProgress">查看申請進度 →</button>
            </div>
          </div>
        </div>
      </transition>
    </div>

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

const today = new Date()
  .toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\//g, '-')

const steps = [
  { short: '基本資料', title: '申請人基本資料' },
  { short: '租屋資訊', title: '租屋與方案資訊' },
  { short: '家庭資料', title: '家庭與收入狀況' },
  { short: '文件上傳', title: '申請文件上傳' },
  { short: '確認送出', title: '確認資料並送出' },
]
const currentStep = ref(1)

const form = ref({
  name: '',
  idNo: '',
  birthday: '',
  phone: '',
  email: '',
  registeredAddress: '',
  rentAddress: '',
  rent: null,
  leaseStart: '',
  leaseEnd: '',
  landlordName: '',
  landlordPhone: '',
  rentNote: '',
  scheme: '',
  familySize: 1,
  income: null,
  special: [],
  declared: false,
})
const uploads = ref({})

const schemeOptions = [
  {
    value: 'general',
    name: '住宅補貼 – 租金補貼',
    desc: '內政部國土管理署辦理，全台受理',
    max: '6,000',
  },
  { value: 'youth', name: '青年安心成家租金補貼', desc: '40 歲以下青年專屬加碼方案', max: '2,400' },
  {
    value: 'social',
    name: '中低收入戶租金補助',
    desc: '各縣市社會局辦理，依核定等級',
    max: '3,000',
  },
]
const specialOptions = [
  { value: 'disability', label: '身心障礙', icon: '♿' },
  { value: 'lowIncome', label: '低收/中低收', icon: '🏠' },
  { value: 'indigenous', label: '原住民族', icon: '🌿' },
  { value: 'singleParent', label: '單親家庭', icon: '👨‍👧' },
  { value: 'seniorAlone', label: '獨居老人', icon: '👴' },
  { value: 'none', label: '無特殊身分', icon: '👤' },
]
const requiredDocs = [
  {
    key: 'idCard',
    label: '身分證正反面',
    hint: '申請人身分證正反面影本',
    accept: 'image/*,.pdf',
    required: true,
  },
  {
    key: 'lease',
    label: '租賃契約書',
    hint: '完整租約，含雙方簽名頁',
    accept: 'image/*,.pdf',
    required: true,
  },
  {
    key: 'household',
    label: '戶籍謄本',
    hint: '三個月內核發',
    accept: 'image/*,.pdf',
    required: true,
  },
  {
    key: 'income',
    label: '所得證明',
    hint: '最近一年所得稅申報或薪資明細',
    accept: 'image/*,.pdf',
    required: true,
  },
  {
    key: 'bankbook',
    label: '存摺封面',
    hint: '補貼撥款用帳戶',
    accept: 'image/*,.pdf',
    required: true,
  },
  {
    key: 'other',
    label: '其他佐證文件',
    hint: '如有其他有利審核之文件',
    accept: 'image/*,.pdf',
    required: false,
  },
]

function toggleSpecial(val) {
  if (val === 'none') {
    form.value.special = ['none']
    return
  }
  form.value.special = form.value.special.filter((v) => v !== 'none')
  const idx = form.value.special.indexOf(val)
  if (idx > -1) form.value.special.splice(idx, 1)
  else form.value.special.push(val)
}
function handleUpload(key, e) {
  const file = e.target.files[0]
  if (file) uploads.value[key] = file.name
}

const step1Valid = computed(
  () =>
    form.value.name &&
    form.value.idNo.length === 10 &&
    form.value.birthday &&
    form.value.phone.length >= 8 &&
    form.value.email.includes('@') &&
    form.value.registeredAddress &&
    form.value.rentAddress,
)
const step2Valid = computed(
  () =>
    form.value.rent > 0 &&
    form.value.leaseStart &&
    form.value.leaseEnd &&
    form.value.landlordName &&
    form.value.landlordPhone &&
    form.value.scheme,
)
const step3Valid = computed(
  () => form.value.familySize > 0 && form.value.income !== null && form.value.income >= 0,
)
const step4Valid = computed(() =>
  requiredDocs.filter((d) => d.required).every((d) => uploads.value[d.key]),
)
const docDoneCount = computed(
  () => requiredDocs.filter((d) => d.required && uploads.value[d.key]).length,
)

function next() {
  currentStep.value++
}
function prev() {
  currentStep.value--
}

const caseNo = ref('')
function submit() {
  const now = new Date()
  caseNo.value = `RM${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 90000 + 10000)}`
  currentStep.value = 6
}
function reset() {
  currentStep.value = 1
  form.value = {
    name: '',
    idNo: '',
    birthday: '',
    phone: '',
    email: '',
    registeredAddress: '',
    rentAddress: '',
    rent: null,
    leaseStart: '',
    leaseEnd: '',
    landlordName: '',
    landlordPhone: '',
    rentNote: '',
    scheme: '',
    familySize: 1,
    income: null,
    special: [],
    declared: false,
  }
  uploads.value = {}
}

function goProgress() {
  router.push('/app/subsidy/progress')
}

function maskId(id) {
  if (!id || id.length < 4) return id
  return id.slice(0, 3) + '****' + id.slice(-3)
}

const showToast = ref(false)
const toastMsg = ref('')
</script>

<style scoped>
.page-wrap {
  --c-primary: #4845A5;
  --c-primary-light: #F0EFFE;
  --c-primary-dark: #393684;
  --c-success: #10b981;
  --c-success-light: #ecfdf5;
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
.step-progress-wrap {
  display: flex;
  align-items: flex-start;
  padding: 0 28px 20px;
  overflow-x: auto;
}
.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
  min-width: 60px;
}
.step-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid var(--c-border);
  background: var(--c-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-muted);
  transition: all 0.25s;
  z-index: 1;
}
.step-node.done .step-circle {
  background: var(--c-success);
  border-color: var(--c-success);
  color: #fff;
}
.step-node.active .step-circle {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}
.step-label {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 5px;
  white-space: nowrap;
}
.step-node.active .step-label {
  color: var(--c-primary);
  font-weight: 600;
}
.step-node.done .step-label {
  color: var(--c-success);
}
.step-connector {
  position: absolute;
  top: 15px;
  left: calc(50% + 15px);
  width: calc(100% - 30px);
  height: 2px;
  background: var(--c-border);
}
.step-node.done .step-connector {
  background: var(--c-success);
}
.page-body {
  padding: 0 28px;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 16px;
}
.main-card {
  display: flex;
  flex-direction: column;
}
.card {
  background: var(--c-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1.5px solid var(--c-border);
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
.step-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--c-primary);
  background: var(--c-primary-light);
  padding: 3px 10px;
  border-radius: 99px;
}
.card-body {
  padding: 18px;
  flex: 1;
}
.card-footer {
  padding: 14px 18px;
  border-top: 1px solid var(--c-border);
}
.card-footer.two-btn {
  display: flex;
  gap: 10px;
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
  margin-bottom: 6px;
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
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field-group.full {
  grid-column: 1/-1;
}
.field-label {
  font-size: 13px;
  font-weight: 600;
}
.field-label.req::after {
  content: ' *';
  color: var(--c-danger);
}
.text-input {
  padding: 9px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--c-text);
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.text-input:focus {
  outline: none;
  border-color: var(--c-primary);
}
.textarea {
  padding: 9px 12px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--c-text);
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}
.textarea:focus {
  outline: none;
  border-color: var(--c-primary);
}
.input-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.unit {
  font-size: 13px;
  color: var(--c-muted);
  white-space: nowrap;
}
.counter-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.counter-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1.5px solid var(--c-border);
  background: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-primary);
}
.counter-btn:hover {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.counter-val {
  font-size: 16px;
  font-weight: 700;
  min-width: 48px;
  text-align: center;
}
.radio-grid {
  display: grid;
  gap: 8px;
}
.radio-grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}
.radio-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 8px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.radio-card:hover {
  border-color: var(--c-primary);
}
.radio-card.selected {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.rc-icon {
  font-size: 18px;
}
.rc-text {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}
.rc-check {
  position: absolute;
  top: 3px;
  right: 5px;
  font-size: 10px;
  color: var(--c-primary);
  font-weight: 700;
}
.scheme-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scheme-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.scheme-card:hover {
  border-color: var(--c-primary);
}
.scheme-card.selected {
  border-color: var(--c-primary);
  background: var(--c-primary-light);
}
.scheme-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.scheme-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--c-border);
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 0.2s;
}
.scheme-radio.active {
  border-color: var(--c-primary);
  background: var(--c-primary);
}
.scheme-name {
  font-size: 13px;
  font-weight: 600;
}
.scheme-desc {
  font-size: 11px;
  color: var(--c-muted);
  margin-top: 1px;
}
.scheme-max {
  text-align: center;
  font-size: 11px;
  color: var(--c-muted);
  white-space: nowrap;
}
.scheme-max strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-success);
  display: block;
}
.city-limit-list {
  display: flex;
  flex-direction: column;
}
.city-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--c-border);
}
.city-row:last-child {
  border-bottom: none;
}
.city-amt {
  font-weight: 700;
  color: var(--c-primary);
}
.doc-list {
  display: flex;
  flex-direction: column;
}
.doc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid var(--c-border);
  gap: 10px;
}
.doc-row:last-child {
  border-bottom: none;
}
.doc-info {
  flex: 1;
}
.doc-name {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.doc-tag {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 99px;
  font-weight: 600;
}
.tag-req {
  background: #fee2e2;
  color: #dc2626;
}
.tag-opt {
  background: #f1f5f9;
  color: #64748b;
}
.doc-hint {
  font-size: 11px;
  color: var(--c-muted);
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
.upload-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12px;
  color: var(--c-muted);
  background: #f8fafc;
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  margin-top: 12px;
}
.upload-progress-row {
  margin-bottom: 6px;
}
.upload-progress-text {
  font-size: 12px;
  color: var(--c-muted);
}
.upload-progress-bar {
  height: 6px;
  background: var(--c-border);
  border-radius: 99px;
  overflow: hidden;
}
.upload-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-primary), var(--c-success));
  border-radius: 99px;
  transition: width 0.4s;
}
.summary-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.summary-section {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.summary-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--c-muted);
  background: #f8fafc;
  padding: 7px 14px;
  border-bottom: 1px solid var(--c-border);
}
.sum-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 14px;
  font-size: 12px;
  border-bottom: 1px solid var(--c-border);
}
.sum-row:last-child {
  border-bottom: none;
}
.sum-row span:first-child {
  color: var(--c-muted);
}
.sum-row span:last-child {
  font-weight: 500;
}
.declare-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: #fffbeb;
  border-radius: var(--radius-sm);
  border: 1px solid #fde68a;
  cursor: pointer;
}
.declare-cb {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid #d97706;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #d97706;
  flex-shrink: 0;
  margin-top: 1px;
  transition: all 0.2s;
}
.declare-cb.checked {
  background: #d97706;
  color: #fff;
}
.declare-text {
  font-size: 12px;
  line-height: 1.6;
  color: #92400e;
}
.success-card {
  padding: 40px 28px;
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
}
.success-icon {
  font-size: 56px;
  margin-bottom: 12px;
}
.success-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
}
.success-sub {
  font-size: 13px;
  color: var(--c-muted);
  margin: 0 0 20px;
}
.case-block {
  background: var(--c-primary-light);
  border-radius: var(--radius-sm);
  padding: 14px 20px;
  display: inline-block;
  margin-bottom: 24px;
}
.case-label {
  font-size: 11px;
  color: var(--c-muted);
  margin-bottom: 3px;
}
.case-no {
  font-size: 20px;
  font-weight: 800;
  color: var(--c-primary);
  letter-spacing: 2px;
}
.success-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.btn-primary {
  flex: 1;
  padding: 10px 20px;
  background: var(--c-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}
.btn-primary:hover:not(:disabled) {
  background: var(--c-primary-dark);
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-outline {
  padding: 10px 18px;
  background: #fff;
  color: var(--c-muted);
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-outline:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.btn-submit {
  flex: 1;
  padding: 10px 20px;
  background: var(--c-success);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-submit:hover:not(:disabled) {
  background: #059669;
}
.btn-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
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
.slide-fade-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
@media (max-width: 700px) {
  .page-topbar,
  .page-heading,
  .step-progress-wrap,
  .page-body {
    padding-left: 16px;
    padding-right: 16px;
  }
  .two-col {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .field-group.full {
    grid-column: 1;
  }
}
</style>
