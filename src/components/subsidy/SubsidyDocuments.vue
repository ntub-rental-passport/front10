<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listStoredContracts, type StoredContractSummary } from '@/src/services/contractApi'
import {
  deleteSubsidyFile,
  fetchSubsidyFileBlob,
  listSubsidyFiles,
  uploadSubsidyFile,
  type SubsidyDocType,
  type SubsidyFile,
} from '@/src/services/subsidyFileApi'
import {
  formatExpiry,
  groupByDocType,
  subsidyDocTypes,
  validateSubsidyFile,
} from '@/src/utils/subsidy-documents'

const files = ref<SubsidyFile[]>([])
const count = ref(0)
const limit = ref(20)
const loading = ref(true)
const loginRequired = ref(false)
const loadError = ref('')
const error = ref('')
const uploading = ref(false)
const busyFileId = ref<number | null>(null)
const docType = ref<SubsidyDocType | ''>('')
const rentalId = ref<number | ''>('')
const rentals = ref<StoredContractSummary[]>([])
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const previewId = ref<number | null>(null)
const blobUrls = ref<Record<number, string>>({})
let disposed = false
const groups = computed(() => groupByDocType(files.value))
const full = computed(() => count.value >= limit.value)
const fullReason = computed(() => `最多可存 ${limit.value} 份文件，請先刪除不需要的文件。`)
const uploadReason = computed(() =>
  uploading.value ? '上傳中，請稍候。' : full.value ? fullReason.value : '',
)
const formatCreated = (iso: string) =>
  new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
const formatSize = (size: number) =>
  size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`

function isAuthError(cause: unknown): boolean {
  const status = (cause as { status?: number } | null)?.status
  return status === 401 || status === 403
}
function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '操作失敗，請稍後再試。'
}
function clearBlobUrls() {
  Object.values(blobUrls.value).forEach((url) => URL.revokeObjectURL(url))
  blobUrls.value = {}
  previewId.value = null
}
function actionError(cause: unknown) {
  if (isAuthError(cause)) {
    loginRequired.value = true
    files.value = []
    clearBlobUrls()
  } else {
    error.value = errorMessage(cause)
  }
}
async function loadFiles() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await listSubsidyFiles()
    if (disposed) return
    clearBlobUrls()
    files.value = result.files
    count.value = result.count
    limit.value = result.limit
    loginRequired.value = false
  } catch (cause) {
    if (isAuthError(cause)) actionError(cause)
    else loadError.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}
async function loadRentals() {
  try {
    rentals.value = await listStoredContracts()
  } catch {
    rentals.value = []
  }
}
function onPickFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
  error.value = selectedFile.value ? (validateSubsidyFile(selectedFile.value) ?? '') : ''
}
async function upload() {
  if (uploading.value || busyFileId.value !== null || full.value) return
  error.value = ''
  if (!docType.value) {
    error.value = '請選擇文件類型。'
    return
  }
  if (!selectedFile.value) {
    error.value = '請選擇要上傳的文件。'
    return
  }
  const invalid = validateSubsidyFile(selectedFile.value)
  if (invalid) {
    error.value = invalid
    return
  }
  uploading.value = true
  try {
    await uploadSubsidyFile(
      selectedFile.value,
      docType.value,
      rentalId.value === '' ? undefined : rentalId.value,
    )
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await loadFiles()
  } catch (cause) {
    actionError(cause)
  } finally {
    uploading.value = false
  }
}
async function getBlobUrl(file: SubsidyFile): Promise<string | null> {
  if (blobUrls.value[file.id]) return blobUrls.value[file.id]!
  const blob = await fetchSubsidyFileBlob(file)
  // 離開頁面後才完成的讀取，不再建立無人負責釋放的網址。
  if (disposed) return null
  const url = URL.createObjectURL(blob)
  blobUrls.value[file.id] = url
  return url
}
async function preview(file: SubsidyFile) {
  if (busyFileId.value !== null || uploading.value) return
  error.value = ''
  // 在點擊當下先開分頁，避免非同步讀取完成後被瀏覽器擋住。
  const tab = file.contentType === 'application/pdf' ? window.open('about:blank', '_blank') : null
  if (file.contentType === 'application/pdf' && !tab) {
    error.value = '請允許開啟新分頁後再預覽。'
    return
  }
  if (tab) tab.opener = null
  busyFileId.value = file.id
  try {
    const url = await getBlobUrl(file)
    if (!url) {
      tab?.close()
      return
    }
    if (tab) tab.location.href = url
    else previewId.value = file.id
  } catch (cause) {
    tab?.close()
    actionError(cause)
  } finally {
    busyFileId.value = null
  }
}
async function download(file: SubsidyFile) {
  if (busyFileId.value !== null || uploading.value) return
  busyFileId.value = file.id
  error.value = ''
  try {
    const url = await getBlobUrl(file)
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch (cause) {
    actionError(cause)
  } finally {
    busyFileId.value = null
  }
}
async function removeFile(file: SubsidyFile) {
  if (busyFileId.value !== null || uploading.value) return
  if (!window.confirm(`確定刪除「${file.name}」？刪除後無法復原。`)) return
  busyFileId.value = file.id
  error.value = ''
  try {
    await deleteSubsidyFile(file.id)
    await loadFiles()
  } catch (cause) {
    actionError(cause)
  } finally {
    busyFileId.value = null
  }
}
onMounted(() => {
  void loadFiles()
  void loadRentals()
})
onUnmounted(() => {
  disposed = true
  clearBlobUrls()
})
</script>

<template>
  <section class="panel subsidy-documents" aria-labelledby="subsidy-documents-title">
    <div class="documents-heading">
      <div>
        <span class="eyebrow">文件保存</span>
        <h2 id="subsidy-documents-title">我的補助文件</h2>
      </div>
      <span v-if="!loading && !loginRequired && !loadError" class="file-count"
        >{{ count }} / {{ limit }}</span
      >
    </div>
    <p>只有你看得到，系統管理員也無法查看。</p>
    <p>上傳後 180 天自動刪除，到期前 14 天會通知你。</p>
    <p v-if="loading" role="status">正在讀取補助文件…</p>
    <p v-else-if="loginRequired" role="status">登入租客帳號後，可以在這裡保存補助文件。</p>
    <div v-else-if="loadError">
      <p role="alert">{{ loadError }}</p>
      <button type="button" @click="loadFiles">重試</button>
    </div>
    <template v-else>
      <form @submit.prevent="upload">
        <label
          >文件類型<select v-model="docType" required :disabled="uploading">
            <option disabled value="">請選擇文件類型</option>
            <option v-for="type in subsidyDocTypes" :key="type.value" :value="type.value">
              {{ type.label }}
            </option>
          </select></label
        >
        <label v-if="rentals.length"
          >關聯租約（選填）<select v-model="rentalId" :disabled="uploading">
            <option value="">不指定租約</option>
            <option v-for="rental in rentals" :key="rental.rental_id" :value="rental.rental_id">
              {{ rental.contract_tag || rental.address || `租約 ${rental.rental_id}` }}
            </option>
          </select></label
        >
        <label
          >選擇文件<input
            ref="fileInput"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            required
            :disabled="uploading || full"
            @change="onPickFile"
        /></label>
        <p class="hint">只收 PDF、JPG、PNG，每份最多 10 MB。</p>
        <button
          class="primary"
          type="submit"
          :disabled="uploading || full || busyFileId !== null"
          :title="uploadReason || undefined"
          :aria-describedby="uploadReason ? 'subsidy-upload-reason' : undefined"
        >
          {{ uploading ? '上傳中…' : '上傳文件' }}
        </button>
        <p v-if="uploadReason" id="subsidy-upload-reason" role="status">{{ uploadReason }}</p>
      </form>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="!files.length">還沒有存任何補助文件。</p>
      <section v-for="group in groups" :key="group.value" class="document-group">
        <h3>{{ group.label }}</h3>
        <ul>
          <li v-for="file in group.files" :key="file.id">
            <strong class="file-name">{{ file.name }}</strong>
            <span class="file-meta"
              >{{ formatSize(file.size) }} · 上傳於 {{ formatCreated(file.createdAt) }}</span
            >
            <span class="file-meta">{{ formatExpiry(file.expiresAt) }}</span>
            <div class="file-actions">
              <button
                type="button"
                :disabled="busyFileId !== null || uploading"
                @click="preview(file)"
              >
                預覽
              </button>
              <button
                type="button"
                :disabled="busyFileId !== null || uploading"
                @click="download(file)"
              >
                下載
              </button>
              <button
                type="button"
                :disabled="busyFileId !== null || uploading"
                @click="removeFile(file)"
              >
                刪除
              </button>
              <span v-if="busyFileId === file.id" role="status">處理中…</span>
            </div>
            <div
              v-if="previewId === file.id && file.contentType !== 'application/pdf'"
              class="image-preview"
            >
              <img :src="blobUrls[file.id]" :alt="file.name" />
              <button type="button" @click="previewId = null">關閉預覽</button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.subsidy-documents {
  grid-column: 1;
  grid-row: 3;
  min-width: 0;
  padding: 26px;
  background: white;
  border: 1px solid #e2e6ef;
  border-radius: 17px;
}
.documents-heading,
.file-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.documents-heading {
  justify-content: space-between;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.09em;
  color: #625a99;
  font-weight: 700;
}
h2 {
  font-size: 23px;
  font-weight: 700;
  line-height: 1.5;
  margin: 8px 0 12px;
}
h3 {
  font-size: 17px;
  font-weight: 700;
  margin: 24px 0 8px;
}
p {
  color: #627088;
  margin: 8px 0 16px;
}
form,
label {
  display: grid;
  gap: 8px;
}
form {
  gap: 14px;
  margin-top: 20px;
}
input,
select {
  border: 1px solid #d5daea;
  border-radius: 8px;
  padding: 12px;
  width: 100%;
  min-width: 0;
}
button {
  border: 1px solid #dedfea;
  border-radius: 10px;
  padding: 8px 12px;
  color: #5146a0;
  background: white;
  cursor: pointer;
  justify-self: start;
}
.primary {
  background: #5146a0;
  color: white;
  border: 0;
  padding: 11px 18px;
  font-weight: 600;
}
.primary:hover {
  background: #403685;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.hint {
  font-size: 13px;
  margin: 0;
}
.file-count,
.file-meta {
  color: #627088;
}
ul {
  padding: 0;
  list-style: none;
}
li {
  display: grid;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid #e2e6ef;
}
.file-name {
  overflow-wrap: anywhere;
}
.file-meta {
  font-size: 13px;
}
.image-preview {
  display: grid;
  gap: 8px;
}
.image-preview img {
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
  justify-self: start;
}
[role='alert'] {
  color: #a23424;
}
@media (max-width: 1050px) {
  .subsidy-documents {
    grid-column: auto;
    grid-row: auto;
  }
}
</style>
