<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Check, CircleCheckBig, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import logo from '@/src/assets/Logo/Rentmate-Logo-icon.png'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { changePassword, completePasswordReset, startPasswordReset, type PasswordResetChallenge } from '@/src/services/authApi'
import { DEFAULT_PASSWORD_MIN_LENGTH, DEFAULT_PASSWORD_MAX_LENGTH, fetchPublicSettings } from '@/src/services/platformSettingsApi'
import { isValidAuthEmail } from '@/src/constants/auth-validation'
import { getAuthIdentity } from '@/src/constants/auth-identity'
import { normalizeAuthRedirect } from '@/src/utils/auth-redirect'
import { clearAttempts } from '@/src/utils/login-lockout'

const route = useRoute()
const session = getAuthSession()
const changing = computed(() => route.path === '/change-password')
const role = getAuthIdentity(session?.role || route.query.role)
const redirect = normalizeAuthRedirect(route.query.redirect)
const loginLink = { path: '/login', query: { role, ...(redirect ? { redirect } : {}) } }
const backLink = computed(() => changing.value ? (role === 'landlord' ? '/landlord/settings/security' : '/app/account') : loginLink)
const email = ref(session?.email || '')
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const code = ref('')
const showPassword = ref(false)
const showCurrent = ref(false)
const pending = ref<PasswordResetChallenge | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const done = ref(false)
const minLength = ref(DEFAULT_PASSWORD_MIN_LENGTH)
const maxLength = ref(DEFAULT_PASSWORD_MAX_LENGTH)
const now = ref(Date.now())
const resendAt = ref(0)
const expiresAt = ref(0)
const heading = ref<HTMLElement | null>(null)
const resendIn = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))
const expired = computed(() => !!pending.value && now.value >= expiresAt.value)
const step = computed(() => done.value ? 3 : changing.value || pending.value ? 2 : 1)
const title = computed(() => done.value ? '密碼更新完成' : changing.value ? '修改密碼' : '重設密碼')
let timer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  try {
    const settings = await fetchPublicSettings()
    if (settings) {
      minLength.value = settings.passwordMinLength
      maxLength.value = settings.passwordMaxLength
    }
  } catch { /* Keep documented defaults; the server enforces the current policy. */ }
})
onUnmounted(() => { if (timer) clearInterval(timer) })

async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}

async function sendCode() {
  if (busy.value) return
  error.value = ''
  notice.value = ''
  if (!isValidAuthEmail(email.value)) { error.value = '請輸入有效的電子信箱。'; return }
  busy.value = true
  try {
    const result = await startPasswordReset(email.value.trim().toLowerCase())
    email.value = email.value.trim().toLowerCase()
    pending.value = result
    now.value = Date.now()
    resendAt.value = now.value + result.resendAvailableIn * 1000
    expiresAt.value = now.value + result.expiresIn * 1000
    code.value = ''
    notice.value = result.message
    await focusHeading()
  } catch (e) { error.value = e instanceof Error ? e.message : '目前無法寄送驗證信，請稍後再試。' }
  finally { busy.value = false }
}

async function submitPassword() {
  if (busy.value) return
  error.value = ''
  if (changing.value && !currentPassword.value) { error.value = '請輸入目前密碼。'; return }
  if (!changing.value && (!/^\d{6}$/.test(code.value) || expired.value)) {
    error.value = expired.value ? '驗證碼已過期，請重新寄送。' : '請輸入信件中的 6 位數驗證碼。'; return
  }
  if (newPassword.value.length < minLength.value || newPassword.value.length > maxLength.value) {
    error.value = `密碼長度必須介於 ${minLength.value} 到 ${maxLength.value} 個字元。`; return
  }
  if (newPassword.value !== confirmation.value) { error.value = '兩次輸入的新密碼不一致。'; return }
  busy.value = true
  try {
    if (changing.value) await changePassword(currentPassword.value, newPassword.value)
    else if (pending.value) await completePasswordReset(pending.value.challengeId, code.value, newPassword.value)
    else return
    clearAttempts(email.value)
    signOut()
    currentPassword.value = newPassword.value = confirmation.value = code.value = ''
    pending.value = null
    done.value = true
    if (timer) clearInterval(timer)
    await focusHeading()
  } catch (e) { error.value = e instanceof Error ? e.message : '密碼更新失敗，請稍後再試。' }
  finally { busy.value = false }
}

function restart() {
  pending.value = null
  code.value = newPassword.value = confirmation.value = error.value = notice.value = ''
  void focusHeading()
}
</script>

<template>
  <div class="login-page password-page">
    <header class="login-header">
      <RouterLink to="/" class="login-brand" aria-label="回到 RentMate 首頁"><img :src="logo" alt="" class="login-brand__icon" /><span>RentMate</span></RouterLink>
    </header>
    <div class="login-title-bar"><h1>{{ title }}</h1></div>
    <main class="login-content">
      <section class="login-panel login-panel--form">
        <div class="login-panel__inner">
          <RouterLink v-if="!done" :to="backLink" class="password-back"><ArrowLeft :size="16" />{{ changing ? '返回帳戶設定' : '返回登入' }}</RouterLink>
          <ol v-if="!changing" class="password-steps" aria-label="重設密碼進度">
            <li v-for="(label, index) in ['確認信箱', '設定密碼', '完成']" :key="label" :class="{ active: step >= index + 1 }" :aria-current="step === index + 1 ? 'step' : undefined"><span><Check v-if="step > index + 1" :size="14" /><template v-else>{{ index + 1 }}</template></span>{{ label }}</li>
          </ol>

          <div v-if="done" class="password-success" role="status">
            <CircleCheckBig :size="48" :stroke-width="1.4" />
            <h2 ref="heading" tabindex="-1">新密碼，準備好了</h2>
            <p>密碼已更新，原有登入狀態已失效。<br>請使用新密碼重新登入 RentMate。</p>
            <Button as-child class="auth-primary-button"><RouterLink :to="loginLink">返回登入</RouterLink></Button>
          </div>
          <template v-else>
            <h2 ref="heading" class="login-section-title" tabindex="-1">{{ changing ? '為帳戶換一組新密碼' : pending ? '驗證信箱，設定新密碼' : '忘記密碼了嗎？' }}</h2>
            <p class="password-intro">{{ changing ? '輸入目前密碼以確認是您本人，再設定新密碼。' : pending ? `若 ${email} 符合密碼重設條件，請至收件匣查收驗證碼。` : '輸入註冊時使用的電子信箱，我們會為符合重設條件的帳號寄送驗證碼。' }}</p>

            <form v-if="!changing && !pending" class="auth-page-form" novalidate :aria-busy="busy" @submit.prevent="sendCode">
              <div class="auth-field-block">
                <Label for="reset-email" class="auth-field-label">電子郵件地址</Label>
                <div class="auth-input-wrap"><Mail class="auth-input-icon" /><Input id="reset-email" v-model="email" type="email" autocomplete="email" placeholder="name@example.com" maxlength="254" required :disabled="busy" class="auth-input auth-input--with-leading auth-input--default" /></div>
              </div>
              <p v-if="error" class="password-error" role="alert">{{ error }}</p>
              <Button type="submit" :disabled="busy" class="auth-primary-button">{{ busy ? '正在寄送…' : '寄送重設驗證碼' }}</Button>
              <p class="password-footnote">使用 Google 註冊的帳號，請以 Google 登入；Google 密碼需至 Google 帳戶管理。</p>
            </form>

            <form v-else class="auth-page-form" novalidate :aria-busy="busy" @submit.prevent="submitPassword">
              <p v-if="notice && !changing" class="password-notice" role="status">{{ notice }}</p>
              <p v-if="!changing" class="password-footnote">
                使用 Google 建立、尚未設定 RentMate 密碼的帳號，不會收到重設驗證碼，請
                <RouterLink :to="loginLink" class="auth-inline-link">返回登入並選擇 Google 登入</RouterLink>。
                內部管理員帳號不適用此流程，請聯絡系統管理人員處理。
              </p>
              <div v-if="!changing" class="auth-field-block">
                <Label for="reset-code" class="auth-field-label">信箱驗證碼</Label>
                <div class="auth-input-wrap"><KeyRound class="auth-input-icon" /><Input id="reset-code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位數驗證碼" required :disabled="busy" class="auth-input auth-input--with-leading auth-input--default" aria-describedby="code-help" /></div>
                <div id="code-help" class="password-resend"><span>{{ expired ? '驗證碼已過期' : '驗證碼 10 分鐘內有效' }}</span><button type="button" :disabled="busy || resendIn > 0" @click="sendCode">{{ resendIn > 0 ? `${resendIn} 秒後可重寄` : '重新寄送' }}</button></div>
              </div>
              <div v-if="changing" class="auth-field-block">
                <Label for="current-password" class="auth-field-label">目前密碼</Label>
                <div class="auth-input-wrap"><LockKeyhole class="auth-input-icon" /><Input id="current-password" v-model="currentPassword" :type="showCurrent ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required :disabled="busy" class="auth-input auth-input--with-leading auth-input--with-status auth-input--default" /><button class="auth-input-toggle" type="button" :aria-label="showCurrent ? '隱藏目前密碼' : '顯示目前密碼'" :aria-pressed="showCurrent" @click="showCurrent = !showCurrent"><EyeOff v-if="showCurrent" :size="18" /><Eye v-else :size="18" /></button></div>
              </div>
              <div class="auth-field-block">
                <Label for="new-password" class="auth-field-label">新密碼</Label>
                <div class="auth-input-wrap"><LockKeyhole class="auth-input-icon" /><Input id="new-password" v-model="newPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" :maxlength="maxLength" required :disabled="busy" class="auth-input auth-input--with-leading auth-input--with-status auth-input--default" aria-describedby="password-help" /><button class="auth-input-toggle" type="button" :aria-label="showPassword ? '隱藏新密碼' : '顯示新密碼'" :aria-pressed="showPassword" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" :size="18" /><Eye v-else :size="18" /></button></div>
                <p id="password-help" class="password-footnote">{{ minLength }}–{{ maxLength }} 個字元；建議混合英文字母、數字與符號。</p>
              </div>
              <div class="auth-field-block">
                <Label for="confirm-password" class="auth-field-label">再次輸入新密碼</Label>
                <div class="auth-input-wrap"><LockKeyhole class="auth-input-icon" /><Input id="confirm-password" v-model="confirmation" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" :maxlength="maxLength" required :disabled="busy" class="auth-input auth-input--with-leading auth-input--default" /></div>
              </div>
              <p v-if="error" class="password-error" role="alert">{{ error }}</p>
              <Button type="submit" :disabled="busy || (!changing && expired)" class="auth-primary-button">{{ busy ? '正在處理…' : '確認更新密碼' }}</Button>
              <button v-if="!changing" type="button" class="password-other" :disabled="busy" @click="restart">信箱填錯了？重新輸入</button>
              <RouterLink v-else :to="{ path: '/forgot-password', query: { role } }" class="password-other">忘記目前密碼？使用信箱驗證</RouterLink>
            </form>
          </template>
        </div>
      </section>

      <aside class="login-panel login-panel--register">
        <div class="register-promo password-guide">
          <div class="password-guide-icon"><ShieldCheck :size="32" :stroke-width="1.4" /></div>
          <h2>安心回到您的租賃日常</h2>
          <p class="register-promo__lead">保護帳戶，讓重要的事放心留在 RentMate。</p>
          <ul class="register-feature-list">
            <li><Mail /><div><h3>由您的信箱確認</h3><p>驗證碼僅供本人使用，請勿轉交給其他人。</p></div></li>
            <li><KeyRound /><div><h3>一組密碼，兩種身分</h3><p>同一信箱的租客與房東身分，共用更新後的密碼。</p></div></li>
            <li><ShieldCheck /><div><h3>資料完整保留</h3><p>更新密碼不會影響您的租約、報修紀錄與帳戶資料。</p></div></li>
          </ul>
          <p class="password-footnote">沒有收到信？請檢查垃圾郵件與信箱拼字，待倒數結束後可重新寄送。</p>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped src="./login.css"></style>
<style scoped>
@reference "../../index.css";
.password-page { display: block; }
.password-page .login-content { height: auto; min-height: 0; padding-bottom: 40px; }
.password-page .login-panel { padding-top: 36px; padding-bottom: 36px; }
.password-page .login-panel__inner, .password-page .register-promo { height: auto; padding-bottom: 0; }
.password-page .login-section-title { text-align: left; margin-bottom: 10px; }
.password-back { @apply mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground; }
.password-steps { @apply mb-8 flex items-center gap-5 text-xs text-muted-foreground sm:gap-8; }
.password-steps li { @apply flex items-center gap-2; }
.password-steps span { @apply flex h-6 w-6 items-center justify-center border border-border; }
.password-steps .active { @apply text-foreground; }
.password-steps .active span { @apply border-zinc-950 bg-zinc-950 text-white; }
.password-intro { @apply mb-7 text-sm leading-7 text-muted-foreground; overflow-wrap: anywhere; }
.password-footnote { @apply text-xs leading-6 text-muted-foreground; }
.password-notice { @apply border-l-2 border-zinc-400 bg-zinc-50 px-4 py-3 text-xs leading-6 text-muted-foreground; }
.password-error { @apply border-l-2 border-destructive bg-red-50 px-4 py-3 text-sm leading-6 text-destructive; }
.password-resend { @apply flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground; }
.password-resend button { @apply min-h-9 text-primary underline disabled:text-muted-foreground disabled:no-underline; }
.password-other { @apply mx-auto block min-h-9 text-center text-xs leading-9 text-primary underline; }
.password-success { @apply flex flex-col items-center gap-6 py-8 text-center; }
.password-success h2 { @apply text-2xl font-semibold; }
.password-success p { @apply text-sm leading-7 text-muted-foreground; }
.password-guide { padding-top: 36px; }
.password-guide-icon { @apply mb-5 flex h-16 w-16 items-center justify-center bg-zinc-100; }
.password-page .auth-input { @apply bg-zinc-50 focus-visible:border-zinc-900; height: 48px; }
.password-page .auth-input-toggle { @apply flex h-10 w-9 items-center justify-center; }
.password-page :is(button, a):focus-visible { outline: 2px solid var(--color-primary); outline-offset: 4px; }
.password-page h2:focus { outline: none; }
@media (max-width: 1023px) { .password-guide { padding-top: 0; } }
@media (max-width: 639px) { .password-page .login-panel { padding-top: 24px; padding-bottom: 24px; } }
</style>
