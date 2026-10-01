import { describe, expect, it } from 'vitest'
import { notificationBadge, notificationTime, notificationTarget } from './notification-bell'

describe('通知鈴鐺顯示', () => {
  it('沒有未讀就不顯示徽章，超過 99 才封頂', () => {
    expect(notificationBadge(0)).toBe('')
    expect(notificationBadge(1)).toBe('1')
    expect(notificationBadge(99)).toBe('99')
    expect(notificationBadge(100)).toBe('99+')
  })

  it('通知時間使用分鐘、小時與天，未來和錯誤時間不產生負數', () => {
    const now = new Date('2026-10-01T12:00:00+08:00').getTime()
    expect(notificationTime('2026-10-01T11:59:59+08:00', now)).toBe('剛剛')
    expect(notificationTime('2026-10-01T11:57:00+08:00', now)).toBe('3 分鐘前')
    expect(notificationTime('2026-10-01T09:00:00+08:00', now)).toBe('3 小時前')
    expect(notificationTime('2026-09-29T12:00:00+08:00', now)).toBe('2 天前')
    expect(notificationTime('2026-10-02T12:00:00+08:00', now)).toBe('剛剛')
    expect(notificationTime('invalid', now)).toBe('時間未知')
  })

  it('站內走路由，外部只開啟 HTTP(S)，阻擋腳本及協定相對網址', () => {
    expect(notificationTarget('/landlord/maintenance?id=1')).toEqual({
      kind: 'internal',
      url: '/landlord/maintenance?id=1',
    })
    expect(notificationTarget('https://example.com/help')).toEqual({
      kind: 'external',
      url: 'https://example.com/help',
    })
    for (const value of [
      '',
      'javascript:alert(1)',
      'data:text/html,hello',
      '//evil.example',
      '/\\evil.example',
      '/\nevil.example',
    ]) {
      expect(notificationTarget(value)).toBeNull()
    }
  })
})
