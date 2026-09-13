import { describe, expect, it } from 'vitest'
import { createDeidentifier, createReportId } from './contract-report'

describe('contract report privacy', () => {
  it('replaces known contract fields consistently', () => {
    const deidentify = createDeidentifier({
      landlord: '王房東',
      tenant: '林小明',
      address: '臺北市中正區忠孝東路一段 1 號 5 樓',
    })

    const result = deidentify('出租人王房東與林小明約定，林小明承租臺北市中正區忠孝東路一段 1 號 5 樓。')
    expect(result).toBe('出租人<PERSON_1>與<PERSON_2>約定，<PERSON_2>承租<ADDRESS_1>。')
  })

  it('masks common Taiwan identifiers without storing them in output', () => {
    const deidentify = createDeidentifier()
    const result = deidentify('身分證 A123456789，手機 0912-345-678，信箱 renter@example.com。')
    expect(result).toContain('<TW_ID_1>')
    expect(result).toContain('<PHONE_1>')
    expect(result).toContain('<EMAIL_1>')
    expect(result).not.toContain('A123456789')
    expect(result).not.toContain('0912-345-678')
    expect(result).not.toContain('renter@example.com')
  })

  it('creates a non-identifying report number', () => {
    const randomSource = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array instanceof Uint8Array) array.set([0, 1, 2, 3, 4])
        return array
      },
    } as Crypto
    expect(createReportId(new Date('2026-09-01T03:00:00Z'), randomSource)).toBe(
      'RM-20260901-ABCDE',
    )
  })
})
