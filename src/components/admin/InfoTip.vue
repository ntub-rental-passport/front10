<script setup lang="ts">
import { Info } from 'lucide-vue-next'
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{ text: string; label?: string }>(), { label: '說明' })
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <button
          v-bind="$attrs"
          type="button"
          :aria-label="label"
          class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Info class="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="top"
          :side-offset="6"
          class="z-50 max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-sm font-normal leading-relaxed text-popover-foreground shadow-md"
        >
          <slot>{{ text }}</slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
