<template>
  <section class="room-rhythm-layout">
    <router-view />
  </section>
</template>

<style scoped>
.room-rhythm-layout {
  width: 100%;
  min-width: 0;
  min-height: 100%;
  background:
    radial-gradient(circle at 12% 0%, rgba(238, 234, 254, 0.8), transparent 28%),
    linear-gradient(180deg, #f7f6f1 0%, #fbfaf7 100%);
}

.room-rhythm-layout :deep(.room-rhythm-page) {
  width: 100%;
  min-width: 0;
}
</style>
