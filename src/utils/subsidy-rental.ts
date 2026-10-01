/**
 * 把使用者存檔的終版租約轉成租補申請要用的資料。
 *
 * 定位：我們只「幫忙備齊資料」，送件與查進度都由使用者自己在官網完成。
 * 這裡的每個函式都是純計算 —— 不存任何結果，每次打開頁面都從存檔租約
 * 重新算一次（2026-10-01 決定）。
 */
import { isValidTaiwanNationalId } from '@/shared/contract-field-validation.js'
import type { RentalPayload } from '@/src/utils/contract-rental-payload'
import { incomeLimits } from '@/src/utils/subsidy-guide'

export type StoredRental = Partial<RentalPayload>

/** 地址開頭的縣市，對到所得上限表的鍵。「台」統一成「臺」；對不到回空字串，不猜。 */
export function cityFromAddress(address: string | null | undefined): string {
  const normalized = String(address ?? '').trim().replace(/^台/, '臺')
  return Object.keys(incomeLimits).find((city) => normalized.startsWith(city)) ?? ''
}

function parseIso(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

export function toRocDate(value: string | null | undefined): string {
  const date = parseIso(value)
  if (!date) return ''
  return `民國 ${date.getFullYear() - 1911} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export interface LeaseCoverage {
  /** 申請年度（民國）。 */
  rocYear: number
  /** 租期落在申請年度內的月數（跨月不足一月以一個月計）。 */
  monthsInYear: number
  /** 今天是否在租期內。 */
  activeToday: boolean
  ended: boolean
  notStarted: boolean
}

/**
 * 租期與申請年度重疊了幾個月。
 *
 * 只陳述事實，不下「符不符合」的結論：租補按月核計，租期只涵蓋申請年度的
 * 部分月份時，使用者需要知道能申請的月份有限，但是否受理仍由承辦認定。
 */
export function leaseCoverage(
  start: string | null | undefined,
  end: string | null | undefined,
  today: Date = new Date(),
): LeaseCoverage | null {
  const startDate = parseIso(start)
  const endDate = parseIso(end)
  if (!startDate || !endDate || endDate < startDate) return null

  const year = today.getFullYear()
  const from = startDate > new Date(year, 0, 1) ? startDate : new Date(year, 0, 1)
  const to = endDate < new Date(year, 11, 31) ? endDate : new Date(year, 11, 31)
  const monthsInYear =
    to < from ? 0 : (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1

  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return {
    rocYear: year - 1911,
    monthsInYear,
    activeToday: startDate <= day && day <= endDate,
    ended: endDate < day,
    notStarted: startDate > day,
  }
}

/** 畫面預設遮罩：A12****789。這一頁可能在公共場所打開。 */
export function maskNationalId(value: string): string {
  const normalized = value.trim().toUpperCase()
  return normalized.length >= 7 ? `${normalized.slice(0, 3)}****${normalized.slice(-3)}` : '＊＊＊'
}

/** 契約寫「00649-000建號」「中正段一小段132地號」；官網欄位本身就叫建號／地號，貼上時不要重複。 */
function stripSuffix(value: string | null | undefined, suffix: string): string {
  const trimmed = String(value ?? '').trim()
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length).trimEnd() : trimmed
}

export interface ApplicationField {
  key: string
  label: string
  value: string
  /** 預設遮罩顯示的欄位。 */
  sensitive?: boolean
  /** 值有問題時提醒使用者先回契約校對修正。 */
  warning?: string
  /** 官網表單上的提示。 */
  hint?: string
}

/**
 * 官網申請要填、而存檔租約裡已經有的欄位，依官網填表的順序排列。
 *
 * 沒有值就不列出來；要使用者自己準備的東西（戶籍地址、帳戶、家庭成員）
 * 不在這裡 —— 那些不在租約上，由使用者在官網直接填。
 */
export function buildApplicationFields(rental: StoredRental | null): ApplicationField[] {
  if (!rental) return []
  const fields: ApplicationField[] = []
  const push = (field: ApplicationField) => {
    if (field.value) fields.push(field)
  }

  push({ key: 'tenant_name', label: '承租人姓名', value: rental.tenant_name?.trim() ?? '' })

  const nationalId = (rental.tenant_national_id ?? '').trim().toUpperCase()
  if (nationalId) {
    fields.push({
      key: 'tenant_national_id',
      label: '承租人身分證字號',
      value: nationalId,
      sensitive: true,
      // 契約是 OCR 辨識後校對的，仍可能把 8 讀成 B。檢查碼不過就先擋下來，
      // 不要讓使用者貼到官網才發現。
      warning: isValidTaiwanNationalId(nationalId)
        ? undefined
        : '檢查碼不正確，可能是辨識錯誤。請核對身分證後，回到契約校對修正。',
    })
  }

  push({ key: 'address', label: '租賃住宅地址', value: rental.address?.trim() ?? '',
         hint: '須與租約及房屋稅籍的門牌、樓層一致。' })
  push({ key: 'rent_amount', label: '每月租金（元）',
         value: rental.rent_amount ? String(rental.rent_amount) : '',
         hint: '填契約約定的月租金；不含管理費等其他費用，除非契約寫明包含。' })
  push({ key: 'start_date', label: '租賃期間：起', value: toRocDate(rental.start_date) })
  push({ key: 'end_date', label: '租賃期間：迄', value: toRocDate(rental.end_date) })
  push({ key: 'landlord_name', label: '出租人姓名', value: rental.landlord_name?.trim() ?? '' })
  push({ key: 'building_number', label: '建號', value: stripSuffix(rental.building_number, '建號'),
         hint: '可據以向地政機關查詢建物登記，確認房屋條件。' })
  push({ key: 'land_number', label: '地號', value: stripSuffix(rental.land_number, '地號') })

  return fields
}
