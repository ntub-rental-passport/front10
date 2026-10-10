<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'

defineProps<{
  count: number
}>()
</script>

<template>
  <Card class="rounded-3xl border-border/70 bg-background/90 shadow-sm">
    <CardHeader class="p-5 pb-2">
      <CardTitle class="text-sm font-medium">管理員</CardTitle>
    </CardHeader>
    <CardContent class="px-5 pb-5">
      <p class="text-3xl font-black leading-none tabular-nums">{{ count }}</p>
    </CardContent>
  </Card>
</template>
