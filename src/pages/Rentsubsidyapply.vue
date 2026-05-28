<template>
  <div class="subsidy-application">
    <!-- Step Progress -->
    <div class="step-progress">
      <div v-for="s in 3" :key="s" class="step-item">
        <div class="step-circle" :class="{ active: step === s, done: step > s }">
          <i v-if="step > s" class="ti ti-check"></i>
          <span v-else>{{ s }}</span>
        </div>
        <div class="step-line" v-if="s < 3" :class="{ done: step > s }"></div>
      </div>
    </div>

    <!-- ── Step 1: 申請人資料 ── -->
    <div v-if="step === 1" class="form-section">
      <h3 class="section-title">申請人基本資料</h3>
      <p class="section-desc">請填寫申請人個人資料（系統不儲存身分資訊，僅供本次申請使用）</p>

      <div class="form-row">
        <div class="form-group">
          <label>姓名</label>
          <input type="text" v-model="form.name" placeholder="請輸入真實姓名" />
        </div>
        <div class="form-group">
          <label>身分證字號</label>
          <input type="text" v-model="form.idNo" placeholder="A123456789" maxlength="10" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>出生日期</label>
          <input type="date" v-model="form.birthdate" />
        </div>
        <div class="form-group">
          <label>聯絡電話</label>
          <input type="tel" v-model="form.phone" placeholder="0912-345-678" />
        </div>
      </div>

      <div class="form-group">
        <label>電子信箱</label>
        <input type="email" v-model="form.email" placeholder="example@mail.com" />
      </div>

      <div class="form-group">
        <label>戶籍地址</label>
        <input type="text" v-model="form.registeredAddr" placeholder="請輸入戶籍完整地址" />
      </div>

      <div class="form-group">
        <label>金融機構帳號（補貼撥款用）</label>
        <div class="form-row">
          <input type="text" v-model="form.bankCode" placeholder="銀行代碼（3碼）" maxlength="3" style="max-width:120px" />
          <input type="text" v-model="form.bankAccount" placeholder="帳號（含分行代碼）" />
        </div>
      </div>

      <button class="btn-next" @click="goStep(2)" :disabled="!step1Valid">下一步</button>
    </div>

    <!-- ── Step 2: 租賃資料 & 家庭成員 ── -->
    <div v-if="step === 2" class="form-section">
      <h3 class="section-title">租賃資訊與家庭成員</h3>

      <div class="subsection">
        <h4 class="sub-title">租賃住宅資料</h4>
        <div class="form-group">
          <label>租賃地址</label>
          <input type="text" v-model="form.rentalAddr" placeholder="請輸入租賃住宅完整地址" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>租約起始日</label>
            <input type="date" v-model="form.contractStart" />
          </div>
          <div class="form-group">
            <label>租約結束日</label>
            <input type="date" v-model="form.contractEnd" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>每月租金（元）</label>
            <input type="number" v-model.number="form.monthlyRent" min="0" placeholder="例：12000" />
          </div>
          <div class="form-group">
            <label>租賃面積（坪）</label>
            <input type="number" v-model.number="form.area" min="0" placeholder="例：15" />
          </div>
        </div>

        <div class="form-group">
          <label>住宅類型</label>
          <div class="radio-group">
            <label class="radio-item" v-for="t in houseTypes" :key="t">
              <input type="radio" :value="t" v-model="form.houseType" />
              <span>{{ t }}</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>房東姓名</label>
          <input type="text" v-model="form.landlordName" placeholder="請輸入房東姓名" />
        </div>
      </div>

      <div class="subsection">
        <h4 class="sub-title">家庭成員（申請人以外）</h4>
        <div v-for="(m, i) in form.members" :key="i" class="member-card">
          <div class="member-header">
            <span>成員 {{ i + 1 }}</span>
            <button class="btn-remove" @click="removeMember(i)"><i class="ti ti-trash"></i></button>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>姓名</label>
              <input type="text" v-model="m.name" placeholder="姓名" />
            </div>
            <div class="form-group">
              <label>與申請人關係</label>
              <select v-model="m.relation">
                <option value="">請選擇</option>
                <option v-for="r in relations" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>身分證字號</label>
              <input type="text" v-model="m.idNo" placeholder="身分證字號" maxlength="10" />
            </div>
            <div class="form-group">
              <label>年收入（元）</label>
              <input type="number" v-model.number="m.income" min="0" placeholder="年收入" />
            </div>
          </div>
        </div>
        <button class="btn-add-member" @click="addMember">
          <i class="ti ti-plus"></i> 新增家庭成員
        </button>
      </div>

      <div class="btn-row">
        <button class="btn-back" @click="step = 1">上一步</button>
        <button class="btn-next" @click="goStep(3)" :disabled="!step2Valid">下一步</button>
      </div>
    </div>

    <!-- ── Step 3: 文件上傳 & 確認 ── -->
    <div v-if="step === 3" class="form-section">
      <h3 class="section-title">文件上傳與確認送出</h3>
      <p class="section-desc">請上傳以下必要文件（支援 JPG、PNG、PDF，每個檔案不超過 5MB）</p>

      <div class="doc-list">
        <div v-for="doc in requiredDocs" :key="doc.id" class="doc-item">
          <div class="doc-info">
            <i class="ti ti-file-text" aria-hidden="true"></i>
            <div>
              <p class="doc-name">{{ doc.name }}</p>
              <p class="doc-note">{{ doc.note }}</p>
            </div>
          </div>
          <div class="upload-area" @click="triggerUpload(doc.id)" :class="{ uploaded: uploads[doc.id] }">
            <template v-if="uploads[doc.id]">
              <i class="ti ti-circle-check" style="color:#16a34a;font-size:18px"></i>
              <span class="upload-filename">{{ uploads[doc.id] }}</span>
              <button class="btn-remove-file" @click.stop="removeUpload(doc.id)"><i class="ti ti-x"></i></button>
            </template>
            <template v-else>
              <i class="ti ti-upload" style="font-size:18px;color:#8f7fcf"></i>
              <span>點擊上傳</span>
            </template>
            <input
              type="file"
              :ref="el => fileInputs[doc.id] = el"
              @change="onFileChange($event, doc.id)"
              accept=".jpg,.jpeg,.png,.pdf"
              style="display:none"
            />
          </div>
        </div>
      </div>

      <div class="confirm-block">
        <h4 class="sub-title">申請確認聲明</h4>
        <div class="checkbox-group">
          <label class="check-item" v-for="decl in declarations" :key="decl">
            <input type="checkbox" :value="decl" v-model="form.declarations" />
            <span>{{ decl }}</span>
          </label>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn-back" @click="step = 2">上一步</button>
        <button class="btn-next" @click="submitForm" :disabled="!step3Valid">確認送出</button>
      </div>
    </div>

    <!-- ── 送出成功 ── -->
    <div v-if="step === 4" class="form-section">
      <div class="success-card">
        <i class="ti ti-circle-check success-icon"></i>
        <h3>申請已成功送出！</h3>
        <p>您的租金補貼申請已受理，案件編號：</p>
        <div class="case-number">{{ caseNumber }}</div>
        <div class="timeline">
          <div class="timeline-item">
            <div class="t-dot done"></div>
            <div>
              <p class="t-title">申請送出</p>
              <p class="t-date">{{ today }}</p>
            </div>
          </div>
          <div class="timeline-item">
            <div class="t-dot"></div>
            <div>
              <p class="t-title">資格審查</p>
              <p class="t-date">預計 1～2 個月</p>
            </div>
          </div>
          <div class="timeline-item">
            <div class="t-dot"></div>
            <div>
              <p class="t-title">核定通知</p>
              <p class="t-date">預計 3 個月內完成</p>
            </div>
          </div>
          <div class="timeline-item">
            <div class="t-dot"></div>
            <div>
              <p class="t-title">開始撥款</p>
              <p class="t-date">核定後次月起按月撥入</p>
            </div>
          </div>
        </div>
        <p class="note">審查進度可至各縣市政府住宅主管機關查詢，或至「申請進度」功能追蹤。</p>
        <button class="btn-next" style="margin-top:1rem" @click="resetForm">返回首頁</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const step = ref(1)

const form = ref({
  name: '', idNo: '', birthdate: '', phone: '', email: '',
  registeredAddr: '', bankCode: '', bankAccount: '',
  rentalAddr: '', contractStart: '', contractEnd: '',
  monthlyRent: null, area: null, houseType: '', landlordName: '',
  members: [],
  declarations: [],
})

const uploads = ref({})
const fileInputs = ref({})

const houseTypes = ['整層住家', '雅房', '套房', '分租套房']
const relations = ['配偶', '子女', '父母', '兄弟姊妹', '祖父母', '其他']

const requiredDocs = [
  { id: 'idCard', name: '申請人身分證正反面', note: '清晰掃描或拍照，正反面各一張' },
  { id: 'contract', name: '租賃契約書', note: '完整合約含簽名蓋章頁，租期需涵蓋申請日' },
  { id: 'household', name: '申請人戶籍謄本', note: '申請日前三個月內核發' },
  { id: 'incomeProof', name: '家庭所得證明', note: '最近一年綜合所得稅申報書或財政部函文' },
  { id: 'account', name: '金融機構存摺封面', note: '顯示帳戶名稱與帳號' },
]

const declarations = [
  '本人聲明以上填寫資料均屬實，如有不實願負法律責任。',
  '家庭成員均未持有自有房屋（或已辦理放棄原補貼切結）。',
  '申請時未同時享有其他政府住宅補貼。',
  '本人已閱讀並同意相關申請規定及個人資料蒐集告知聲明。',
]

const addMember = () => form.value.members.push({ name: '', idNo: '', relation: '', income: null })
const removeMember = (i) => form.value.members.splice(i, 1)

const triggerUpload = (id) => fileInputs.value[id]?.click()
const onFileChange = (e, id) => {
  const f = e.target.files[0]
  if (f) uploads.value[id] = f.name
}
const removeUpload = (id) => {
  delete uploads.value[id]
  if (fileInputs.value[id]) fileInputs.value[id].value = ''
}

const step1Valid = computed(() =>
  form.value.name && form.value.idNo.length === 10 &&
  form.value.birthdate && form.value.phone &&
  form.value.email && form.value.registeredAddr &&
  form.value.bankCode && form.value.bankAccount
)

const step2Valid = computed(() =>
  form.value.rentalAddr && form.value.contractStart &&
  form.value.contractEnd && form.value.monthlyRent > 0 &&
  form.value.houseType && form.value.landlordName
)

const allDocsUploaded = computed(() =>
  requiredDocs.every(d => uploads.value[d.id])
)

const step3Valid = computed(() =>
  allDocsUploaded.value && form.value.declarations.length === declarations.length
)

const goStep = (n) => { step.value = n }

const caseNumber = ref('')
const today = new Date().toLocaleDateString('zh-TW')

const submitForm = () => {
  caseNumber.value = 'RM-' + Date.now().toString().slice(-8)
  step.value = 4
}

const resetForm = () => {
  step.value = 1
  form.value = {
    name: '', idNo: '', birthdate: '', phone: '', email: '',
    registeredAddr: '', bankCode: '', bankAccount: '',
    rentalAddr: '', contractStart: '', contractEnd: '',
    monthlyRent: null, area: null, houseType: '', landlordName: '',
    members: [], declarations: [],
  }
  uploads.value = {}
}
</script>

<style scoped>
.subsidy-application { padding: 0; }

.step-progress {
  display: flex; align-items: center; justify-content: center;
  gap: 0; margin-bottom: 2rem;
}
.step-item { display: flex; align-items: center; }
.step-circle {
  width: 36px; height: 36px; border-radius: 50%;
  border: 2px solid #d4c9f0;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 500; color: #8f7fcf; background: #fff;
  transition: all 0.2s;
}
.step-circle.active { background: #5b4ecb; border-color: #5b4ecb; color: #fff; }
.step-circle.done { background: #ede9fa; border-color: #5b4ecb; color: #5b4ecb; }
.step-line { width: 60px; height: 2px; background: #e0d9f7; margin: 0 4px; }
.step-line.done { background: #5b4ecb; }

.section-title { font-size: 18px; font-weight: 500; color: #2d2257; margin: 0 0 4px; }
.section-desc { font-size: 14px; color: #888; margin: 0 0 1.5rem; }
.sub-title { font-size: 15px; font-weight: 500; color: #444; margin: 0 0 1rem; }

.subsection { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #f0edf9; }
.subsection:last-child { border-bottom: none; }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { margin-bottom: 1rem; }
.form-group > label { display: block; font-size: 13px; font-weight: 500; color: #555; margin-bottom: 5px; }
.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d9d4f0;
  border-radius: 8px;
  font-size: 14px;
  color: #2d2257;
  background: #faf9ff;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.form-group input:focus, .form-group select:focus { border-color: #5b4ecb; background: #fff; }

.radio-group { display: flex; gap: 8px; flex-wrap: wrap; }
.radio-item {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  border: 1px solid #d9d4f0;
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px; color: #444;
  transition: all 0.15s;
}
.radio-item:has(input:checked) { background: #5b4ecb; border-color: #5b4ecb; color: #fff; }
.radio-item input { display: none; }

/* Member */
.member-card {
  background: #faf9ff; border: 1px solid #e0d9f7;
  border-radius: 10px; padding: 12px 14px; margin-bottom: 10px;
}
.member-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; font-weight: 500; color: #5b4ecb; }
.btn-remove { background: none; border: none; color: #ccc; cursor: pointer; font-size: 18px; padding: 0; }
.btn-remove:hover { color: #ef4444; }

.btn-add-member {
  width: 100%; padding: 10px;
  background: transparent; border: 1px dashed #c4b8f0;
  border-radius: 8px; color: #5b4ecb;
  font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: background 0.15s;
}
.btn-add-member:hover { background: #f3f0fd; }

/* Docs */
.doc-list { margin-bottom: 1.5rem; }
.doc-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid #f0edf9;
  gap: 12px;
}
.doc-item:last-child { border-bottom: none; }
.doc-info { display: flex; align-items: flex-start; gap: 10px; flex: 1; }
.doc-info i { font-size: 22px; color: #8f7fcf; margin-top: 2px; flex-shrink: 0; }
.doc-name { font-size: 14px; font-weight: 500; color: #2d2257; margin: 0 0 2px; }
.doc-note { font-size: 12px; color: #aaa; margin: 0; }

.upload-area {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  border: 1px dashed #c4b8f0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px; color: #8f7fcf;
  min-width: 120px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.upload-area:hover { background: #f3f0fd; }
.upload-area.uploaded { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
.upload-filename { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.btn-remove-file { background: none; border: none; color: #bbb; cursor: pointer; padding: 0; font-size: 14px; }
.btn-remove-file:hover { color: #ef4444; }

/* Declarations */
.confirm-block { margin-bottom: 1.5rem; }
.checkbox-group { display: flex; flex-direction: column; gap: 8px; }
.check-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px; border: 1px solid #e8e4f4;
  border-radius: 8px; cursor: pointer; font-size: 13px; color: #444;
  transition: all 0.15s;
}
.check-item:has(input:checked) { background: #f3f0fd; border-color: #5b4ecb; }
.check-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: #5b4ecb; flex-shrink: 0; margin-top: 1px; }

/* Buttons */
.btn-next {
  width: 100%; padding: 14px;
  background: #5b4ecb; color: #fff; border: none;
  border-radius: 10px; font-size: 15px; font-weight: 500;
  cursor: pointer; transition: background 0.2s;
}
.btn-next:hover:not(:disabled) { background: #4a3db0; }
.btn-next:disabled { background: #c9c3e8; cursor: not-allowed; }
.btn-back {
  padding: 14px 24px; background: transparent;
  color: #5b4ecb; border: 1px solid #d4c9f0;
  border-radius: 10px; font-size: 15px; cursor: pointer;
  transition: background 0.15s;
}
.btn-back:hover { background: #f3f0fd; }
.btn-row { display: flex; gap: 12px; margin-top: 1rem; }
.btn-row .btn-next { flex: 1; margin-top: 0; }

/* Success */
.success-card { text-align: center; padding: 1rem 0; }
.success-icon { font-size: 56px; color: #5b4ecb; }
.success-card h3 { font-size: 20px; font-weight: 500; color: #2d2257; margin: 0.5rem 0; }
.success-card p { font-size: 14px; color: #888; margin: 0.25rem 0; }
.case-number {
  display: inline-block; font-size: 18px; font-weight: 500;
  color: #5b4ecb; background: #ede9fa; padding: 8px 24px;
  border-radius: 20px; margin: 0.75rem 0 1.5rem;
  letter-spacing: 1px;
}

.timeline { text-align: left; margin: 1rem auto; max-width: 280px; }
.timeline-item { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px; }
.t-dot {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid #d4c9f0; background: #fff;
  flex-shrink: 0; margin-top: 3px;
}
.t-dot.done { background: #5b4ecb; border-color: #5b4ecb; }
.t-title { font-size: 14px; font-weight: 500; color: #2d2257; margin: 0 0 2px; }
.t-date { font-size: 12px; color: #aaa; margin: 0; }
.note { font-size: 12px; color: #aaa; line-height: 1.6; max-width: 320px; margin: 0 auto; }
</style>
