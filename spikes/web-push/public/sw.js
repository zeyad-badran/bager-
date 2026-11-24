/**
 * Service worker for the Web Push test page: shows the notification, reports receipt to the local sender, and
 * opens the page when the notification is tapped.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-08 · spike scope items 1 and 3 · blueprint §10.3 (service worker lifecycle, click handling)
 * Protects: a duplicate push with the same tag replaces the earlier notification instead of adding one.
 *           "Received" only means this code ran; it does not prove the person saw anything (CLAUDE.md).
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function report(path, eventId) {
  if (!eventId) return Promise.resolve();
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId }),
  }).catch(() => undefined);
}

function readPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return { title: "Test notification", body: event.data ? event.data.text() : "" };
  }
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const options = {
    body: data.body ?? "",
    tag: data.tag,
    icon: "/icon.svg",
    data: { eventId: data.eventId, url: `/?opened=${encodeURIComponent(data.ticket ?? "")}` },
  };
  if (Array.isArray(data.vibrate)) options.vibrate = data.vibrate;
  if (data.requireInteraction === true) options.requireInteraction = true;

  event.waitUntil(
    (async () => {
      // iOS and Chrome require a visible notification for every push (userVisibleOnly), so show it first.
      await self.registration.showNotification(data.title ?? "Test notification", options);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "push-received", ticket: data.ticket, kind: data.kind });
      await report("/api/received", data.eventId);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { eventId, url } = event.notification.data ?? {};
  event.waitUntil(
    (async () => {
      await report("/api/clicked", eventId);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url ?? "/").catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url ?? "/");
    })(),
  );
});
