/// <reference lib="webworker" />

// Service Worker for push notifications
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

sw.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Family Organizer', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.tag || 'default',
    data: { url: payload.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(sw.registration.showNotification(payload.title || 'Family Organizer', options));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if available
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return sw.clients.openWindow(url);
    })
  );
});

sw.addEventListener('pushsubscriptionchange', (event) => {
  // Re-subscribe when subscription expires
  event.waitUntil(
    sw.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then((newSub) => {
        // Notify server of new subscription
        return fetch('/api/v1/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSub.toJSON()),
          credentials: 'include',
        });
      })
  );
});
