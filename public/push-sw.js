// 서비스 워커에 붙는 푸시 알림 처리 (vite.config.js 의 importScripts 로 들어감)
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || '학급정리기', {
    body: data.body || '',
    tag: data.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' }
  }))
})

// 알림을 누르면 열려 있는 앱 창으로 가고, 없으면 새로 염
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus()
        return w.navigate(url)
      }
    }
    return self.clients.openWindow(url)
  })())
})
