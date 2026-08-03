/**
 * 本地時區的 YYYY-MM-DD。
 * 不可用 toISOString()：那是 UTC，在 UTC+8 會把當地凌晨的日期算成前一天。
 */
export function dateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
