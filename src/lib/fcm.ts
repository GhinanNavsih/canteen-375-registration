import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { getApps, getApp } from "firebase/app";
import { doc, setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";

// ── VAPID Key ────────────────────────────────────────────────────────────────
// Generate this from: Firebase Console → Project Settings → Cloud Messaging
// → Web Push certificates → "Generate key pair"
// Then paste it here or use an env variable.
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

let messagingInstance: Messaging | null = null;

/**
 * Get (or lazily create) the Firebase Messaging instance.
 * Returns null when called on the server or if messaging is unavailable.
 */
export function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;
  if (messagingInstance) return messagingInstance;

  try {
    const app = getApps().length > 0 ? getApp() : null;
    if (!app) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (e) {
    console.warn("[FCM] Could not initialize messaging:", e);
    return null;
  }
}

/**
 * Request notification permission and retrieve the FCM token.
 * Saves the token into the member's Firestore document under `fcmTokens[]`.
 *
 * @param memberId — The Firestore Members document ID for the current user.
 * @returns The FCM token string, or null if permission was denied / unavailable.
 */
export async function requestNotificationPermission(
  memberId: string
): Promise<string | null> {
  const messaging = getMessagingInstance();
  if (!messaging) {
    console.warn("[FCM] Messaging not available in this environment.");
    return null;
  }

  if (!VAPID_KEY) {
    console.warn("[FCM] No VAPID key configured. Skipping token request.");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("[FCM] Notification permission denied.");
      return null;
    }

    // Find the specific registration for the Firebase messaging worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    const swRegistration = registrations.find(reg => 
      reg.active?.scriptURL.includes("firebase-messaging-sw.js")
    );

    if (!swRegistration) {
      console.warn("[FCM] Firebase service worker not found or not active yet.");
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      console.log("[FCM] Token obtained:", token.slice(0, 20) + "…");
      // Persist to Firestore — use arrayUnion so multiple devices are supported
      await setDoc(
        doc(db, "Members", memberId),
        { fcmTokens: arrayUnion(token) },
        { merge: true }
      );
    }

    return token;
  } catch (err) {
    console.error("[FCM] Error getting token:", err);
    return null;
  }
}

/**
 * Remove a stored FCM token (e.g. on logout).
 */
export async function removeFcmToken(
  memberId: string,
  token: string
): Promise<void> {
  try {
    await setDoc(
      doc(db, "Members", memberId),
      { fcmTokens: arrayRemove(token) },
      { merge: true }
    );
  } catch (err) {
    console.error("[FCM] Error removing token:", err);
  }
}

/**
 * Listen for foreground messages and show an in-app notification.
 * Returns an unsubscribe function.
 */
export function listenForForegroundMessages(
  onMessageReceived: (payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }) => void
): (() => void) | null {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log("[FCM] Foreground message received:", payload);
    onMessageReceived({
      title: payload.notification?.title || "Canteen 375",
      body: payload.notification?.body || "",
      data: payload.data as Record<string, string> | undefined,
    });
  });

  return unsubscribe;
}
