<script setup lang="ts">
defineProps<{ currentStep: number; totalSteps: number }>()
</script>

<template>
  <div class="flex items-center justify-center gap-2 mb-6">
    <template v-for="step in totalSteps" :key="step">
      <div
        :class="[
          'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
          step === currentStep
            ? 'bg-primary text-primary-foreground'
            : step < currentStep
            ? 'bg-primary/30 text-primary'
            : 'bg-muted text-muted-foreground'
        ]"
      >
        {{ step }}
      </div>
      <div v-if="step < totalSteps" class="h-0.5 w-8 bg-muted" />
    </template>
  </div>
</template>
