// Service worker de Citelis. A propósito NO cachea nada ni ofrece modo sin
// conexión (fuera de alcance, ver T4 en odd/tasks/owner-push-notifications.md):
// solo existe para dos cosas — mostrar el aviso cuando llega un push, y llevar
// a la dueña a la bandeja de reservas si lo toca. Nada de esto es lógica de
// negocio (esa vive en supabase/functions/notify-new-booking), así que no hay
// nada que testear con vitest aquí.

self.addEventListener('install', () => {
  // No hay assets que precachear: pasar al siguiente SW sin esperar a que se
  // cierren las pestañas viejas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // El payload es JSON `{ title, body, url, tag }` (ver notifyNewBooking.ts en
  // supabase/functions/_shared). Si viene corrupto o vacío, igual se avisa:
  // un push sin datos no puede quedar en silencio.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Citelis';
  const body = payload.body || '';
  const tag = payload.tag;
  const url = payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      // Si Citelis ya está abierta en una pestaña, se reusa esa (enfocar +
      // navegar) en vez de abrir una segunda instancia de la app.
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        try {
          // `navigate` rechaza si esa ventana aún no está controlada por este
          // service worker (justo tras instalarlo). Entonces se abre una nueva:
          // mejor dos ventanas que no llegar a la bandeja.
          await existing.navigate(url);
          return;
        } catch {
          // cae a openWindow
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
