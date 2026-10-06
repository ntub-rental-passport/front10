import { describe, expect, it } from 'vitest'

import { adminDepositToRecord, depositGap, depositMatchOf } from './admin-deposit'
import type { AdminDepositRecord } from '@/src/services/adminUserRecordsApi'

describe('adminDepositToRecord', () => {
  const record: AdminDepositRecord = {
    id: 'lease-1', address: '臺北市測試路', startDate: '2026-01-01', endDate: '2026-12-31',
    monthlyRent: 10000, landlordDeclared: 20000, tenantDeclared: 15000, landlordId: 3, tenantId: 7,
  }

  it('帳號 id 轉成 real 前綴，租約 id 與聲明金額保留', () => {
    expect(adminDepositToRecord(record)).toEqual({
      id: 'lease-1', address: record.address, monthlyRent: 10000,
      landlordDeclared: 20000, tenantDeclared: 15000, landlordUserId: 'real-3', tenantUserId: 'real-7',
    })
  })

  it('配不到租客帳號仍保留房東聲明，以 null 表達關聯不存在', () => {
    const converted = adminDepositToRecord({ ...record, tenantId: null, tenantDeclared: null })
    expect(converted.tenantUserId).toBeNull()
    expect(converted.landlordUserId).toBe('real-3')
    expect(converted.landlordDeclared).toBe(20000)
    expect(depositMatchOf(converted.landlordDeclared, converted.tenantDeclared)).toBe('pending')
  })
})

describe('depositMatchOf', () => {
  it('兩造聲明相同視為相符', () => {
    expect(depositMatchOf(30000, 30000)).toBe('matched')
  })

  it('兩造聲明不同視為不符', () => {
    expect(depositMatchOf(30000, 20000)).toBe('mismatched')
    expect(depositMatchOf(20000, 30000)).toBe('mismatched')
  })

  it('租客尚未聲明是待補，不是不符', () => {
    expect(depositMatchOf(28000, null)).toBe('pending')
  })

  it('雙方都是 0 也算相符', () => {
    expect(depositMatchOf(0, 0)).toBe('matched')
  })
})

describe('depositGap', () => {
  it('相符時差額為 0', () => {
    expect(depositGap(24000, 24000)).toBe(0)
  })

  it('差額取絕對值，不分誰報得多', () => {
    expect(depositGap(30000, 20000)).toBe(10000)
    expect(depositGap(20000, 30000)).toBe(10000)
  })

  it('租客未聲明時差額為 0，避免把未填當成短少', () => {
    expect(depositGap(28000, null)).toBe(0)
  })
})
