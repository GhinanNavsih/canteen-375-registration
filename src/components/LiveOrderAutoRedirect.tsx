"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";

const LIVE_ORDER_PATH = "/admin/live-order";
const DEFAULT_PATH = "/admin/menu-display";

/**
 * Watches the POS app's live basket for admins on any page. The moment the
 * cashier starts inputting an order (basket goes empty -> non-empty), this
 * tablet jumps to the live order display so the customer can cross-check.
 * The live order page only ever makes sense while there's something to
 * show, so the reverse also holds: if the basket is empty, that page is
 * never the one selected — either it never navigates there, or if the
 * basket empties out (checkout finished) while already there, it bounces
 * back to the default display.
 */
export default function LiveOrderAutoRedirect() {
  const { isAdmin, loading: sessionLoading } = useMember();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const hadItemsRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (sessionLoading || !isAdmin) return;

    const isTesting = localStorage.getItem("zTestingMode") === "true";
    const path = isTesting ? "zTesting_liveBasket/current" : "liveBasket/current";
    const basketRef = ref(rtdb, path);

    const unsubscribe = onValue(basketRef, (snapshot) => {
      const itemCount = (snapshot.val()?.itemCount as number | undefined) ?? 0;
      const hasItems = itemCount > 0;

      if (hasItems && !hadItemsRef.current && pathnameRef.current !== LIVE_ORDER_PATH) {
        router.push(LIVE_ORDER_PATH);
      } else if (!hasItems && pathnameRef.current === LIVE_ORDER_PATH) {
        router.push(DEFAULT_PATH);
      }
      hadItemsRef.current = hasItems;
    });

    return () => unsubscribe();
  }, [isAdmin, sessionLoading, router]);

  return null;
}
