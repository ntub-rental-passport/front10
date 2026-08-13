/**
 * localStorage 舊格式的處置。純邏輯，不依賴 Vue。
 *
 * 假資料沒有保存價值，所以偵測到舊格式時直接整批丟棄重 seed，
 * 不做逐欄位對映 —— 對映的維護成本遠高於它的價值。
 */

/**
 * 產生一個 migrate 函式：陣列中只要有任何一筆缺少 `marker` 欄位就視為舊格式，整批重 seed。
 *
 * `marker` 要挑改版後才存在的欄位，例如工單的 tenantUserId。
 */
export function discardLegacy<T extends object>(
  seed: () => T[],
  marker: keyof T & string,
): (raw: T[]) => T[] {
  return (raw: T[]) => {
    if (!Array.isArray(raw)) return seed()
    if (raw.length === 0) return raw
    const allCurrent = raw.every(
      (item) => item !== null && typeof item === 'object' && marker in item,
    )
    return allCurrent ? raw : seed()
  }
}
