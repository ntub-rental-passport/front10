export function notificationBadge(count: number): string {
  return count <= 0 ? '' : count > 99 ? '99+' : String(count)
}

export function notificationTime(iso: string, now = Date.now()): string {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return '時間未知'
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`
  return `${Math.floor(minutes / 1440)} 天前`
}

/** 通知內容由後台填寫，但連結仍須排除可執行腳本與協定相對網址。 */
export function notificationTarget(
  value?: string,
): { kind: 'internal' | 'external'; url: string } | null {
  if (
    !value ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '\\',
    )
  )
    return null
  const url = value.trim()
  if (url.startsWith('/') && !url.startsWith('//')) return { kind: 'internal', url }
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      return { kind: 'external', url }
  } catch {
    // 不完整網址不交給路由器猜測，避免導到不存在的房東頁面。
  }
  return null
}
