// Firebase Messaging Service Worker
// This file MUST live at the root of the public directory and be named exactly
// "firebase-messaging-sw.js" so that the Firebase SDK can find it.

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCZ1oJuagSPQ_9VWiFONeArwxtUsgLGhCA",
  authDomain: "point-of-sales-app-25e2b.firebaseapp.com",
  projectId: "point-of-sales-app-25e2b",
  storageBucket: "point-of-sales-app-25e2b.appspot.com",
  messagingSenderId: "932379156472",
  appId: "1:932379156472:web:c8182745e1a48555c00d",
});

const messaging = firebase.messaging();

// Handle background messages (when the app is not in the foreground)
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background message received:", payload);

  const notificationTitle = payload.notification?.title || "Canteen 375";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.data?.tag || "canteen375-notification",
    data: payload.data || {},
    // Vibrate pattern: vibrate 200ms, pause 100ms, vibrate 200ms
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — open the dashboard
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes("/dashboard") && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        return clients.openWindow("/dashboard");
      })
  );
});
