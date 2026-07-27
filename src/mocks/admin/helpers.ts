export function daysAgo(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export function daysAhead(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}
