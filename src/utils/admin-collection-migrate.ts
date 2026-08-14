/**
 * 使用者、工單、押金、訂閱四份假資料互相引用（工單掛在租客與房東身上、
 * 押金與租約同一組地址），所以它們的 storage key 必須一起換版號 ——
 * 只換其中一個會讓新資料指向舊使用者，關聯全斷。
 *
 * v2：假資料加量並改成依租賃關係產生。
 */
export const ADMIN_DATASET_VERSION = 'v2'

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
