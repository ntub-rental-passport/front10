<script setup lang="ts">
import type { Component } from 'vue'
import { Card, CardContent } from '@/components/ui/card'

const props = withDefaults(defineProps<{
  icon: Component
  title: string
  description: string
  variant?: 'default' | 'highlight'
}>(), { variant: 'default' })
</script>

<template>
  <Card :class="variant === 'highlight' ? 'bg-blue-50 border-blue-200' : ''">
    <CardContent class="flex items-start gap-3 pt-4">
      <div class="rounded-lg p-2 bg-primary/10">
        <component :is="icon" class="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 class="font-medium text-sm">{{ title }}</h3>
        <p class="text-xs text-muted-foreground mt-1">{{ description }}</p>
      </div>
    </CardContent>
  </Card>
</template>
