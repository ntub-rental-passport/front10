import { describe, expect, it } from 'vitest'
import {
  isMaintenanceActive,
  isMaintenanceBypassPath,
  parseAllowlist,
  type MaintenanceConfig,
} from './maintenance'

function config(overrides: Partial<MaintenanceConfig> = {}): MaintenanceConfig {
  return {
    maintenanceMode: true,
    maintenanceStartsAt: '',
    maintenanceEndsAt: '',
    maintenanceAllowlist: '',
    ...overrides,
  }
}

const NOW = new Date('2026-08-05T12:00:00')

describe('parseAllowlist', () => {
  it('依換行拆解並去除空白', () => {
    expect(parseAllowlist('a@x.tw\n  b@x.tw  \nc@x.tw')).toEqual(['a@x.tw', 'b@x.tw', 'c@x.tw'])
  })

  it('略過空行', () => {
    expect(parseAllowlist('a@x.tw\n\n\n  \nb@x.tw')).toEqual(['a@x.tw', 'b@x.tw'])
  })

  it('轉成小寫，避免大小寫造成白名單失效', () => {
    expect(parseAllowlist('Admin@RentMate.TW')).toEqual(['admin@rentmate.tw'])
  })

  it('空字串回傳空陣列', () => {
    expect(parseAllowlist('')).toEqual([])
  })
})

describe('isMaintenanceActive', () => {
  it('維護模式關閉時一律不生效', () => {
    expect(isMaintenanceActive(config({ maintenanceMode: false }), NOW)).toBe(false)
  })

  it('維護模式開啟且未設排程時持續生效', () => {
    expect(isMaintenanceActive(config(), NOW)).toBe(true)
  })

  describe('排程區間', () => {
    it('尚未到開始時間則不生效', () => {
      expect(
        isMaintenanceActive(config({ maintenanceStartsAt: '2026-08-05T14:00' }), NOW),
      ).toBe(false)
    })

    it('已過開始時間則生效', () => {
      expect(
        isMaintenanceActive(config({ maintenanceStartsAt: '2026-08-05T10:00' }), NOW),
      ).toBe(true)
    })

    it('已過結束時間則不生效', () => {
      expect(isMaintenanceActive(config({ maintenanceEndsAt: '2026-08-05T10:00' }), NOW)).toBe(
        false,
      )
    })

    it('在區間內生效', () => {
      expect(
        isMaintenanceActive(
          config({ maintenanceStartsAt: '2026-08-05T10:00', maintenanceEndsAt: '2026-08-05T14:00' }),
          NOW,
        ),
      ).toBe(true)
    })

    it('在區間外不生效', () => {
      expect(
        isMaintenanceActive(
          config({ maintenanceStartsAt: '2026-08-06T10:00', maintenanceEndsAt: '2026-08-06T14:00' }),
          NOW,
        ),
      ).toBe(false)
    })

    it('無法解析的時間視為未設定，不會誤擋也不會誤放', () => {
      expect(isMaintenanceActive(config({ maintenanceStartsAt: '亂寫' }), NOW)).toBe(true)
      expect(isMaintenanceActive(config({ maintenanceEndsAt: '亂寫' }), NOW)).toBe(true)
    })
  })

  describe('白名單', () => {
    it('命中白名單的使用者不受維護模式影響', () => {
      expect(
        isMaintenanceActive(config({ maintenanceAllowlist: 'admin@x.tw' }), NOW, 'admin@x.tw'),
      ).toBe(false)
    })

    it('比對時忽略大小寫與前後空白', () => {
      expect(
        isMaintenanceActive(config({ maintenanceAllowlist: 'Admin@X.TW' }), NOW, ' admin@x.tw '),
      ).toBe(false)
    })

    it('未命中白名單者仍被擋', () => {
      expect(
        isMaintenanceActive(config({ maintenanceAllowlist: 'admin@x.tw' }), NOW, 'user@x.tw'),
      ).toBe(true)
    })

    it('未登入（無 email）時白名單不適用', () => {
      expect(isMaintenanceActive(config({ maintenanceAllowlist: 'admin@x.tw' }), NOW, null)).toBe(
        true,
      )
    })
  })

  it('排程優先於白名單：不在區間內時所有人都放行', () => {
    expect(
      isMaintenanceActive(
        config({ maintenanceEndsAt: '2026-08-05T10:00', maintenanceAllowlist: 'admin@x.tw' }),
        NOW,
        'user@x.tw',
      ),
    ).toBe(false)
  })
})

describe('isMaintenanceBypassPath', () => {
  it('放行管理後台', () => {
    expect(isMaintenanceBypassPath('/admin')).toBe(true)
    expect(isMaintenanceBypassPath('/admin/settings')).toBe(true)
  })

  it('放行內部人員登入頁（少了這條就會鎖死，無法關閉維護模式）', () => {
    expect(isMaintenanceBypassPath('/staff-login')).toBe(true)
  })

  it('放行維護頁本身，避免無限轉向', () => {
    expect(isMaintenanceBypassPath('/maintenance')).toBe(true)
  })

  it('其餘路徑一律不放行', () => {
    expect(isMaintenanceBypassPath('/')).toBe(false)
    expect(isMaintenanceBypassPath('/login')).toBe(false)
    expect(isMaintenanceBypassPath('/app')).toBe(false)
    expect(isMaintenanceBypassPath('/app/contract')).toBe(false)
  })

  it('不會被前綴相同的路徑誤放行', () => {
    expect(isMaintenanceBypassPath('/administrator')).toBe(false)
    expect(isMaintenanceBypassPath('/maintenance-guide')).toBe(false)
  })
})
