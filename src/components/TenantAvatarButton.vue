<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getAuthSession } from '@/src/composables/useAuth'

const route = useRoute()
const account = ref(getAuthSession())
const imageFailed = ref(false)
const initials = computed(() => account.value?.nickname?.trim().slice(0, 1).toUpperCase() || 'R')

watch(() => route.fullPath, () => {
  account.value = getAuthSession()
})
watch(() => account.value?.picture, () => {
  imageFailed.value = false
})

function onImageError(): void {
  imageFailed.value = true
}
</script>

<template>
  <RouterLink
    to="/app/account"
    aria-label="我的帳戶"
    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">
      <img
        v-if="account?.picture && !imageFailed"
        :src="account.picture"
        alt=""
        class="h-full w-full object-cover"
        @error="onImageError"
      />
      <span v-else>{{ initials }}</span>
    </span>
  </RouterLink>
</template>
