export function formatIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addMonths(base: Date, months: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + months, 1)
}

export function endOfMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0)
}

export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString('zh-TW')}`
}

/** Pass short=true to get M/D only (e.g. "9/10"); default returns YYYY/M/D */
export function formatDate(value: string, short = false): string {
  const date = parseIso(value)
  if (short) return `${date.getMonth() + 1}/${date.getDate()}`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export function daysUntil(value: string): number {
  const target = parseIso(value)
  const diff = target.getTime() - startOfToday().getTime()
  return Math.round(diff / 86400000)
}

export function describeDaysLeft(days: number): string {
  if (days === 0) return '今天到期'
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  return `${days} 天後到期`
}

export function formatOptionalAmount(value: number | null, placeholder = '待匯入'): string {
  return value == null ? placeholder : formatCurrency(value)
}
