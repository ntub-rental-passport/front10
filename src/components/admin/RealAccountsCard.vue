<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { RefreshCw } from 'lucide-vue-next'
import {
  fetchAdminAccounts,
  updateAccountStatus,
  type AdminAccount,
} from '@/src/services/adminUsersApi'
import { getAuthSession } from '@/src/composables/useAuth'

/*
 * 真實帳號區。
 *
 * 與下方的展示資料分開呈現，是因為兩者的性質完全不同：
 * 這裡的每一列都是資料庫裡真的存在的人，按下停用會立刻讓對方登不進來；
 * 下方那份是為了展示各模組（工單、押金、補助）而生成的假資料，
 * 彼此以固定 id 互相指涉。混在一起會讓人分不清哪一列的操作是真的。
 */

const accounts = ref<AdminAccount[] | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const busyId = ref<number | null>(null)

const currentEmail = computed(() => getAuthSession()?.email ?? '')

const roleLabels: Record<string, string> = {
  tenant: '租客',
  landlord: '房東',
  admin: '管理員',
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  accounts.value = await fetchAdminAccounts()
  if (accounts.value === null) {
    errorMessage.value = '讀取失敗。請確認後端已啟動，且目前登入的是管理員帳號。'
  }
  loading.value = false
}

async function toggleStatus(account: AdminAccount): Promise<void> {
  errorMessage.value = ''
  busyId.value = account.id
  const next = account.status === 'active' ? 'suspended' : 'active'
  try {
    const updated = await updateAccountStatus(account.id, next)
    // 只換掉這一列，不重抓整份 —— 避免其他列的狀態在畫面上跳動
    accounts.value = (accounts.value ?? []).map((item) =>
      item.id === updated.id ? updated : item,
    )
  } catch (error) {
    // 後端的拒絕理由（不能停用自己、這是最後一位管理員）要讓操作者看到
    errorMessage.value = error instanceof Error ? error.message : '操作失敗。'
  } finally {
    busyId.value = null
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-TW', { hour12: false })
}

function loginMethods(account: AdminAccount): string {
  const methods = [...(account.hasPassword ? ['密碼'] : []), ...account.providers]
  return methods.length ? methods.join('、') : '尚未設定'
}

onMounted(load)
</script>

<template>
  <Card>
    <CardContent class="space-y-4 pt-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold">真實帳號（資料庫）</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            直接來自後端資料庫，非展示資料。停用會立即生效——對方現有的登入憑證同時失效。
            新增管理員請在伺服器上執行
            <code class="rounded bg-muted px-1 py-0.5 text-xs">manage_admin.py grant</code>。
          </p>
        </div>
        <Button variant="outline" size="sm" :disabled="loading" @click="load">
          <RefreshCw class="mr-2 size-4" />
          {{ loading ? '讀取中…' : '重新整理' }}
        </Button>
      </div>

      <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>

      <p v-if="loading" class="text-sm text-muted-foreground">讀取中…</p>

      <p v-else-if="accounts && accounts.length === 0" class="text-sm text-muted-foreground">
        資料庫裡目前沒有任何帳號。
      </p>

      <div v-else-if="accounts" class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>信箱</TableHead>
              <TableHead>暱稱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>登入方式</TableHead>
              <TableHead>信箱驗證</TableHead>
              <TableHead>註冊時間</TableHead>
              <TableHead>最後登入</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="account in accounts" :key="account.id">
              <TableCell class="font-medium">
                {{ account.email }}
                <Badge v-if="account.email === currentEmail" variant="outline" class="ml-2">你</Badge>
              </TableCell>
              <TableCell>{{ account.displayName || '—' }}</TableCell>
              <TableCell>
                <span v-if="account.roles.length === 0" class="text-muted-foreground">—</span>
                <Badge
                  v-for="role in account.roles"
                  :key="role"
                  :variant="role === 'admin' ? 'default' : 'secondary'"
                  class="mr-1"
                >
                  {{ roleLabels[role] ?? role }}
                </Badge>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">{{ loginMethods(account) }}</TableCell>
              <TableCell>
                <Badge :variant="account.emailVerified ? 'secondary' : 'outline'">
                  {{ account.emailVerified ? '已驗證' : '未驗證' }}
                </Badge>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ formatDate(account.createdAt) }}
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ formatDate(account.lastLoginAt) }}
              </TableCell>
              <TableCell>
                <Badge :variant="account.status === 'active' ? 'secondary' : 'destructive'">
                  {{ account.status === 'active' ? '啟用中' : '已停用' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button
                  size="sm"
                  :variant="account.status === 'active' ? 'outline' : 'default'"
                  :disabled="busyId === account.id"
                  @click="toggleStatus(account)"
                >
                  {{ account.status === 'active' ? '停用' : '啟用' }}
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
</template>
