import { getMessaging, getToken, deleteToken, onMessage, type Messaging } from "firebase/messaging";
import { getApps, getApp } from "firebase/app";
import { setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { doc, app } from "@/lib/firebase";
import { db } from "./firebase";

// ── VAPID Key ────────────────────────────────────────────────────────────────
// Generate this from: Firebase Console → Project Settings → Cloud Messaging
// → Web Push certificates → "Generate key pair"
// Then paste it here or use an env variable.
const VAPID_KEY = (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "").trim();

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
    // Ensure we are in a secure context
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      console.warn("[FCM] Messaging requires a secure context (HTTPS or localhost).");
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("[FCM] Notification permission denied.");
      return null;
    }

    console.log("[FCM] VAPID Key length:", VAPID_KEY.length);
    console.log("[FCM] Attempting to get token with VAPID Key starting with:", VAPID_KEY.substring(0, 10) + "...");

    // Find or register the service worker explicitly
    console.log("[FCM] Registering/Checking Service Worker...");
    const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/"
    });

    // Wait for the SW to be active. FCM requires an active SW to handle the push subscription.
    let attempts = 0;
    while (!swRegistration.active && attempts < 10) {
      console.log("[FCM] Waiting for SW to activate... attempt", attempts + 1);
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    if (!swRegistration.active) {
      throw new Error("Service Worker could not be activated.");
    }

    console.log("[FCM] SW is active, clearing any stale tokens/subscriptions...");
    try {
      // 1. Unsubscribe from browser push manager directly
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        console.log("[FCM] Found existing push subscription, unsubscribing...");
        await subscription.unsubscribe();
      }
      
      // 2. Delete Firebase token
      await deleteToken(messaging);
    } catch (e) {
      console.log("[FCM] Cleanup failed or not needed:", e);
    }

    console.log("[FCM] Requesting new token...");
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
