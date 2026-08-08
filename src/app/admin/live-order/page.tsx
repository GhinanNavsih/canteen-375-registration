"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { AnimatePresence, motion } from "framer-motion";

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

export default function LiveOrderDisplayPage() {
  const { isAdmin, loading: sessionLoading } = useMember();
  const router = useRouter();

  const [basket, setBasket] = useState<LiveBasket | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
      },
      (error) => {
        setConnecting(false);
        setConnectionError(error.message);
        console.error("[LiveOrderDisplay] RTDB subscription failed:", error);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, sessionLoading]);

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
          padding: 2.5rem 2rem 2rem;
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
          max-width: 620px;
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
          padding: 1.1rem 1.75rem 0.5rem;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #8d6e63;
          background: #faf9f7;
        }
        .lod-item {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.25rem 1.75rem;
          border-bottom: 1px solid #f0ede9;
        }
        .lod-item-img {
          width: 60px;
          height: 60px;
          border-radius: 14px;
          object-fit: cover;
          background: #f5dcc3;
          flex-shrink: 0;
        }
        .lod-item-main {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          flex: 1;
        }
        .lod-item-name-row {
          display: flex;
          align-items: baseline;
          gap: 0.6rem;
        }
        .lod-item-qty {
          font-family: 'Playfair Display', serif;
          font-weight: 900;
          font-size: 1.1rem;
          color: #C51720;
          min-width: 1.6rem;
        }
        .lod-item-name {
          font-size: 1.15rem;
          font-weight: 800;
          color: #2d241d;
        }
        .lod-item-badges {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .lod-badge {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.15rem 0.55rem;
          border-radius: 999px;
          background: #f5efe8;
          color: #8d6e63;
        }
        .lod-item-options {
          font-size: 0.85rem;
          color: #8d6e63;
          line-height: 1.5;
        }
        .lod-item-note {
          font-size: 0.85rem;
          color: #a0917e;
          font-style: italic;
        }
        .lod-item-price {
          font-size: 1.05rem;
          font-weight: 800;
          color: #2d241d;
          white-space: nowrap;
        }

        .lod-summary {
          padding: 1.5rem 1.75rem;
          background: #faf9f7;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .lod-summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.95rem;
          color: #8d6e63;
          font-weight: 600;
        }
        .lod-summary-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 0.75rem;
          margin-top: 0.25rem;
          border-top: 1.5px solid #ece8e3;
        }
        .lod-summary-total-label {
          font-family: 'Playfair Display', serif;
          font-size: 1.3rem;
          font-weight: 800;
          color: #2d241d;
        }
        .lod-summary-total-value {
          font-family: 'Playfair Display', serif;
          font-size: 1.6rem;
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
