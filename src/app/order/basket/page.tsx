"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { useBasket } from "@/context/BasketContext";
import Navbar from "@/components/Navbar";

export default function BasketPage() {
  const { member } = useMember();
  const { basket, totalPrice, totalItems, updateQuantity, removeFromBasket, clearBasket } = useBasket();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ shortCode: string } | null>(null);

  const formatPrice = (price: number) => `Rp${price.toLocaleString("id-ID")}`;

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
        harga: b.menuItem.harga,
        dineInQuantity: b.dineInQuantity,
        takeAwayQuantity: b.takeAwayQuantity,
        viaAssociationRules: false,
      }));

      await addDoc(collection(db, "SelfOrders"), {
        userId: member.uid || member.id,
        memberName: member.fullName,
        orderItems,
        total: totalPrice,
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
          {basket.map(({ menuItem, dineInQuantity, takeAwayQuantity }) => (
            <div key={`basket-${menuItem.id}`} className="basket-item">
              <img
                src={menuItem.imagePath || "/placeholder-food.png"}
                alt={menuItem.namaMenu}
                className="item-img"
                onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
              />
              <div className="item-details">
                <p className="item-name">{menuItem.namaMenu}</p>
                <p className="item-price">{formatPrice(menuItem.harga)}</p>

                {/* Dine-in row */}
                <div className="qty-row">
                  <span className="qty-label">🍽️ Makan di sini</span>
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => updateQuantity(menuItem.id, "dineIn", -1)}>−</button>
                    <span className="qty-value">{dineInQuantity}</span>
                    <button className="qty-btn" onClick={() => updateQuantity(menuItem.id, "dineIn", 1)}>+</button>
                  </div>
                </div>

                {/* Take-away row */}
                <div className="qty-row">
                  <span className="qty-label">🥡 Bungkus</span>
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => updateQuantity(menuItem.id, "takeAway", -1)}>−</button>
                    <span className="qty-value">{takeAwayQuantity}</span>
                    <button className="qty-btn" onClick={() => updateQuantity(menuItem.id, "takeAway", 1)}>+</button>
                  </div>
                </div>

                <p className="item-subtotal">
                  Subtotal: {formatPrice(menuItem.harga * (dineInQuantity + takeAwayQuantity))}
                </p>
              </div>

              <button className="remove-btn" onClick={() => removeFromBasket(menuItem.id)}>🗑️</button>
            </div>
          ))}
        </div>

        {/* ── Order summary ── */}
        <div className="summary-card">
          <h3>Ringkasan Pesanan</h3>
          {basket.map(({ menuItem, dineInQuantity, takeAwayQuantity }) => (
            <div key={menuItem.id} className="summary-row">
              <span>{menuItem.namaMenu}</span>
              <span>{formatPrice(menuItem.harga * (dineInQuantity + takeAwayQuantity))}</span>
            </div>
          ))}
          <div className="summary-divider" />
          <div className="summary-total">
            <span>Total</span>
            <span className="total-amount">{formatPrice(totalPrice)}</span>
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
            {submitting ? "Memproses..." : `Pesan Sekarang • ${formatPrice(totalPrice)}`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .basket-page { min-height: 100vh; background: #f9f5f0; }
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
          margin: 0 0 0.25rem;
        }
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
          border: 1.5px solid #d4a373;
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
        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          color: #5d4037;
          margin-bottom: 0.5rem;
        }
        .summary-divider {
          height: 1.5px;
          background: #ece8e3;
          margin: 0.75rem 0;
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
          background: linear-gradient(135deg, #C51720, #8b0000);
          color: white;
          border: none;
          border-radius: 14px;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 6px 20px rgba(197,23,32,0.35);
        }
        .btn-order:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(197,23,32,0.45);
        }
        .btn-order:disabled { opacity: 0.65; cursor: not-allowed; }
      `}</style>
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
