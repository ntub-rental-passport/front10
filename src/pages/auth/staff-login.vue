<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { resolveRoleHome, signIn, type AuthRole } from '@/src/composables/useAuth'

const route = useRoute()
const router = useRouter()
const role = ref<'admin' | 'reviewer'>(route.query.role === 'reviewer' ? 'reviewer' : 'admin')
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const roleDescription = computed(() => role.value === 'admin' ? '帳號、角色、內容與系統維護' : '人工審核、通過、駁回與備註')

async function handleLogin(): Promise<void> {
  if (!email.value.trim() || password.value.length < 8) {
    errorMessage.value = '請輸入內部人員信箱與至少 8 個字元的密碼。'
    return
  }
  const session = signIn(role.value as AuthRole, email.value.trim())
  await router.push(resolveRoleHome(session.role))
}
</script>

<template>
  <AuthShell content-width-class="max-w-lg" footer-note="此入口僅供經授權的 RentMate 內部人員使用。">
    <div><p class="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">Internal Access</p><h1 class="mt-3 text-4xl font-black tracking-tight">內部人員登入</h1><p class="mt-3 text-muted-foreground">{{ roleDescription }}。正式上線時應串接後端驗證與多因素驗證。</p></div>
    <form class="mt-8 space-y-5" @submit.prevent="handleLogin">
      <div class="grid grid-cols-2 gap-3"><Button type="button" :variant="role === 'admin' ? 'default' : 'outline'" @click="role = 'admin'">系統管理員</Button><Button type="button" :variant="role === 'reviewer' ? 'default' : 'outline'" @click="role = 'reviewer'">資料審核人員</Button></div>
      <div class="space-y-2"><Label for="staff-email">內部人員信箱</Label><Input id="staff-email" v-model="email" type="email" placeholder="staff@rentmate.tw" autocomplete="username" /></div>
      <div class="space-y-2"><Label for="staff-password">密碼</Label><Input id="staff-password" v-model="password" type="password" placeholder="至少 8 個字元" autocomplete="current-password" /></div>
      <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
      <Button type="submit" size="lg" class="w-full">登入內部工作區</Button>
      <p class="text-xs leading-5 text-muted-foreground">目前是前端展示登入，不代表正式安全驗證；後續需由 FastAPI 驗證帳密、角色與權限。</p>
    </form>
  </AuthShell>
</template>
