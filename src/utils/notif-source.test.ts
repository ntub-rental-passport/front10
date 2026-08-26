import { describe, expect, it } from 'vitest'
import { migrateNotifSourceLabel } from './notif-source'

interface LegacyItem {
  id?: string
  sourceLabel?: string
}

describe('migrateNotifSourceLabel', () => {
  it('缺少 sourceLabel 的舊資料補上空字串', () => {
    const legacy: LegacyItem[] = [{ id: 'nm-1' }]
    const migrated = migrateNotifSourceLabel(legacy)
    expect(migrated[0].sourceLabel).toBe('')
  })

  it('已經有 sourceLabel 就不覆蓋', () => {
    const current: LegacyItem[] = [{ id: 'nm-1', sourceLabel: '帳單待繳提醒' }]
    const migrated = migrateNotifSourceLabel(current)
    expect(migrated[0].sourceLabel).toBe('帳單待繳提醒')
  })

  it('空字串也算「已經有」，不會被誤判成缺欄位而重寫', () => {
    const current: LegacyItem[] = [{ id: 'nm-1', sourceLabel: '' }]
    const migrated = migrateNotifSourceLabel(current)
    expect(migrated[0].sourceLabel).toBe('')
  })

  it('不會動到陣列裡其他欄位', () => {
    const legacy: LegacyItem[] = [{ id: 'nm-x' }]
    const migrated = migrateNotifSourceLabel(legacy)
    expect(migrated[0].id).toBe('nm-x')
  })
})
