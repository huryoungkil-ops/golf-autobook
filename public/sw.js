// 알림용 서비스워커 — 경매알리미 · 골프예약 · 가게쇼츠 공용 (세 곳을 똑같이 맞출 것)
// 서버가 보낸 암호화된 알림(제목·내용·눌렀을 때 열 주소)을 받아 바로 띄운다. 사이트를 닫아 두어도 브라우저가 깨워 준다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const options = {
    body: d.body || '새 알림이 도착했습니다.',
    tag: d.tag || 'notice',
    renotify: true,
    data: { url: d.url || '/' },
  };
  if (d.icon) options.icon = d.icon;
  if (d.badge) options.badge = d.badge;
  event.waitUntil(self.registration.showNotification(d.title || '새 알림', options));
});

// 알림을 누르면 열려 있는 창이 있으면 그 창으로, 없으면 새 창으로 연다
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* 다른 화면이 막으면 그대로 둔다 */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
