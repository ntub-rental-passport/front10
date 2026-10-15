import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {}
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const clients = {
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue(undefined),
  }
  runInNewContext(readFileSync(new URL('../../public/rentmate-sw.js', import.meta.url), 'utf8'), {
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler
      },
      registration: { showNotification },
      clients,
      location: { origin: 'https://rentmate.example' },
    },
    clients,
    URL,
  })
  return { handlers, showNotification, clients }
}

it('推播使用 payload 的標題、內容、tag 與網址', async () => {
  const sw = worker()
  let pending!: Promise<unknown>
  sw.handlers.push!({
    data: {
      json: () => ({ title: '租金提醒', body: '本月租金已出帳', url: '/app/bills', tag: 'bill-1' }),
    },
    waitUntil: (work: Promise<unknown>) => {
      pending = work
    },
  })
  await pending
  expect(sw.showNotification).toHaveBeenCalledWith('租金提醒', {
    body: '本月租金已出帳',
    tag: 'bill-1',
    data: { url: '/app/bills' },
  })
})

it('沒有網址時退回 /app，格式錯誤的 payload 不顯示通知', () => {
  const sw = worker()
  sw.handlers.push!({ data: { json: () => ({}) }, waitUntil: vi.fn() })
  expect(sw.showNotification.mock.calls[0]?.[1].data.url).toBe('/app')
  sw.handlers.push!({
    data: {
      json: () => {
        throw new Error('格式錯誤')
      },
    },
    waitUntil: vi.fn(),
  })
  sw.handlers.push!({ data: { json: () => null }, waitUntil: vi.fn() })
  expect(sw.showNotification).toHaveBeenCalledOnce()
})

it('點擊通知優先聚焦並導向已開啟的同源分頁', async () => {
  const sw = worker()
  const tab = {
    url: 'https://rentmate.example/landlord',
    focus: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn().mockResolvedValue(undefined),
  }
  const other = { url: 'https://other.example', focus: vi.fn() }
  sw.clients.matchAll.mockResolvedValue([other, tab])
  let pending!: Promise<unknown>
  const close = vi.fn()
  sw.handlers.notificationclick!({
    notification: { close, data: { url: '/app/bills' } },
    waitUntil: (work: Promise<unknown>) => {
      pending = work
    },
  })
  await pending
  expect(close).toHaveBeenCalledOnce()
  expect(tab.focus).toHaveBeenCalledOnce()
  expect(tab.navigate).toHaveBeenCalledWith('https://rentmate.example/app/bills')
  expect(other.focus).not.toHaveBeenCalled()
  expect(sw.clients.openWindow).not.toHaveBeenCalled()
})

it('沒有同源分頁時才開新分頁，缺少網址則開啟 /app', async () => {
  const sw = worker()
  let pending!: Promise<unknown>
  sw.handlers.notificationclick!({
    notification: { close: vi.fn() },
    waitUntil: (work: Promise<unknown>) => {
      pending = work
    },
  })
  await pending
  expect(sw.clients.openWindow).toHaveBeenCalledWith('https://rentmate.example/app')
})

it('導航未受控分頁失敗時仍開啟目標網址', async () => {
  const sw = worker()
  const tab = {
    url: 'https://rentmate.example/landlord',
    focus: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn().mockRejectedValue(new TypeError('Client is not controlled')),
  }
  sw.clients.matchAll.mockResolvedValue([tab])
  let pending!: Promise<unknown>
  sw.handlers.notificationclick!({
    notification: { close: vi.fn(), data: { url: '/app/bills' } },
    waitUntil: (work: Promise<unknown>) => {
      pending = work
    },
  })
  await expect(pending).resolves.toBeUndefined()
  expect(tab.focus).toHaveBeenCalledOnce()
  expect(tab.navigate).toHaveBeenCalledWith('https://rentmate.example/app/bills')
  expect(sw.clients.openWindow).toHaveBeenCalledExactlyOnceWith(
    'https://rentmate.example/app/bills',
  )
})

it('優先聚焦已在目標網址的分頁，不導航或重載該頁', async () => {
  const sw = worker()
  const other = {
    url: 'https://rentmate.example/landlord',
    focus: vi.fn(),
    navigate: vi.fn(),
  }
  const target = {
    url: 'https://rentmate.example/app/bills',
    focus: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(),
  }
  sw.clients.matchAll.mockResolvedValue([other, target])
  let pending!: Promise<unknown>
  sw.handlers.notificationclick!({
    notification: { close: vi.fn(), data: { url: '/app/bills' } },
    waitUntil: (work: Promise<unknown>) => {
      pending = work
    },
  })
  await pending
  expect(target.focus).toHaveBeenCalledOnce()
  expect(target.navigate).not.toHaveBeenCalled()
  expect(other.focus).not.toHaveBeenCalled()
  expect(other.navigate).not.toHaveBeenCalled()
  expect(sw.clients.openWindow).not.toHaveBeenCalled()
})
