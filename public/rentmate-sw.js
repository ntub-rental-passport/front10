// 這支是全站唯一的 service worker，scope 是 /；再註冊第二支會把它頂掉。
self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data.json()
  } catch {
    return
  }
  if (!data || typeof data !== 'object') return
  event.waitUntil(
    self.registration.showNotification(data.title || 'RentMate 通知', {
      body: data.body || '',
      tag: data.tag || 'rentmate',
      data: { url: data.url || '/app' },
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const url = new URL(event.notification.data?.url || '/app', self.location.origin)
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const tab =
        tabs.find((client) => client.url === url.href) ||
        tabs.find((client) => new URL(client.url).origin === self.location.origin)
      if (tab) {
        await tab.focus()
        if (tab.url === url.href) return
        try {
          await tab.navigate(url.href)
          return
        } catch {
          // 未受此 sw 控制的分頁無法導航，改由下方開啟新分頁。
        }
      }
      await self.clients.openWindow(url.href)
    })(),
  )
})
