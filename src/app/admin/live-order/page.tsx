"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { query, orderBy, limit, onSnapshot as onFsSnapshot, getDoc } from "firebase/firestore";
import { rtdb, db, collection, doc } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { AnimatePresence, motion } from "framer-motion";
import { asProgramDate, parseProgramNumber } from "@/lib/memberProgram";
import ThankYouCard, { ThankYouPhase } from "./ThankYouCard";

interface LiveBasketOption {
  group?: string;
  option?: string;
  priceAdjustment?: number;
}

interface LiveBasketItem {
  name: string;
  dineInQuantity?: number;
  takeAwayQuantity?: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  note?: string | null;
  imagePath?: string;
  isMakanan?: boolean;
  options?: LiveBasketOption[];
}

interface LiveBasket {
  items: LiveBasketItem[];
  itemCount: number;
  packagingFee: number;
  total: number;
  isTakeAway: boolean;
  updatedAt?: number;
}

const DEFAULT_PATH = "/admin/menu-display";
// How long to look for a matching pointTransactions entry before giving up on a member match.
const SEARCH_TIMEOUT_MS = 2500;
// How close (ms) a pointTransactions write must be to the basket clearing to count as the same order.
const MATCH_WINDOW_MS = 90_000;
const HOLD_AFTER_GENERIC_MS = 3200;
const HOLD_AFTER_MATCH_MS = 4800;

interface ThankYouState {
  phase: ThankYouPhase | "hidden";
  memberName?: string;
  pointsBefore?: number;
  pointsAfter?: number;
  pointsAdded?: number;
}

export default function LiveOrderDisplayPage() {
  const { isAdmin, loading: sessionLoading } = useMember();
  const router = useRouter();

  const [basket, setBasket] = useState<LiveBasket | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState<ThankYouState>({ phase: "hidden" });

  const hadItemsRef = useRef(false);
  const lastBasketRef = useRef<LiveBasket | null>(null);
  const thankYouActiveRef = useRef(false);
  const resolvedRef = useRef(false);
  const unsubscribeSearchRef = useRef<(() => void) | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThankYouTimers = () => {
    if (unsubscribeSearchRef.current) {
      unsubscribeSearchRef.current();
      unsubscribeSearchRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  };

  const cancelThankYou = () => {
    clearThankYouTimers();
    thankYouActiveRef.current = false;
    resolvedRef.current = false;
    setThankYou({ phase: "hidden" });
  };

  const resolveThankYou = (next: ThankYouState, holdMs: number) => {
    if (!thankYouActiveRef.current || resolvedRef.current) return;
    resolvedRef.current = true;
    if (unsubscribeSearchRef.current) {
      unsubscribeSearchRef.current();
      unsubscribeSearchRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    setThankYou(next);
    holdTimeoutRef.current = setTimeout(() => {
      thankYouActiveRef.current = false;
      resolvedRef.current = false;
      setThankYou({ phase: "hidden" });
      router.push(DEFAULT_PATH);
    }, holdMs);
  };

  // Order just completed (basket went from having items to empty) — look for a matching
  // points-earning transaction so we can show a real before/after points celebration.
  const beginThankYou = (prevBasket: LiveBasket | null) => {
    thankYouActiveRef.current = true;
    resolvedRef.current = false;
    setThankYou({ phase: "searching" });

    const total = prevBasket?.total;
    const clearedAt = Date.now();

    const handleSnapshot = async (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
      if (resolvedRef.current) return;

      // The authoritative POS ledger uses pointsDelta/finalBill/eventAt and
      // is completed inside the sale transaction.  Keep legacy field fallbacks
      // for older records, but never celebrate a pending/reverse entry.
      let best: { data: Record<string, unknown>; timeDiff: number } | null = null;

      for (const docSnap of docs) {
        const data = docSnap.data();

        const memberId = String(data.memberId ?? "").trim();
        if (!memberId) continue;

        const status = String(data.status ?? "completed").toLowerCase();
        const eventType = String(data.eventType ?? "earn").toLowerCase();
        if (status !== "completed" || eventType !== "earn") continue;

        const pointsAdded = parseProgramNumber(data.pointsAdded ?? data.pointsDelta);
        if (pointsAdded <= 0) continue;

        if (typeof total === "number") {
          const txTotal = parseProgramNumber(data.total ?? data.finalBill ?? data.grossTotal, Number.NaN);
          if (!Number.isNaN(txTotal) && txTotal !== total) continue;
        }

        const txTime = asProgramDate(data.timestamp ?? data.eventAt ?? data.createdAt)?.getTime();
        const timeDiff = txTime ? Math.abs(txTime - clearedAt) : MATCH_WINDOW_MS;
        if (timeDiff > MATCH_WINDOW_MS) continue;

        if (!best || timeDiff < best.timeDiff) {
          best = { data, timeDiff };
        }
      }

      if (!best) return;

      const memberId = String(best.data.memberId ?? "").trim();
      const pointsAdded = parseProgramNumber(best.data.pointsAdded ?? best.data.pointsDelta);

      try {
        const memberSnap = await getDoc(doc(db, "Members", memberId));
        const memberData = memberSnap.data();
        const pointsAfter = parseProgramNumber(memberData?.points, pointsAdded);
        resolveThankYou(
          {
            phase: "matched",
            memberName: typeof memberData?.fullName === "string" ? memberData.fullName : undefined,
            pointsAdded,
            pointsAfter,
            pointsBefore: pointsAfter - pointsAdded,
          },
          HOLD_AFTER_MATCH_MS
        );
      } catch (err) {
        console.error("[LiveOrderDisplay] failed to load member for thank-you card:", err);
        resolveThankYou({ phase: "generic" }, HOLD_AFTER_GENERIC_MS);
      }
    };

    const recentQuery = query(collection(db, "pointTransactions"), orderBy("eventAt", "desc"), limit(15));
    unsubscribeSearchRef.current = onFsSnapshot(recentQuery, (snapshot) => {
      void handleSnapshot(snapshot.docs);
    });

    searchTimeoutRef.current = setTimeout(() => {
      resolveThankYou({ phase: "generic" }, HOLD_AFTER_GENERIC_MS);
    }, SEARCH_TIMEOUT_MS);
  };

  // Guard — this is a cashier-counter display, admin-only.
  useEffect(() => {
    if (!sessionLoading && !isAdmin) {
      router.push("/login?redirect=/admin/live-order");
    }
  }, [isAdmin, sessionLoading, router]);

  useEffect(() => {
    if (sessionLoading || !isAdmin) return;

    const isTesting = localStorage.getItem("zTestingMode") === "true";
    const path = isTesting ? "zTesting_liveBasket/current" : "liveBasket/current";
    const basketRef = ref(rtdb, path);

    const unsubscribe = onValue(
      basketRef,
      (snapshot) => {
        setConnecting(false);
        setConnectionError(null);
        const data = snapshot.val() as LiveBasket | null;
        setBasket(data);

        const itemCount = data?.itemCount ?? 0;
        const hasItems = itemCount > 0;

        if (hasItems) {
          lastBasketRef.current = data;
          if (thankYouActiveRef.current) {
            // A new order started while the thank-you card was still showing — get out of its way.
            cancelThankYou();
          }
        } else if (hadItemsRef.current) {
          beginThankYou(lastBasketRef.current);
        }
        hadItemsRef.current = hasItems;
      },
      (error) => {
        setConnecting(false);
        setConnectionError(error.message);
        console.error("[LiveOrderDisplay] RTDB subscription failed:", error);
      }
    );

    return () => {
      unsubscribe();
      clearThankYouTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, sessionLoading, router]);

  const formatPrice = (price: number) => `Rp${(price || 0).toLocaleString("id-ID")}`;

  if (sessionLoading || !isAdmin) {
    return (
      <>
        <style jsx global>{`
          .lod-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #faf7f2;
          }
        `}</style>
        <div className="lod-loading" />
      </>
    );
  }

  const items = basket?.items ?? [];
  const hasItems = items.length > 0;
  const foodItems = items.filter((item) => item.isMakanan !== false);
  const drinkItems = items.filter((item) => item.isMakanan === false);
  const sections = [
    { label: "🍽️ Makanan", items: foodItems },
    { label: "🥤 Minuman", items: drinkItems },
  ].filter((section) => section.items.length > 0);

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Inter:wght@400;500;600;700;800&display=swap');

        .lod-page {
          min-height: 100vh;
          background: #faf7f2;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem 1.5rem;
        }

        .lod-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        .lod-title {
          font-family: 'Playfair Display', serif;
          font-size: 2.25rem;
          font-weight: 900;
          color: #2d241d;
          margin: 0;
        }
        .lod-subtitle {
          font-size: 1rem;
          color: #8d6e63;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0;
        }
        .lod-live-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: #fdf2f2;
          color: #C51720;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.4rem 0.9rem;
          border-radius: 999px;
          margin-top: 0.25rem;
        }
        .lod-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #C51720;
          animation: lod-pulse 1.4s ease-in-out infinite;
        }
        .lod-live-badge-error {
          background: #f3f3f3;
          color: #6b6b6b;
        }
        .lod-live-badge-error .lod-live-dot {
          background: #6b6b6b;
          animation: none;
        }
        @keyframes lod-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .lod-card {
          width: 100%;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 20px 40px -20px rgba(45, 36, 29, 0.15);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .lod-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 5rem 2rem;
          text-align: center;
        }
        .lod-empty-icon { font-size: 3rem; }
        .lod-empty-text {
          font-size: 1.15rem;
          font-weight: 700;
          color: #2d241d;
        }
        .lod-empty-sub {
          font-size: 0.95rem;
          color: #a0917e;
        }

        .lod-items {
          display: flex;
          flex-direction: column;
        }
        .lod-section-label {
          padding: 1.5rem 2.5rem 0.75rem;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #8d6e63;
          background: #faf9f7;
        }
        .lod-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.75rem;
          padding: 1.5rem 2.5rem;
          border-bottom: 1px solid #f0ede9;
        }
        .lod-item-img {
          width: 160px;
          height: 160px;
          border-radius: 24px;
          object-fit: cover;
          background: #f5dcc3;
          flex-shrink: 0;
        }
        .lod-item-main {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1;
        }
        .lod-item-name-row {
          display: flex;
          align-items: baseline;
          gap: 0.75rem;
        }
        .lod-item-qty {
          font-family: 'Playfair Display', serif;
          font-weight: 900;
          font-size: 1.7rem;
          color: #C51720;
          min-width: 2.1rem;
        }
        .lod-item-name {
          font-size: 1.6rem;
          font-weight: 800;
          color: #2d241d;
        }
        .lod-item-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .lod-badge {
          font-size: 0.9rem;
          font-weight: 700;
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          background: #f5efe8;
          color: #8d6e63;
        }
        .lod-item-options {
          font-size: 1.05rem;
          color: #8d6e63;
          line-height: 1.5;
        }
        .lod-item-note {
          font-size: 1.05rem;
          color: #a0917e;
          font-style: italic;
        }
        .lod-item-price {
          font-size: 1.5rem;
          font-weight: 800;
          color: #2d241d;
          white-space: nowrap;
        }

        .lod-summary {
          padding: 2rem 2.5rem;
          background: #faf9f7;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .lod-summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 1.15rem;
          color: #8d6e63;
          font-weight: 600;
        }
        .lod-summary-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1rem;
          margin-top: 0.25rem;
          border-top: 1.5px solid #ece8e3;
        }
        .lod-summary-total-label {
          font-family: 'Playfair Display', serif;
          font-size: 1.75rem;
          font-weight: 800;
          color: #2d241d;
        }
        .lod-summary-total-value {
          font-family: 'Playfair Display', serif;
          font-size: 2.25rem;
          font-weight: 900;
          color: #C51720;
        }

        .lod-footer {
          margin-top: 1.5rem;
          font-size: 0.85rem;
          color: #b0a89e;
          text-align: center;
        }
      `}</style>

      <div className="lod-page">
        <header className="lod-header">
          <h1 className="lod-title">Pesanan Anda</h1>
          <p className="lod-subtitle">Cek kembali sebelum pembayaran</p>
          <span className={`lod-live-badge${connectionError ? " lod-live-badge-error" : ""}`}>
            <span className="lod-live-dot" />
            {connectionError ? "Gagal terhubung" : connecting ? "Menghubungkan…" : "Live"}
          </span>
        </header>

        <div className="lod-card">
          <AnimatePresence mode="wait">
            {connectionError ? (
              <motion.div
                key="error"
                className="lod-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="lod-empty-icon">⚠️</div>
                <div className="lod-empty-text">Tidak bisa terhubung ke pesanan langsung</div>
                <div className="lod-empty-sub">{connectionError}</div>
              </motion.div>
            ) : thankYou.phase !== "hidden" ? (
              <ThankYouCard
                key="thankyou"
                phase={thankYou.phase}
                memberName={thankYou.memberName}
                pointsBefore={thankYou.pointsBefore}
                pointsAfter={thankYou.pointsAfter}
                pointsAdded={thankYou.pointsAdded}
              />
            ) : !hasItems ? (
              <motion.div
                key="empty"
                className="lod-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="lod-empty-icon">🛒</div>
                <div className="lod-empty-text">Belum ada pesanan</div>
                <div className="lod-empty-sub">Pesanan akan muncul di sini saat kasir mulai menginput.</div>
              </motion.div>
            ) : (
              <motion.div key="items" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="lod-items">
                  {sections.map((section) => (
                    <div key={section.label}>
                      <div className="lod-section-label">{section.label}</div>
                      <AnimatePresence initial={false}>
                        {section.items.map((item, idx) => (
                          <motion.div
                            key={`${item.name}-${idx}`}
                            className="lod-item"
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <img
                              className="lod-item-img"
                              src={item.imagePath || "/Logo Canteen 375 (2).png"}
                              alt={item.name}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png";
                              }}
                            />
                            <div className="lod-item-main">
                              <div className="lod-item-name-row">
                                <span className="lod-item-qty">{item.quantity}×</span>
                                <span className="lod-item-name">{item.name}</span>
                              </div>
                              <div className="lod-item-badges">
                                {!!item.dineInQuantity && (
                                  <span className="lod-badge">Dine In × {item.dineInQuantity}</span>
                                )}
                                {!!item.takeAwayQuantity && (
                                  <span className="lod-badge">Take Away × {item.takeAwayQuantity}</span>
                                )}
                              </div>
                              {!!item.options?.length && (
                                <div className="lod-item-options">
                                  {item.options
                                    .map((opt) => opt.option || opt.group)
                                    .filter(Boolean)
                                    .join(", ")}
                                </div>
                              )}
                              {!!item.note && (
                                <div className="lod-item-note">&ldquo;{item.note}&rdquo;</div>
                              )}
                            </div>
                            <div className="lod-item-price">{formatPrice(item.subtotal)}</div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>

                <div className="lod-summary">
                  {!!basket?.packagingFee && (
                    <div className="lod-summary-row">
                      <span>Biaya Bungkus</span>
                      <span>{formatPrice(basket.packagingFee)}</span>
                    </div>
                  )}
                  <div className="lod-summary-total">
                    <span className="lod-summary-total-label">Total</span>
                    <span className="lod-summary-total-value">{formatPrice(basket?.total ?? 0)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="lod-footer">Layar ini mengikuti input kasir secara langsung.</p>
      </div>
    </>
  );
}
