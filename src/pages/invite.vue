<script setup lang="ts">
/**
 * 租約邀請：/invite/:token（房東給的 QR code 與連結都指向這裡）。
 *
 * 未登入也能看概要（房東稱呼、物件、房號、租期）；要加入必須用受邀信箱的
 * 租客帳號登入。登入、註冊、Email 驗證、Google 登入都會帶著 redirect 回到這頁。
 * 單純打開這頁不會消耗邀請，按下「確認加入」才會。
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, Home, KeyRound } from 'lucide-vue-next'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import {
  acceptInvitation,
  previewInvitation,
  previewInvitationAsTenant,
  type InvitationPreview,
} from '@/src/services/leaseInvitationApi'

const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.params.token || ''))
const session = getAuthSession()
const isTenant = session?.isAuthenticated && session.role === 'tenant'
const otherRole = session?.isAuthenticated && session.role !== 'tenant'
const preview = ref<InvitationPreview | null>(null)
const loading = ref(true)
const accepting = ref(false)
const error = ref('')
const joined = ref(false)

const authQuery = computed(() => ({ role: 'tenant', redirect: route.fullPath }))
const period = computed(() =>
  preview.value?.lease_start && preview.value.lease_end
    ? `${preview.value.lease_start.replaceAll('-', '/')} ～ ${preview.value.lease_end.replaceAll('-', '/')}`
    : '—',
)

onMounted(async () => {
  try {
    preview.value = isTenant ? await previewInvitationAsTenant(token.value) : await previewInvitation(token.value)
    joined.value = Boolean(preview.value.accepted_by_you)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '讀取邀請失敗'
  } finally {
    loading.value = false
  }
})

async function accept(): Promise<void> {
  accepting.value = true
  error.value = ''
  try {
    preview.value = await acceptInvitation(token.value)
    joined.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加入失敗，請稍後再試'
  } finally {
    accepting.value = false
  }
}

async function switchToTenant(): Promise<void> {
  signOut()
  await router.push({ path: '/login', query: authQuery.value })
}
</script>

<template>
  <main class="min-h-screen bg-[#f7f4ea] px-4 py-10 text-[#233129]">
    <section class="mx-auto max-w-lg rounded-[1.6rem] border border-[#e2dccf] bg-white p-6 shadow-sm">
      <span class="grid h-12 w-12 place-items-center rounded-full bg-[#e7f2e8] text-[#5b8263]"><Home class="h-5 w-5" /></span>
      <h1 class="mt-4 text-2xl font-black">租約邀請</h1>

      <p v-if="loading" class="mt-3 text-sm text-[#778078]">正在讀取邀請…</p>

      <template v-else-if="preview">
        <dl class="facts">
          <div><dt>房東</dt><dd>{{ preview.landlord_name }}</dd></div>
          <div><dt>物件</dt><dd>{{ preview.property_name }} {{ preview.room_number }}</dd></div>
          <div><dt>租期</dt><dd>{{ period }}</dd></div>
          <div v-if="preview.invited_email_masked"><dt>受邀信箱</dt><dd>{{ preview.invited_email_masked }}</dd></div>
        </dl>

        <div v-if="joined" class="notice ok">
          <CheckCircle2 />
          <div><b>你已加入這份租約</b><p>之後房東的帳款提醒會送到你的通知，報修也能直接送給房東。</p></div>
        </div>
        <p v-else-if="preview.state === 'accepted'" class="notice"><AlertTriangle />這份邀請已被其他帳號接受。如果不是你，請聯絡房東。</p>
        <p v-else-if="preview.state === 'revoked'" class="notice"><AlertTriangle />房東已撤銷或重新發送這份邀請，請向房東索取新的連結。</p>
        <p v-else-if="preview.state === 'expired'" class="notice"><AlertTriangle />這份邀請已過期，請向房東索取新的連結。</p>
        <template v-else>
          <p v-if="isTenant && preview.email_matches === false" class="notice">
            <AlertTriangle />這份邀請是寄給 {{ preview.invited_email_masked }} 的，目前登入的是 {{ session?.email }}。請改用受邀信箱的租客帳號登入。
          </p>
          <p class="mt-4 text-sm leading-6 text-[#5f6b63]">
            確認加入後，這份租約會連到你的租客帳號。這不代表簽署合約，也不會改變租金或租期。
          </p>
        </template>

        <div class="actions">
          <template v-if="joined">
            <RouterLink to="/app" class="primary">前往我的首頁</RouterLink>
            <RouterLink to="/app/repairs" class="secondary">報修</RouterLink>
          </template>
          <template v-else-if="preview.state === 'pending'">
            <button v-if="isTenant && preview.email_matches !== false" class="primary" :disabled="accepting" @click="accept">
              {{ accepting ? '處理中…' : '確認加入' }}
            </button>
            <button v-else-if="isTenant || otherRole" class="primary" @click="switchToTenant">
              {{ otherRole ? '改用租客帳號登入' : '換帳號登入' }}
            </button>
            <template v-else>
              <RouterLink :to="{ path: '/login', query: authQuery }" class="primary">登入租客帳號</RouterLink>
              <RouterLink :to="{ path: '/register', query: authQuery }" class="secondary">註冊租客帳號</RouterLink>
            </template>
          </template>
        </div>
        <p v-if="otherRole && preview.state === 'pending'" class="mt-3 text-xs text-[#778078]">
          目前登入的是房東或管理員帳號。同一個 Email 可以另外註冊租客身分，再用租客身分接受邀請。
        </p>
      </template>

      <p v-if="error" class="notice" role="alert"><AlertTriangle />{{ error }}</p>
      <RouterLink v-if="isTenant && !joined" to="/app/join-lease" class="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#557b5d]">
        <KeyRound class="h-3.5 w-3.5" />手上是邀請碼？改用邀請碼加入
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
@reference "../index.css";
.facts { @apply mt-4 divide-y divide-[#ece6db] rounded-2xl border border-[#e4ded2]; }
.facts div { @apply flex justify-between gap-3 px-4 py-2.5 text-sm; }
.facts dt { @apply text-[#788179]; }
.facts dd { @apply text-right font-bold; }
.notice { @apply mt-4 flex items-start gap-2 rounded-xl bg-[#fbe9e6] p-3 text-sm font-bold text-[#a7564b]; }
.notice :deep(svg) { @apply mt-0.5 h-4 w-4 shrink-0; }
.notice.ok { @apply bg-[#e7f3e9] text-[#3f6447]; }
.notice p { @apply mt-1 font-normal; }
.actions { @apply mt-6 flex flex-wrap gap-2; }
.primary { @apply inline-flex items-center rounded-full bg-[#5b8263] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50; }
.secondary { @apply inline-flex items-center rounded-full border border-[#ddd6c9] px-5 py-2.5 text-sm font-bold; }
</style>
