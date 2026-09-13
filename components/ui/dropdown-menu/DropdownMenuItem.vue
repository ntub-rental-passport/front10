<script setup lang="ts">
import type { DropdownMenuItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DropdownMenuItem, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<
  DropdownMenuItemProps & { class?: HTMLAttributes["class"]; variant?: "default" | "destructive" }
>()

const forwarded = useForwardProps(reactiveOmit(props, "class", "variant"))
</script>

<template>
  <DropdownMenuItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors',
        'focus:bg-muted data-[highlighted]:bg-muted',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        variant === 'destructive' ? 'text-destructive focus:bg-destructive/10 data-[highlighted]:bg-destructive/10' : '',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
