/**
 * 距離下一個整分還有幾毫秒。
 *
 * 時鐘只顯示到分鐘，所以應該在「分鐘真的換了」的那一刻更新，而不是從載入
 * 時間起算每 60 秒跳一次。後者會有最多 59 秒顯示的是上一分鐘 —— 使用者盯著
 * 看會覺得時鐘壞了，而且它跟作業系統的時鐘對不起來。
 */
export function msUntilNextMinute(now: Date): number {
  const ms = now.getSeconds() * 1000 + now.getMilliseconds()
  // 剛好落在整分上時回整整一分鐘，不要回 0 ——那會變成忙迴圈
  return 60_000 - ms || 60_000
}
