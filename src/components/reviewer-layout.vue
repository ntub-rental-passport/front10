<script setup lang="ts">
import { ClipboardCheck, History, LayoutDashboard } from 'lucide-vue-next'
import ManagementLayout from '@/src/components/management-layout.vue'

const navItems = [
  { label: '審核總覽', path: '/reviewer', icon: LayoutDashboard },
  { label: '待審案件', path: '/reviewer/cases', icon: ClipboardCheck },
  { label: '審核紀錄', path: '/reviewer/history', icon: History },
]
</script>

<template>
  <ManagementLayout title="RentMate Review" workspace-label="資料審核工作區" workspace-description="認領案件並執行通過、駁回、補件與備註" home-path="/reviewer" :nav-items="navItems" />
</template>
