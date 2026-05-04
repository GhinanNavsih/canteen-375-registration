"use client";

import { useEffect, useState, useCallback } from "react";
import { useMember } from "@/context/MemberContext";
import {
  requestNotificationPermission,
  listenForForegroundMessages,
} from "@/lib/fcm";

export default function ServiceWorkerRegistrar() {
  const { member } = useMember();
  const [toast, setToast] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // Register both service workers
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Register the main caching SW
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      // Register the FCM messaging SW (required by Firebase)
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js")
        .catch(() => {});
    }
  }, []);

  // Request notification permission once the member is loaded
  useEffect(() => {
    if (!member?.id) return;

    // Small delay to avoid blocking initial page render
    const timer = setTimeout(() => {
      requestNotificationPermission(member.id).then((token) => {
        if (token) {
          console.log("[SW] Push notifications enabled for", member.fullName);
        }
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [member?.id]);

  // Listen for foreground messages → show in-app toast
  useEffect(() => {
    const unsub = listenForForegroundMessages((payload) => {
      setToast({ title: payload.title, body: payload.body });
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <>
      <div
        className="notification-toast"
        onClick={() => setToast(null)}
        role="alert"
      >
        <div className="toast-icon">🔔</div>
        <div className="toast-content">
          <strong className="toast-title">{toast.title}</strong>
          <p className="toast-body">{toast.body}</p>
        </div>
        <button className="toast-close" onClick={() => setToast(null)}>
          ×
        </button>
      </div>

      <style jsx>{`
        .notification-toast {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          background: linear-gradient(135deg, #ffffff 0%, #faf7f2 100%);
          border: 2px solid #c51720;
          border-radius: 16px;
          padding: 1rem 1.25rem;
          max-width: 420px;
          width: calc(100% - 32px);
          box-shadow: 0 12px 40px rgba(197, 23, 32, 0.25),
            0 4px 12px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          animation: toastSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes toastSlideIn {
          0% {
            transform: translateX(-50%) translateY(-120%);
            opacity: 0;
          }
          100% {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
        .toast-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .toast-content {
          flex: 1;
          min-width: 0;
        }
        .toast-title {
          display: block;
          font-size: 0.95rem;
          font-weight: 800;
          color: #2d241d;
          margin-bottom: 4px;
        }
        .toast-body {
          margin: 0;
          font-size: 0.85rem;
          color: #5d4037;
          line-height: 1.45;
          white-space: pre-line;
        }
        .toast-close {
          background: none;
          border: none;
          font-size: 1.4rem;
          color: #aaa;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          flex-shrink: 0;
        }
      `}</style>
    </>
  );
}
