import { describe, expect, it } from 'vitest'
import { computeDeliveryStatus, migrateUserNotifications } from './notif-delivery'
import type { NotifChannel, NotifDeliveryStatus } from '@/src/mocks/admin/notifications'

interface LegacyItem {
  id?: string
  channels: NotifChannel[]
  deliveryStatus?: Partial<Record<NotifChannel, NotifDeliveryStatus>>
}

describe('computeDeliveryStatus', () => {
  it('inapp 一律是 sent', () => {
    expect(computeDeliveryStatus(['inapp'])).toEqual({ inapp: 'sent' })
  })

  it('email 與 push 一律是 pending（後端還沒接）', () => {
    expect(computeDeliveryStatus(['email', 'push'])).toEqual({ email: 'pending', push: 'pending' })
  })

  it('只為實際啟用的管道產生條目', () => {
    const result = computeDeliveryStatus(['inapp', 'email'])
    expect(Object.keys(result)).toEqual(['inapp', 'email'])
    expect(result.push).toBeUndefined()
  })

  it('三個管道都開時各自對應正確狀態', () => {
    expect(computeDeliveryStatus(['inapp', 'email', 'push'])).toEqual({
      inapp: 'sent',
      email: 'pending',
      push: 'pending',
    })
  })
})

describe('migrateUserNotifications', () => {
  it('缺少 deliveryStatus 的舊資料依 channels 補回狀態', () => {
    const legacy: LegacyItem[] = [{ channels: ['inapp', 'email'] }]
    const migrated = migrateUserNotifications(legacy)
    expect(migrated[0].deliveryStatus).toEqual({ inapp: 'sent', email: 'pending' })
  })

  it('已經有 deliveryStatus 的資料維持原值，不被覆蓋', () => {
    const current: LegacyItem[] = [
      { channels: ['inapp', 'email'], deliveryStatus: { inapp: 'sent', email: 'failed' } },
    ]
    const migrated = migrateUserNotifications(current)
    expect(migrated[0].deliveryStatus).toEqual({ inapp: 'sent', email: 'failed' })
  })

  it('不會動到陣列裡其他欄位', () => {
    const legacy: LegacyItem[] = [{ id: 'nm-x', channels: ['inapp'] }]
    const migrated = migrateUserNotifications(legacy)
    expect(migrated[0].id).toBe('nm-x')
  })
})
