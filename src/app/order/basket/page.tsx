"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, setDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { useBasket } from "@/context/BasketContext";
import Navbar from "@/components/Navbar";
import { MenuItem } from "@/types/menu";

export default function BasketPage() {
  const { member } = useMember();
  const { basket, totalPrice, totalItems, updateQuantity, removeFromBasket, clearBasket } = useBasket();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ shortCode: string } | null>(null);

  // Cross-selling state
  const [crossSellItems, setCrossSellItems] = useState<MenuItem[]>([]);
  const [addedCrossItems, setAddedCrossItems] = useState<Set<string>>(new Set());

  // Take-away Fee Logic
  // Every 4 slots occupied = Rp 1.000
  const totalTakeAwaySlots = basket.reduce((total, b) => {
    if (b.takeAwayQuantity === 0) return total;
    const unitsPerPackage = b.menuItem.unitsPerPackage || 1;
    const slots = Math.ceil(b.takeAwayQuantity / unitsPerPackage);
    return total + slots;
  }, 0);

  const takeAwayFee = totalTakeAwaySlots > 0 ? Math.ceil(totalTakeAwaySlots / 4) * 1000 : 0;

  const formatPrice = (price: number) => `Rp${price.toLocaleString("id-ID")}`;

  useEffect(() => {
    // Fetch recommended items for "People also ordered"
    const fetchCrossSell = async () => {
      try {
        const snap = await getDocs(collection(db, "Canteens", "canteen375", "MenuCollection"));
        const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as MenuItem));
        // Filter out items already in basket to avoid redundant suggestions
        const inBasketIds = new Set(basket.map(b => b.menuItem.id));
        const suggestions = items.filter(i => i.isRecommended && !inBasketIds.has(i.id)).slice(0, 5);
        setCrossSellItems(suggestions);
      } catch (err) {
        console.error("Error fetching cross-sell items", err);
      }
    };
    fetchCrossSell();
  }, [basket]);

  const generateShortCode = () => {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `#${num}`;
  };

  const handleOrder = async () => {
    if (!member || basket.length === 0) return;
    setSubmitting(true);

    try {
      const shortCode = generateShortCode();
      const orderItems = basket.map((b) => ({
        namaPesanan: b.menuItem.namaMenu,
        harga: b.menuItem.harga + b.selectedOptions.reduce((acc, o) => acc + o.additionalPrice, 0),
        dineInQuantity: b.dineInQuantity,
        takeAwayQuantity: b.takeAwayQuantity,
        viaAssociationRules: false,
        selectedOptions: b.selectedOptions,
      }));

      const orderId = `SO_${shortCode.replace("#", "")}`;
      await setDoc(doc(db, "Canteens", "canteen375", "SelfOrders", orderId), {
        userId: member.uid || member.id,
        memberName: member.fullName,
        orderItems,
        subtotal: totalPrice,
        takeAwayFee,
        total: totalPrice + takeAwayFee,
        status: "Unpaid",
        shortCode,
        timestamp: serverTimestamp(),
      });

      clearBasket();
      setOrderSuccess({ shortCode });
    } catch (err) {
      console.error("Error placing order:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Order placed success screen ──
  if (orderSuccess) {
    return (
      <div className="basket-page">
        <Navbar />
        <div className="success-screen">
          <div className="success-card">
            <div className="success-icon">✅</div>
            <h2>Pesanan Masuk!</h2>
            <p>Tunjukkan kode ini ke kasir:</p>
            <div className="short-code">{orderSuccess.shortCode}</div>
            <p className="success-sub">Kasir akan menyiapkan pesananmu segera.</p>
            <button className="btn-back" onClick={() => router.push("/order")}>
              Pesan Lagi
            </button>
            <button className="btn-dashboard" onClick={() => router.push("/dashboard")}>
              Kembali ke Dashboard
            </button>
          </div>
        </div>
        <SuccessStyles />
      </div>
    );
  }

  // ── Empty basket ──
  if (basket.length === 0) {
    return (
      <div className="basket-page">
        <Navbar />
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <h2>Keranjangmu Kosong</h2>
          <p>Yuk, pilih menu dulu!</p>
          <button className="btn-back" onClick={() => router.push("/order")}>
            Lihat Menu
          </button>
        </div>
        <EmptyStyles />
      </div>
    );
  }

  return (
    <div className="basket-page">
      <Navbar />

      {/* ── Header ── */}
      <div className="basket-header">
        <button className="back-btn" onClick={() => router.push("/order")}>
          ← Kembali
        </button>
        <h1>Keranjang Pesanan</h1>
        <span className="item-count">{totalItems} item</span>
      </div>

      <div className="basket-content">
        {/* ── Order items list ── */}
        <div className="items-list">
          {basket.map(({ cartItemId, menuItem, dineInQuantity, takeAwayQuantity, selectedOptions }) => {
            const optionsPrice = selectedOptions.reduce((sum, opt) => sum + opt.additionalPrice, 0);
            const itemBasePrice = menuItem.harga + optionsPrice;

            return (
              <div key={cartItemId} className="basket-item">
                <img
                  src={menuItem.imagePath || "/Logo Canteen 375 (2).png"}
                  alt={menuItem.namaMenu}
                  className="item-img"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
                />
                <div className="item-details">
                  <p className="item-name">{menuItem.namaMenu}</p>
                  {selectedOptions.length > 0 && (
                    <div className="item-options-list">
                      {selectedOptions.map((opt, i) => (
                        <p key={i} className="item-option-text">
                          ✓ {opt.optionName} {opt.additionalPrice > 0 ? `(+${formatPrice(opt.additionalPrice)})` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="item-price">{formatPrice(itemBasePrice)}</p>

                  {/* Dine-in row */}
                  <div className="qty-row">
                    <span className="qty-label">🍽️ Makan di sini</span>
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQuantity(cartItemId, "dineIn", -1)}>−</button>
                      <span className="qty-value">{dineInQuantity}</span>
                      <button className="qty-btn" onClick={() => updateQuantity(cartItemId, "dineIn", 1)}>+</button>
                    </div>
                  </div>

                  {/* Take-away row */}
                  <div className="qty-row">
                    <span className="qty-label">🥡 Bungkus</span>
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQuantity(cartItemId, "takeAway", -1)}>−</button>
                      <span className="qty-value">{takeAwayQuantity}</span>
                      <button className="qty-btn" onClick={() => updateQuantity(cartItemId, "takeAway", 1)}>+</button>
                    </div>
                  </div>

                  <p className="item-subtotal">
                    Subtotal: {formatPrice(itemBasePrice * (dineInQuantity + takeAwayQuantity))}
                  </p>
                </div>

                <button className="remove-btn" onClick={() => removeFromBasket(cartItemId)}>🗑️</button>
              </div>
            );
          })}
        </div>

        {/* ── People also ordered / Cross-selling ── */}
        {crossSellItems.length > 0 && (
          <div className="cross-sell-section">
            <h3 className="cross-sell-title">Pelanggan lain juga memesan</h3>
            <div className="cross-sell-scroll">
              {crossSellItems.map(item => {
                const added = addedCrossItems.has(item.id);
                return (
                  <div key={item.id} className="cross-sell-card">
                    <div className="cs-image-wrap">
                      <img src={item.imagePath || "/Logo Canteen 375 (2).png"} alt={item.namaMenu} className="cs-image" onError={e => e.currentTarget.src = "/Logo Canteen 375 (2).png"} />
                      <button
                        className={`cs-add-btn ${added ? 'added' : ''}`}
                        onClick={() => {
                          useBasket().addToBasket(item); // Note: using direct context might need refactoring if it causes issues, but we have addToBasket from top
                          setAddedCrossItems(prev => new Set(prev).add(item.id));
                          setTimeout(() => {
                            setAddedCrossItems(prev => {
                              const next = new Set(prev);
                              next.delete(item.id);
                              return next;
                            });
                          }, 800);
                        }}
                      >
                        {added ? "✓" : "+"}
                      </button>
                    </div>
                    <div className="cs-info">
                      <p className="cs-name">{item.namaMenu}</p>
                      <p className="cs-price">{formatPrice(item.harga)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Order summary ── */}
        <div className="summary-card">
          <h3>Ringkasan Pesanan</h3>
          {basket.map(({ cartItemId, menuItem, dineInQuantity, takeAwayQuantity, selectedOptions }) => {
            const optionsPrice = selectedOptions.reduce((sum, opt) => sum + opt.additionalPrice, 0);
            const itemBasePrice = menuItem.harga + optionsPrice;
            return (
              <div key={cartItemId} className="summary-row">
                <div className="summary-item-info">
                  <span className="summary-item-name">{menuItem.namaMenu} <span className="text-muted">x{dineInQuantity + takeAwayQuantity}</span></span>
                  {selectedOptions.length > 0 && (
                    <div className="summary-item-options">
                      {selectedOptions.map((o, i) => (
                        <span key={i} className="text-muted block">{o.optionName}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span>{formatPrice(itemBasePrice * (dineInQuantity + takeAwayQuantity))}</span>
              </div>
            );
          })}
          <div className="summary-divider" />

          <div className="summary-row fee-row">
            <span>Subtotal</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          {takeAwayFee > 0 && (
            <div className="summary-row fee-row">
              <span>Biaya Bungkus (Take-away)</span>
              <span>{formatPrice(takeAwayFee)}</span>
            </div>
          )}
          <div className="summary-divider" />
          <div className="summary-total">
            <span>Total</span>
            <span className="total-amount">{formatPrice(totalPrice + takeAwayFee)}</span>
          </div>

          <div className="order-note">
            <span className="note-icon">ℹ️</span>
            <p>Setelah memesan, tunjukkan <strong>kode pendek</strong> ke kasir. Kasir akan memproses dan meminta pembayaran.</p>
          </div>

          <button
            className="btn-order"
            disabled={submitting}
            onClick={handleOrder}
          >
            {submitting ? "Memproses..." : `Place Order`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .basket-page { min-height: 100vh; background: #fff; }
        .basket-header {
          background: white;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          border-bottom: 1.5px solid #ece8e3;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .back-btn {
          background: none;
          border: none;
          font-size: 1rem;
          font-weight: 700;
          color: #C51720;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
        }
        .basket-header h1 {
          flex: 1;
          font-size: 1.2rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0;
        }
        .item-count {
          font-size: 0.85rem;
          font-weight: 600;
          color: #8d6e63;
          background: #faf7f2;
          padding: 0.3rem 0.75rem;
          border-radius: 20px;
        }

        .basket-content {
          max-width: 700px;
          margin: 0 auto;
          padding: 1.5rem 1rem 6rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .items-list { display: flex; flex-direction: column; gap: 1rem; }

        .basket-item {
          background: white;
          border-radius: 16px;
          padding: 1rem;
          display: flex;
          gap: 1rem;
          border: 1.5px solid #ece8e3;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          position: relative;
        }
        .item-img {
          width: 80px; height: 80px;
          border-radius: 12px;
          object-fit: cover;
          flex-shrink: 0;
          background: #f5f0eb;
        }
        .item-details { flex: 1; min-width: 0; }
        .item-name {
          font-size: 1rem;
          font-weight: 700;
          color: #2d241d;
          margin: 0 0 0.1rem;
        }
        .item-options-list { margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.15rem; }
        .item-option-text { font-size: 0.8rem; color: #8d6e63; margin: 0; line-height: 1.2; }
        .item-price {
          font-size: 0.9rem;
          color: #C51720;
          font-weight: 700;
          margin: 0 0 0.75rem;
        }

        .qty-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .qty-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: #5d4037;
        }
        .qty-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #faf7f2;
          border-radius: 20px;
          padding: 0.2rem 0.5rem;
          border: 1.5px solid #ece8e3;
        }
        .qty-btn {
          width: 24px; height: 24px;
          border-radius: 50%;
          border: none;
          background: #C51720;
          color: white;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          transition: background 0.2s; 
        }
        .qty-btn:hover { background: #8b0000; }
        .qty-value {
          font-size: 0.95rem;
          font-weight: 700;
          color: #2d241d;
          min-width: 20px;
          text-align: center;
        }
        .item-subtotal {
          font-size: 0.82rem;
          color: #8d6e63;
          font-weight: 600;
          margin: 0.4rem 0 0;
        }

        .remove-btn {
          position: absolute;
          top: 0.75rem; right: 0.75rem;
          background: none;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .remove-btn:hover { opacity: 1; }

        /* ── Summary Card ── */
        .summary-card {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          border: 1.5px solid #ece8e3;
          box-shadow: 0 4px 16px rgba(0,0,0,0.07);
        }
        .summary-card h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0 0 1rem;
        }
        .summary-card p {
          font-size: 0.95rem;
          color: #555;
          margin: 0 0 1rem;
        }

        /* Cross Selling */
        .cross-sell-section { margin-top: 0.5rem; }
        .cross-sell-title { font-size: 1.15rem; font-weight: 800; color: #2d241d; margin: 0 0 1rem; }
        .cross-sell-scroll { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: none; }
        .cross-sell-scroll::-webkit-scrollbar { display: none; }
        .cross-sell-card { min-width: 130px; width: 130px; display: flex; flex-direction: column; gap: 0.5rem; }
        .cs-image-wrap { position: relative; width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #f5f0eb; border: 1.5px solid #ece8e3; }
        .cs-image { width: 100%; height: 100%; object-fit: cover; }
        .cs-add-btn { position: absolute; bottom: 8px; right: 8px; width: 32px; height: 32px; border-radius: 50%; background: #00b14f; color: white; border: none; font-size: 1.2rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,177,79,0.3); transition: 0.2s; }
        .cs-add-btn.added { background: #2e7d32; }
        .cs-add-btn:hover { transform: scale(1.1); }
        .cs-info { padding: 0 0.25rem; }
        .cs-name { font-size: 0.85rem; color: #2d241d; font-weight: 600; margin: 0 0 0.2rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .cs-price { font-size: 0.9rem; font-weight: 800; color: #2d241d; margin: 0; }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
          color: #2d241d;
          font-weight: 500;
        }
        .fee-row { color: #555; }
        .fee-label { display: flex; align-items: center; gap: 0.3rem; }
        .fee-info { font-size: 0.8rem; color: #aaa; cursor: help; }
        .summary-item-info { display: flex; flex-direction: column; gap: 0.2rem; }
        .summary-item-name { font-weight: 600; }
        .summary-item-options { display: flex; flex-direction: column; gap: 0.1rem; padding-left: 0.5rem; border-left: 2px solid #ece8e3; margin-top: 0.2rem; }
        .text-muted { color: #8d6e63; font-size: 0.8rem; }
        .block { display: block; }
        .summary-divider {
          width: 100%;
          border-top: 1.5px dashed #ece8e3;
          margin: 1rem 0;
        }
        .summary-total {
          display: flex;
          justify-content: space-between;
          font-weight: 800;
          font-size: 1.1rem;
          margin-bottom: 1.25rem;
        }
        .total-amount { color: #C51720; }

        .order-note {
          display: flex;
          gap: 0.75rem;
          background: #fef3f3;
          border: 1.5px solid #fca5a5;
          border-radius: 12px;
          padding: 0.85rem;
          margin-bottom: 1.25rem;
        }
        .note-icon { font-size: 1.1rem; flex-shrink: 0; }
        .order-note p { font-size: 0.82rem; color: #5d4037; line-height: 1.5; margin: 0; }

        .btn-order {
          width: 100%;
          padding: 1rem;
          border-radius: 16px;
          border: none;
          background: #C51720;
          color: white;
          font-size: 1.05rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-order:hover:not(:disabled) {
          background: #C51720;
        }
        .btn-order:disabled {
          background: #ddd;
          cursor: not-allowed;
          color: #888;
        } `}</style>
    </div>
  );
}

function SuccessStyles() {
  return (
    <style jsx global>{`
      .success-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 80vh;
        padding: 1.5rem;
      }
      .success-card {
        background: white;
        border-radius: 24px;
        padding: 2.5rem;
        text-align: center;
        max-width: 360px;
        width: 100%;
        border: 1.5px solid #ece8e3;
        box-shadow: 0 20px 50px rgba(0,0,0,0.1);
        animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes popIn {
        from { opacity: 0; transform: scale(0.85); }
        to { opacity: 1; transform: scale(1); }
      }
      .success-icon { font-size: 4rem; margin-bottom: 1rem; }
      .success-card h2 {
        font-size: 1.6rem;
        font-weight: 800;
        color: #2d241d;
        margin: 0 0 0.5rem;
      }
      .success-card > p {
        color: #5d4037;
        font-size: 0.95rem;
        margin: 0 0 1rem;
      }
      .short-code {
        font-size: 3.5rem;
        font-weight: 900;
        color: #C51720;
        letter-spacing: 0.05em;
        background: #fef3f3;
        border: 3px dashed #C51720;
        border-radius: 16px;
        padding: 0.75rem 1.5rem;
        margin: 0 0 1rem;
        display: inline-block;
      }
      .success-sub {
        font-size: 0.85rem;
        color: #8d6e63;
        margin: 0 0 1.5rem;
      }
      .btn-back, .btn-dashboard {
        display: block;
        width: 100%;
        padding: 0.85rem;
        border-radius: 12px;
        font-family: inherit;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 0.75rem;
      }
      .btn-back {
        background: #C51720;
        color: white;
        border: none;
        box-shadow: 0 4px 12px rgba(197,23,32,0.3);
      }
      .btn-back:hover { background: #8b0000; }
      .btn-dashboard {
        background: white;
        color: #C51720;
        border: 2px solid #C51720;
      }
      .btn-dashboard:hover { background: #fef3f3; }
    `}</style>
  );
}

function EmptyStyles() {
  return (
    <style jsx global>{`
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 70vh;
        gap: 0.75rem;
        text-align: center;
        padding: 2rem;
      }
      .empty-icon { font-size: 5rem; margin-bottom: 0.5rem; }
      .empty-state h2 { font-size: 1.5rem; font-weight: 800; color: #2d241d; }
      .empty-state p { color: #8d6e63; }
      .btn-back {
        margin-top: 1rem;
        padding: 0.85rem 2rem;
        background: #C51720;
        color: white;
        border: none;
        border-radius: 12px;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
      }
    `}</style>
  );
}
