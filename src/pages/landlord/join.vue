<script setup lang="ts">
/**
 * 接受團隊邀請：/landlord/join/:token
 *
 * 只有用受邀 Email 登入的房東帳號能接受。接受後切換到那個工作區。
 * 沒登入的人會先被路由守衛帶去登入頁，登入完回到這裡。
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, Users } from 'lucide-vue-next'
import { getAuthSession, signOut } from '@/src/composables/useAuth'
import { setActiveWorkspaceOwnerId } from '@/src/services/landlordApiClient'
import { acceptTeamInvitation, previewTeamInvitation } from '@/src/services/landlordWorkspaceApi'

const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.params.token || ''))
const preview = ref<Awaited<ReturnType<typeof previewTeamInvitation>> | null>(null)
const error = ref('')
const loading = ref(true)
const accepting = ref(false)
const email = getAuthSession()?.email ?? ''

onMounted(async () => {
  try {
    preview.value = await previewTeamInvitation(token.value)
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
    const result = await acceptTeamInvitation(token.value)
    setActiveWorkspaceOwnerId(String(result.owner_id))
    await router.replace('/landlord')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '接受邀請失敗'
  } finally {
    accepting.value = false
  }
}

async function switchAccount(): Promise<void> {
  signOut()
  await router.push({ path: '/login', query: { role: 'landlord', redirect: route.fullPath } })
}
</script>

<template>
  <div class="mx-auto max-w-xl py-10">
    <section class="rounded-[1.6rem] border border-[#e2dccf] bg-white/90 p-6 shadow-sm">
      <span class="grid h-12 w-12 place-items-center rounded-full bg-[#e7f2e8] text-[#5b8263]"><Users class="h-5 w-5" /></span>
      <h1 class="mt-4 text-2xl font-black">加入房東工作區</h1>
      <p v-if="loading" class="mt-3 text-sm text-[#778078]">正在讀取邀請…</p>
      <template v-else-if="preview">
        <p class="mt-3 text-sm leading-6 text-[#5f6b63]">
          {{ preview.owner_name }} 邀請你以「<b>{{ preview.role_label }}</b>」身分加入「<b>{{ preview.workspace_name }}</b>」。
        </p>
        <p v-if="preview.status === 'active'" class="notice ok"><CheckCircle2 />這份邀請已經接受過了。</p>
        <p v-else-if="preview.status !== 'pending'" class="notice"><AlertTriangle />邀請已過期或已撤銷，請向工作區擁有者索取新的邀請。</p>
        <p v-else-if="!preview.email_matches" class="notice"><AlertTriangle />這份邀請不是給目前登入的 {{ email }}。請改用受邀的 Email 登入房東帳號。</p>
        <div class="mt-6 flex flex-wrap gap-2">
          <button
            v-if="preview.status === 'pending' && preview.email_matches"
            class="rounded-full bg-[#5b8263] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            :disabled="accepting"
            @click="accept"
          >{{ accepting ? '處理中…' : '接受邀請' }}</button>
          <button
            v-if="preview.status === 'pending' && !preview.email_matches"
            class="rounded-full bg-[#5b8263] px-5 py-2.5 text-sm font-bold text-white"
            @click="switchAccount"
          >換帳號登入</button>
          <RouterLink to="/landlord" class="rounded-full border border-[#ddd6c9] px-5 py-2.5 text-sm font-bold">回到總覽</RouterLink>
        </div>
      </template>
      <p v-if="error" class="notice" role="alert"><AlertTriangle />{{ error }}</p>
    </section>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.notice { @apply mt-4 flex items-start gap-2 rounded-xl bg-[#fbe9e6] p-3 text-sm font-bold text-[#a7564b]; }
.notice :deep(svg) { @apply mt-0.5 h-4 w-4 shrink-0; }
.notice.ok { @apply bg-[#e7f3e9] text-[#54795a]; }
</style>
