import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PUBLIC_SETTINGS, type PublicSettings } from '@/src/services/platformSettingsApi'

function settings(overrides: Partial<PublicSettings> = {}): PublicSettings {
  return { ...DEFAULT_PUBLIC_SETTINGS, ...overrides }
}

function maintenance(overrides: Partial<PublicSettings['maintenance']> = {}): PublicSettings['maintenance'] {
  return { mode: true, message: '維護中', startsAt: '', endsAt: '', ...overrides }
}

describe('isMaintenanceBlocking', () => {
  it('關著就不擋', async () => {
    const { isMaintenanceBlocking } = await import('./usePublicSettings')
    expect(isMaintenanceBlocking(settings())).toBe(false)
  })

  it('開著、沒排時間就擋', async () => {
    const { isMaintenanceBlocking } = await import('./usePublicSettings')
    expect(isMaintenanceBlocking(settings({ maintenance: maintenance() }))).toBe(true)
  })

  it('白名單上的人（後端判斷）不擋', async () => {
    const { isMaintenanceBlocking } = await import('./usePublicSettings')
    expect(isMaintenanceBlocking(settings({ maintenance: maintenance(), maintenanceBypass: true }))).toBe(false)
  })

  it('排程還沒開始、或已經結束都不擋', async () => {
    const { isMaintenanceBlocking } = await import('./usePublicSettings')
    const now = new Date('2026-10-01T12:00:00')
    expect(isMaintenanceBlocking(settings({ maintenance: maintenance({ startsAt: '2026-10-01T13:00' }) }), now)).toBe(false)
    expect(isMaintenanceBlocking(settings({ maintenance: maintenance({ endsAt: '2026-10-01T11:00' }) }), now)).toBe(false)
    expect(
      isMaintenanceBlocking(settings({ maintenance: maintenance({ startsAt: '2026-10-01T11:00', endsAt: '2026-10-01T13:00' }) }), now),
    ).toBe(true)
  })
})

describe('refreshPublicSettings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function serve(body: PublicSettings | null) {
    const fetchMock = vi.fn(async () =>
      body ? new Response(JSON.stringify(body), { status: 200 }) : new Response(null, { status: 502 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('一分鐘內換頁只讀一次後端', async () => {
    const fetchMock = serve(settings({ siteName: '租隊友' }))
    const { publicSettings, refreshPublicSettings } = await import('./usePublicSettings')

    await refreshPublicSettings()
    await refreshPublicSettings()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(publicSettings.value.siteName).toBe('租隊友')

    vi.setSystemTime(new Date('2026-10-01T12:01:01'))
    await refreshPublicSettings()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('管理員改完設定時可以強制重讀', async () => {
    const fetchMock = serve(settings())
    const { refreshPublicSettings } = await import('./usePublicSettings')

    await refreshPublicSettings()
    await refreshPublicSettings({ force: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('讀不到後端時沿用上一次的值，而且一分鐘內不再重試', async () => {
    serve(settings({ maintenance: maintenance() }))
    const { publicSettings, refreshPublicSettings } = await import('./usePublicSettings')
    await refreshPublicSettings()

    vi.setSystemTime(new Date('2026-10-01T12:01:01'))
    const failing = serve(null)
    await refreshPublicSettings()
    expect(publicSettings.value.maintenance.mode).toBe(true)

    await refreshPublicSettings()
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('一開始就讀不到時，當作沒有維護、沒有停用', async () => {
    serve(null)
    const { publicSettings, refreshPublicSettings } = await import('./usePublicSettings')
    await refreshPublicSettings()
    expect(publicSettings.value.maintenance.mode).toBe(false)
    expect(publicSettings.value.featureOutages).toEqual([])
  })

  it.each([true, false])('首次讀完前尚未載入，完成後即使失敗也算已載入（成功：%s）', async (success) => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done })))
    const { hasLoadedPublicSettings, refreshPublicSettings } = await import('./usePublicSettings')
    expect(hasLoadedPublicSettings()).toBe(false)
    const load = refreshPublicSettings()
    expect(hasLoadedPublicSettings()).toBe(false)
    expect(refreshPublicSettings()).toBe(load)
    resolve(success ? new Response(JSON.stringify(settings()), { status: 200 }) : new Response(null, { status: 502 }))
    await load
    expect(hasLoadedPublicSettings()).toBe(true)
  })

  it('背景重讀只在首次讀完且快取過期時發出，失敗後仍等一分鐘', async () => {
    const fetchMock = serve(null)
    const { refreshPublicSettings, refreshPublicSettingsInBackground } = await import('./usePublicSettings')
    expect(refreshPublicSettingsInBackground()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    await refreshPublicSettings()
    expect(refreshPublicSettingsInBackground()).toBeNull()
    vi.advanceTimersByTime(59_999)
    expect(refreshPublicSettingsInBackground()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    const refresh = refreshPublicSettingsInBackground()
    expect(refresh).not.toBeNull()
    await refresh
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshPublicSettingsInBackground()).toBeNull()
  })

  it('背景重讀與其他讀取共用進行中的請求，只有發起者收到背景 promise', async () => {
    serve(settings())
    const { refreshPublicSettings, refreshPublicSettingsInBackground } = await import('./usePublicSettings')
    await refreshPublicSettings()
    vi.advanceTimersByTime(60_000)

    let resolve!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetchMock)
    const refresh = refreshPublicSettingsInBackground()
    expect(refresh).not.toBeNull()
    expect(refreshPublicSettingsInBackground()).toBeNull()
    expect(refreshPublicSettings()).toBe(refresh)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolve(new Response(JSON.stringify(settings()), { status: 200 }))
    await refresh

    const forced = refreshPublicSettings({ force: true })
    expect(refreshPublicSettingsInBackground()).toBeNull()
    expect(refreshPublicSettings()).toBe(forced)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolve(new Response(JSON.stringify(settings()), { status: 200 }))
    await forced
  })
})
