<script setup lang="ts">
import type { DropdownMenuLabelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DropdownMenuLabel, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuLabelProps & { class?: HTMLAttributes["class"] }>()

const forwarded = useForwardProps(reactiveOmit(props, "class"))
</script>

<template>
  <DropdownMenuLabel v-bind="forwarded" :class="cn('px-3 py-2', props.class)">
    <slot />
  </DropdownMenuLabel>
</template>
