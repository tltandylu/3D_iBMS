// Web Push event handlers — imported by the Workbox service worker

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}

  const title   = data.title  ?? '智慧設施告警'
  const body    = data.body   ?? '有新告警，請立即查看'
  const alertId = data.alert_id ?? ''
  const url     = data.url    ?? '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/pwa-icon.svg',
      badge: '/pwa-icon.svg',
      tag:   alertId || 'ibms-alert',
      renotify: true,
      data: { url },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow(targetUrl)
    })
  )
})
