/**
 * 推進中的「現在時間」。
 *
 * 「已關閉多久」「預計時間過了沒」這類數字都跟現在幾點有關，只靠資料本身
 * 當 computed 依賴的話，這些數字會在畫面開著的期間凍住——管理員把頁面
 * 擺著不動，時長永遠停在打開那一刻，預計時間過了也不會轉紅。這裡用一個
 * 每隔 intervalMs 推進的 now ref 當額外依賴，讓它們自己走。
 *
 * 30 秒的預設間隔是取捨：夠即時（時長顯示不會明顯落後），又不會多到造成
 * 不必要的重新渲染。呼叫端如果對即時性要求不同可以自行覆寫。
 */

import { onUnmounted, ref, type Ref } from 'vue'

export function useTickingNow(intervalMs = 30_000): Ref<Date> {
  const now = ref(new Date())
  const timer = window.setInterval(() => {
    now.value = new Date()
  }, intervalMs)
  onUnmounted(() => window.clearInterval(timer))

  return now
}
