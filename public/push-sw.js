// Web Push handlers, loaded into the generated service worker via workbox importScripts.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'פוקר טראקר'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'he',
      tag: data.tag || 'table-opened',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  )
})

// Opens the page the notification points to (e.g. the online table), also when the app is already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  const target = new URL(url, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (!('focus' in client)) continue
        try {
          if (client.url !== target && 'navigate' in client) await client.navigate(target)
        } catch {
          // navigate() can fail for an uncontrolled client; focusing is still better than nothing
        }
        return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
