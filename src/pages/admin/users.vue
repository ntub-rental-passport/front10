<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Search } from 'lucide-vue-next'
import { adminRoleLabels, useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { formatDate } from '@/src/utils/admin-format'
import type { AdminUser, AdminUserRole } from '@/src/mocks/admin-seed'

const { users, setStatus, setRole } = useAdminUsers()

const keyword = ref('')
const roleFilter = ref<'all' | AdminUserRole>('all')
const statusFilter = ref<'all' | 'active' | 'suspended'>('all')
const detailUser = ref<AdminUser | null>(null)

const filteredUsers = computed(() =>
  users.value.filter((user) => {
    const text = keyword.value.trim().toLowerCase()
    if (
      text &&
      !user.email.toLowerCase().includes(text) &&
      !(user.nickname ?? '').toLowerCase().includes(text)
    ) {
      return false
    }
    if (roleFilter.value !== 'all' && user.role !== roleFilter.value) return false
    if (statusFilter.value !== 'all' && user.status !== statusFilter.value) return false
    return true
  }),
)

function toggleStatus(user: AdminUser): void {
  setStatus(user.id, user.status === 'active' ? 'suspended' : 'active')
}

function handleRoleChange(user: AdminUser, value: unknown): void {
  setRole(user.id, value as AdminUserRole)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">使用者管理</h1>
      <p class="mt-1 text-muted-foreground">檢視與管理平台帳號的狀態與角色。</p>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="space-y-4 pt-6">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋 Email 或暱稱" class="pl-9" />
          </div>
          <Select v-model="roleFilter">
            <SelectTrigger class="w-36">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              <SelectItem value="user">租客</SelectItem>
              <SelectItem value="landlord">房東</SelectItem>
              <SelectItem value="admin">管理員</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="statusFilter">
            <SelectTrigger class="w-36">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="active">正常</SelectItem>
              <SelectItem value="suspended">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>暱稱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>註冊日</TableHead>
              <TableHead>Email 驗證</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="user in filteredUsers" :key="user.id">
              <TableCell class="font-medium">{{ user.email }}</TableCell>
              <TableCell>{{ user.nickname ?? '—' }}</TableCell>
              <TableCell>{{ adminRoleLabels[user.role] }}</TableCell>
              <TableCell>
                <Badge :variant="user.status === 'active' ? 'default' : 'destructive'">
                  {{ user.status === 'active' ? '正常' : '停用' }}
                </Badge>
              </TableCell>
              <TableCell>{{ formatDate(user.registeredAt) }}</TableCell>
              <TableCell>{{ user.emailVerified ? '已驗證' : '未驗證' }}</TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click="detailUser = user">詳情</Button>
                  <Button
                    :variant="user.status === 'active' ? 'destructive' : 'default'"
                    size="sm"
                    @click="toggleStatus(user)"
                  >
                    {{ user.status === 'active' ? '停用' : '啟用' }}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="filteredUsers.length === 0">
              <TableCell colspan="7" class="py-8 text-center text-muted-foreground">
                沒有符合條件的使用者。
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog
      :open="detailUser !== null"
      @update:open="(open: boolean) => { if (!open) detailUser = null }"
    >
      <DialogContent v-if="detailUser">
        <DialogHeader>
          <DialogTitle>使用者詳情</DialogTitle>
          <DialogDescription>{{ detailUser.email }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between"><span class="text-muted-foreground">暱稱</span><span>{{ detailUser.nickname ?? '—' }}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">註冊日</span><span>{{ formatDate(detailUser.registeredAt) }}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">Email 驗證</span><span>{{ detailUser.emailVerified ? '已驗證' : '未驗證' }}</span></div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">角色</span>
            <Select
              :model-value="detailUser.role"
              @update:model-value="(value) => handleRoleChange(detailUser!, value)"
            >
              <SelectTrigger class="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">租客</SelectItem>
                <SelectItem value="landlord">房東</SelectItem>
                <SelectItem value="admin">管理員</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            :variant="detailUser.status === 'active' ? 'destructive' : 'default'"
            @click="toggleStatus(detailUser)"
          >
            {{ detailUser.status === 'active' ? '停用帳號' : '啟用帳號' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
