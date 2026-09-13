<script setup lang="ts">
import type { DropdownMenuTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DropdownMenuTrigger, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuTriggerProps & { class?: HTMLAttributes["class"] }>()

const forwarded = useForwardProps(reactiveOmit(props, "class"))
</script>

<template>
  <DropdownMenuTrigger v-bind="forwarded" :class="cn('outline-none', props.class)">
    <slot />
  </DropdownMenuTrigger>
</template>
