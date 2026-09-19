self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'RentMate 清運提醒', {
      body: data.body || '',
      tag: data.id || 'rentmate-garbage',
      data: { url: '/app/garbage' },
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/app/garbage'))
})
