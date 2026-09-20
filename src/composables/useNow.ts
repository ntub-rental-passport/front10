import { onBeforeUnmount, ref, type Ref } from 'vue'

import { msUntilNextMinute } from '@/src/utils/clock-tick'

/**
 * 每到整分更新一次的「現在」。
 *
 * 用 setTimeout 串起來而不是 setInterval：setInterval 從載入那一刻起算，
 * 跟真正的分鐘邊界永遠差一個隨機偏移量。詳見 clock-tick.ts。
 */
export function useNow(): Ref<Date> {
  const now = ref(new Date())
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule(): void {
    timer = setTimeout(() => {
      now.value = new Date()
      schedule()
    }, msUntilNextMinute(now.value))
  }
  schedule()

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return now
}
