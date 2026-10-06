<script setup lang="ts">
/**
 * 邀請租客加入租約：QR code、連結、邀請碼三種入口，都指向同一份邀請。
 *
 * - QR code 在瀏覽器本機產生（qrcode 套件），邀請 token 不會送到第三方 QR 服務。
 * - token 與邀請碼只在建立當下拿得到；關掉視窗後要看就只能重發（舊的會失效）。
 * - 「複製成功」只代表複製到剪貼簿，不代表租客已收到。
 */
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { AlertTriangle, Check, Copy, Link2, QrCode, RefreshCw, Unlink, X } from 'lucide-vue-next'
import {
  createInvitation,
  fetchInvitation,
  revokeInvitation,
  unbindLeaseAccount,
  type CreatedInvitation,
  type InvitationStatus,
} from '@/src/services/landlordWorkspaceApi'

const props = defineProps<{
  open: boolean
  leaseId: number | null
  tenantName: string
  tenantEmail: string | null
  roomLabel: string
}>()
const emit = defineEmits<{ close: []; changed: [] }>()

const status = ref<InvitationStatus | null>(null)
const created = ref<CreatedInvitation | null>(null)
const qrDataUrl = ref('')
const email = ref('')
const busy = ref(false)
const error = ref('')
const copied = ref('')

const inviteUrl = computed(() => (created.value ? `${window.location.origin}${created.value.path}` : ''))
const stateLabel: Record<string, string> = {
  pending: '等待租客接受',
  accepted: '已接受',
  revoked: '已撤銷',
  expired: '已過期',
}

watch(() => [props.open, props.leaseId] as const, async ([open, leaseId]) => {
  if (!open || !leaseId) return
  created.value = null
  qrDataUrl.value = ''
  error.value = ''
  copied.value = ''
  email.value = props.tenantEmail ?? ''
  try {
    status.value = await fetchInvitation(leaseId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '讀取邀請狀態失敗'
  }
}, { immediate: true })

async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || !props.leaseId) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失敗，請稍後重試'
  } finally {
    busy.value = false
  }
}

function generate(): Promise<void> {
  return run(async () => {
    const result = await createInvitation(props.leaseId!, email.value.trim())
    created.value = result
    status.value = result
    qrDataUrl.value = await QRCode.toDataURL(`${window.location.origin}${result.path}`, { margin: 1, width: 220 })
    emit('changed')
  })
}

function revoke(): Promise<void> {
  if (!window.confirm('撤銷後，這份邀請的連結、QR code 和邀請碼都會失效。')) return Promise.resolve()
  return run(async () => {
    status.value = await revokeInvitation(props.leaseId!)
    created.value = null
    qrDataUrl.value = ''
    emit('changed')
  })
}

function unbind(): Promise<void> {
  if (!window.confirm(`解除 ${status.value?.bound_email ?? '租客帳號'} 與這份租約的綁定？對方將看不到這份租約，催繳與報修也不會再連到這個帳號。`)) return Promise.resolve()
  return run(async () => {
    status.value = await unbindLeaseAccount(props.leaseId!)
    emit('changed')
  })
}

async function copy(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = label
    window.setTimeout(() => { if (copied.value === label) copied.value = '' }, 2400)
  } catch {
    error.value = '無法自動複製，請手動選取。'
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @click.self="emit('close')">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <header>
          <div><p>{{ tenantName }} · {{ roomLabel }}</p><h2 id="invite-title">邀請租客加入</h2></div>
          <button type="button" class="close" aria-label="關閉" @click="emit('close')"><X /></button>
        </header>
        <div class="body">
          <p class="lead">租客用指定的 Email 登入（或註冊）租客帳號、按下「確認加入」後，這份租約就會連到他的帳號：他看得到租約與帳款提醒，報修會直接送到你這裡。接受邀請不會改變租金、租期或入住狀態。</p>

          <div v-if="status?.bound" class="state ok">
            <Check />
            <div><b>已綁定 {{ status.bound_email }}</b><small>{{ status.bound_at ? new Date(status.bound_at).toLocaleString('zh-TW') : '' }}</small></div>
            <button type="button" class="ghost danger" :disabled="busy" @click="unbind"><Unlink />解除綁定</button>
          </div>

          <template v-else>
            <div v-if="status?.invitation" class="state" :class="status.invitation.state === 'pending' ? 'pending' : 'muted'">
              <Link2 />
              <div>
                <b>{{ stateLabel[status.invitation.state] }}</b>
                <small>寄給 {{ status.invitation.invited_email }} · {{ status.invitation.state === 'pending' ? `${new Date(status.invitation.expires_at).toLocaleDateString('zh-TW')} 前有效` : `建立於 ${new Date(status.invitation.created_at).toLocaleDateString('zh-TW')}` }}</small>
              </div>
              <button v-if="status.invitation.state === 'pending'" type="button" class="ghost danger" :disabled="busy" @click="revoke">撤銷</button>
            </div>

            <div v-if="!created" class="form">
              <label>租客 Email<input v-model="email" type="email" required placeholder="租客登入用的信箱" /></label>
              <small>只有用這個信箱登入的租客帳號能接受邀請。</small>
              <button type="button" class="primary" :disabled="busy || !email.trim()" @click="generate">
                <component :is="status?.invitation?.state === 'pending' ? RefreshCw : QrCode" />
                {{ busy ? '產生中…' : status?.invitation?.state === 'pending' ? '重新產生（舊的會失效）' : '產生邀請' }}
              </button>
            </div>

            <div v-else class="result">
              <img v-if="qrDataUrl" :src="qrDataUrl" alt="邀請 QR code" width="220" height="220" />
              <div class="entries">
                <label>邀請連結
                  <span class="copy-row"><input :value="inviteUrl" readonly @focus="($event.target as HTMLInputElement).select()" /><button type="button" @click="copy(inviteUrl, 'link')"><component :is="copied === 'link' ? Check : Copy" />{{ copied === 'link' ? '已複製' : '複製' }}</button></span>
                </label>
                <label>邀請碼
                  <span class="copy-row"><input :value="created.code" readonly class="code" /><button type="button" @click="copy(created.code, 'code')"><component :is="copied === 'code' ? Check : Copy" />{{ copied === 'code' ? '已複製' : '複製' }}</button></span>
                </label>
                <p class="hint">租客可以掃 QR code、開連結，或登入後在「加入租約」輸入邀請碼。7 天內有效。關閉視窗後就看不到這組連結與邀請碼，需要時請重新產生。</p>
              </div>
            </div>
          </template>

          <p v-if="error" class="error" role="alert"><AlertTriangle />{{ error }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "../../index.css";
.backdrop { @apply fixed inset-0 z-50 grid place-items-center bg-[#24332a]/45 p-3 backdrop-blur-sm; }
.dialog { @apply max-h-[92vh] w-full max-w-xl overflow-auto rounded-[1.5rem] border border-[#e1dacd] bg-[#fffdf8] shadow-2xl; }
.dialog > header { @apply flex items-center justify-between border-b border-[#e4ded2] p-5; }
.dialog > header p { @apply text-xs text-[#7b847d]; }
.dialog > header h2 { @apply text-xl font-black; }
.close { @apply grid h-9 w-9 place-items-center rounded-full border border-[#ded8cc] bg-white; }
.close :deep(svg) { @apply h-4 w-4; }
.body { @apply space-y-4 p-5; }
.lead { @apply text-sm leading-6 text-[#5f6b63]; }
.state { @apply flex items-center gap-3 rounded-2xl border p-3 text-sm; }
.state > :deep(svg) { @apply h-5 w-5 shrink-0; }
.state div { @apply min-w-0 flex-1; }
.state b, .state small { @apply block; }
.state small { @apply text-xs text-[#6f7a72]; }
.state.ok { @apply border-[#cce1cf] bg-[#e7f3e9] text-[#3f6447]; }
.state.pending { @apply border-[#ecd4ae] bg-[#fff6e8] text-[#8a5c1c]; }
.state.muted { @apply border-[#e4ded2] bg-[#f6f4ee] text-[#6a736c]; }
.form { @apply grid gap-2; }
.form label, .entries label { @apply grid gap-1.5 text-sm font-bold; }
.form input, .entries input { @apply w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:ring-4 focus:ring-[#dcebdd]; }
.form small { @apply text-xs text-[#788179]; }
.primary { @apply mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#5b8263] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50; }
.primary :deep(svg), .ghost :deep(svg), .copy-row button :deep(svg) { @apply h-4 w-4; }
.ghost { @apply inline-flex shrink-0 items-center gap-1 rounded-full border border-[#ddd6c9] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50; }
.ghost.danger { @apply border-[#e4bcb4] text-[#a55247]; }
.result { @apply grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start; }
.result img { @apply mx-auto rounded-xl border border-[#e4ded2] bg-white p-2; }
.entries { @apply grid gap-3; }
.copy-row { @apply flex gap-2; }
.copy-row button { @apply inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#ddd6c9] bg-white px-3 text-xs font-bold; }
.code { @apply font-mono text-lg tracking-[.2em]; }
.hint { @apply text-xs leading-5 text-[#6f7a72]; }
.error { @apply flex items-center gap-2 rounded-xl bg-[#fbe9e6] p-3 text-sm font-bold text-[#a7564b]; }
.error :deep(svg) { @apply h-4 w-4 shrink-0; }
</style>
