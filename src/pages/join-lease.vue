<script setup lang="ts">
/**
 * 用邀請碼加入租約：/app/join-lease（租客已登入）。
 *
 * 先預覽（確認是哪一間、哪段租期）再確認加入；輸入錯太多次會被後端暫時擋下。
 */
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-vue-next'
import {
  acceptInvitationCode,
  previewInvitationCode,
  type InvitationPreview,
} from '@/src/services/leaseInvitationApi'

const code = ref('')
const preview = ref<InvitationPreview | null>(null)
const busy = ref(false)
const error = ref('')
const joined = ref(false)

async function lookUp(): Promise<void> {
  if (!code.value.trim()) return
  busy.value = true
  error.value = ''
  preview.value = null
  try {
    preview.value = await previewInvitationCode(code.value)
    joined.value = Boolean(preview.value.accepted_by_you)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '查詢失敗'
  } finally {
    busy.value = false
  }
}

async function accept(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    preview.value = await acceptInvitationCode(code.value)
    joined.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加入失敗'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 py-4">
    <header>
      <h1 class="text-2xl font-bold tracking-tight">加入租約</h1>
      <p class="mt-1 text-sm text-muted-foreground">輸入房東給你的邀請碼，把房東平台上的租約連到你的帳號。</p>
    </header>

    <form class="rounded-2xl border bg-card p-5" @submit.prevent="lookUp">
      <label class="grid gap-2 text-sm font-semibold">
        邀請碼
        <span class="flex gap-2">
          <input
            v-model="code"
            class="min-w-0 flex-1 rounded-xl border px-3 py-2.5 font-mono text-lg uppercase tracking-[.2em]"
            placeholder="ABCD-2345"
            maxlength="20"
            autocomplete="off"
            required
          />
          <button class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50" :disabled="busy">
            <KeyRound class="h-4 w-4" />查詢
          </button>
        </span>
      </label>
    </form>

    <section v-if="preview" class="rounded-2xl border bg-card p-5">
      <dl class="grid gap-2 text-sm">
        <div class="flex justify-between"><dt class="text-muted-foreground">房東</dt><dd class="font-semibold">{{ preview.landlord_name }}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">物件</dt><dd class="font-semibold">{{ preview.property_name }} {{ preview.room_number }}</dd></div>
        <div class="flex justify-between"><dt class="text-muted-foreground">租期</dt><dd class="font-semibold">{{ preview.lease_start?.replaceAll('-', '/') }} ～ {{ preview.lease_end?.replaceAll('-', '/') }}</dd></div>
      </dl>
      <p v-if="joined" class="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
        <CheckCircle2 class="h-4 w-4" />已加入這份租約。
      </p>
      <p v-else-if="preview.state !== 'pending'" class="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
        {{ preview.state === 'expired' ? '邀請已過期' : preview.state === 'revoked' ? '邀請已被房東撤銷' : '邀請已被其他帳號接受' }}，請向房東索取新的邀請。
      </p>
      <p v-else-if="preview.email_matches === false" class="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
        這份邀請是寄給 {{ preview.invited_email_masked }} 的，請改用該信箱的租客帳號登入。
      </p>
      <div class="mt-4 flex gap-2">
        <button
          v-if="!joined && preview.state === 'pending' && preview.email_matches !== false"
          class="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          :disabled="busy"
          @click="accept"
        >{{ busy ? '處理中…' : '確認加入' }}</button>
        <RouterLink v-if="joined" to="/app" class="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">回到首頁</RouterLink>
      </div>
    </section>

    <p v-if="error" class="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
      <AlertTriangle class="h-4 w-4" />{{ error }}
    </p>
  </div>
</template>
