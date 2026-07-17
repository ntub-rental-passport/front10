<script setup lang="ts">
import { FileClock, LayoutDashboard, ScrollText, Settings, UserCog } from 'lucide-vue-next'
import ManagementLayout from '@/src/components/management-layout.vue'

const navItems = [
  { label: '系統總覽', path: '/admin', icon: LayoutDashboard },
  { label: '帳號與角色', path: '/admin/users', icon: UserCog },
  { label: '資料與內容維護', path: '/admin/content', icon: FileClock },
  { label: '操作紀錄', path: '/admin/audit-logs', icon: ScrollText },
  { label: '系統設定', path: '/admin/settings', icon: Settings },
]
</script>

<template>
  <ManagementLayout title="RentMate 系統管理" workspace-label="系統管理員工作區" workspace-description="管理帳號、角色、資料內容與系統操作紀錄" home-path="/admin" :nav-items="navItems" />
</template>
