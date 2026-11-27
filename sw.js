/**
 * ============================================================================
 * SUKA LATTE ATTENDANCE SYSTEM - SERVICE WORKER
 * File: sw.js (v20261127h)
 * 
 * Mendukung Web Notification API & PWA pada Mobile Browser (Android & iOS)
 * ============================================================================
 */

const CACHE_NAME = "suka-latte-cache-v20261127h";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => clients.claim())
  );
});

// Tangani interaksi klik notifikasi sistem di HP
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Tangani pesan dari halaman web untuk menampilkan notifikasi sistem
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const title = event.data.title || "☕ Suka Latte Attendance";
    const options = Object.assign(
      {
        icon: "assets/branding/icon-192.png",
        badge: "assets/branding/favicon-32x32.png",
        tag: "suka-latte-duty",
        vibrate: [250, 100, 250, 100, 400],
      },
      event.data.options || {}
    );

    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Tangani push event dari server jika tersedia
self.addEventListener("push", (event) => {
  let data = {
    title: "☕ Suka Latte Attendance",
    body: "Pemberitahuan absensi kehadiran.",
    icon: "assets/branding/icon-192.png",
    badge: "assets/branding/favicon-32x32.png",
    tag: "suka-latte-duty",
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      vibrate: [250, 100, 250, 100, 400],
      data: { url: "/" },
    })
  );
});
