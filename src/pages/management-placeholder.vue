<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Card, CardContent } from '@/components/ui/card/index'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '功能建置中'))
const description = computed(() => String(route.meta.description ?? '此頁已完成路由與權限配置，後續可串接資料庫與 API。'))
</script>

<template><div class="space-y-6"><div><h1 class="text-4xl font-black tracking-tight">{{ title }}</h1><p class="mt-2 text-muted-foreground">{{ description }}</p></div><Card class="rounded-[1.75rem]"><CardContent class="p-8 text-sm text-muted-foreground">頁面入口已建立。正式資料操作需經過後端身分驗證、權限檢查與操作紀錄。</CardContent></Card></div></template>
