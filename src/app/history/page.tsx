"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";

interface SelectedOption {
  groupName: string;
  optionName: string;
  priceAdjustment?: number;
}

interface OrderItem {
  namaPesanan: string;
  dineInQuantity: number;
  takeAwayQuantity: number;
  harga: number;
  selectedOptions?: SelectedOption[];
}

interface TransactionHistory {
  id: string;
  transactionId: string;
  totalAmount: number;
  pointsAdded: number;
  orderItems: OrderItem[];
  timestamp: any;
  paymentMethod: string;
}

export default function HistoryPage() {
  const { member, loading: sessionLoading } = useMember();
  const router = useRouter();
  const [history, setHistory] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && !member) {
      router.push("/about");
      return;
    }

    const fetchHistory = async () => {
      if (!member) return;
      try {
        const q = query(
          collection(db, "pointTransactions"),
          where("memberId", "==", member.id.trim()),
          orderBy("timestamp", "desc"),
          limit(20)
        );
        const querySnapshot = await getDocs(q);
        const fetched: TransactionHistory[] = [];
        querySnapshot.forEach((doc) => {
          fetched.push({ id: doc.id, ...doc.data() } as TransactionHistory);
        });
        setHistory(fetched);
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [member, sessionLoading, router]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatPrice = (price: number) => `Rp${(price || 0).toLocaleString("id-ID")}`;
  const formatDate = (ts: any) => {
    if (!ts) return "Waktu tidak diketahui";
    let date;
    if (ts.toDate) {
      date = ts.toDate();
    } else if (typeof ts === 'string') {
      date = new Date(ts);
    } else {
      return "Waktu tidak valid";
    }
    return date.toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  if (sessionLoading) {
    return <div className="loading-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="history-wrapper">
      <Navbar />
      <main className="history-main">
        <div className="history-container animate-fade-in">
          <div className="header-section">
            <button className="back-btn" onClick={() => router.push("/dashboard")}>
              ← Kembali
            </button>
            <h2>Riwayat Transaksi</h2>
            <p>Lihat detail transaksi dan poin yang Anda dapatkan.</p>
          </div>

          {loading ? (
            <div className="state-card">
              <div className="loader-small"></div>
              <p>Memuat riwayat...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="state-card">
              <div className="empty-icon">🧾</div>
              <h3>Belum Ada Transaksi</h3>
              <p>Riwayat transaksi dan poin Anda akan muncul di sini setelah Anda memesan.</p>
              <button className="btn-order" onClick={() => router.push("/order")}>Pesan Sekarang</button>
            </div>
          ) : (
            <div className="history-list">
              {history.map((tx) => {
                const isExpanded = expandedId === tx.id;
                const totalItemsCount = tx.orderItems?.reduce((sum, item) => sum + (item.dineInQuantity || 0) + (item.takeAwayQuantity || 0), 0) || 0;
                
                return (
                  <div key={tx.id} className={`history-card ${isExpanded ? 'expanded' : ''}`}>
                    <div className="history-card-header" onClick={() => toggleExpand(tx.id)}>
                      <div className="hc-left">
                        <div className="hc-icon">🛍️</div>
                        <div className="hc-info">
                          <span className="hc-date">{formatDate(tx.timestamp)}</span>
                          <span className="hc-summary">{totalItemsCount} item • {tx.paymentMethod || "Pembayaran"}</span>
                        </div>
                      </div>
                      <div className="hc-right">
                        <span className="hc-total">{formatPrice(tx.totalAmount)}</span>
                        {tx.pointsAdded > 0 && (
                          <span className="hc-points">+{tx.pointsAdded} Poin ⭐</span>
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="history-card-body animate-slide-down">
                        <div className="receipt-divider" />
                        <h4 className="receipt-title">Detail Pesanan</h4>
                        <div className="receipt-items">
                          {tx.orderItems?.map((item, idx) => {
                            const qty = (item.dineInQuantity || 0) + (item.takeAwayQuantity || 0);
                            let itemTotal = item.harga;
                            if (item.selectedOptions) {
                              item.selectedOptions.forEach(opt => {
                                itemTotal += opt.priceAdjustment || 0;
                              });
                            }
                            
                            return (
                              <div key={idx} className="receipt-item-row">
                                <div className="r-item-main">
                                  <span className="r-item-qty">{qty}x</span>
                                  <div className="r-item-details">
                                    <div className="r-item-name-row">
                                      <span className="r-item-name">{item.namaPesanan}</span>
                                      <span className="r-item-type">
                                        {item.dineInQuantity > 0 && item.takeAwayQuantity > 0 ? (
                                          ` (${item.dineInQuantity} Dine-in, ${item.takeAwayQuantity} Take-away)`
                                        ) : item.dineInQuantity > 0 ? (
                                          " (Dine-in)"
                                        ) : (
                                          " (Take-away)"
                                        )}
                                      </span>
                                    </div>
                                    {item.selectedOptions && item.selectedOptions.length > 0 && (
                                      <div className="r-item-options">
                                        {item.selectedOptions.map((opt, oIdx) => (
                                          <div key={oIdx} className="r-option-row">
                                            <span className="r-option-bullet">•</span>
                                            <span className="r-option-name">{opt.optionName}</span>
                                            {opt.priceAdjustment && opt.priceAdjustment > 0 ? (
                                              <span className="r-option-price">(+{formatPrice(opt.priceAdjustment)})</span>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <span className="r-item-price">{formatPrice(itemTotal * qty)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="receipt-divider" />
                        <div className="receipt-footer">
                          <div className="r-footer-row">
                            <span>Subtotal</span>
                            <span>{formatPrice(tx.totalAmount)}</span>
                          </div>
                          <div className="r-footer-row total">
                            <span>Total</span>
                            <span>{formatPrice(tx.totalAmount)}</span>
                          </div>
                          <div className="r-points-earned">
                            ⭐ Anda mendapatkan <strong>{tx.pointsAdded} Poin</strong> dari transaksi ini!
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .history-wrapper {
          min-height: 100vh;
          background: #C51720;
          position: relative;
        }
        .history-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
          background: rgba(250, 247, 242, 0.66);
          backdrop-filter: blur(300px);
          -webkit-backdrop-filter: blur(300px);
          min-height: calc(100vh - 65px);
          background-image: 
            radial-gradient(circle at 20% 20%, rgba(240, 231, 170, 0.5), transparent 66%),
            radial-gradient(circle at 70% 80%, rgba(255, 248, 180, 0.5), transparent 66%);
        }
        .history-container {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .header-section {
          background: white;
          padding: 1.5rem;
          border-radius: 20px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          border: 1.5px solid #000;
        }
        .back-btn {
          background: #f5f0eb;
          border: none;
          font-size: 0.8rem;
          font-weight: 700;
          color: #5d4037;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: 50px;
          margin-bottom: 1rem;
          transition: 0.2s;
        }
        .back-btn:hover {
          background: #e6dfd5;
        }
        .header-section h2 {
          font-size: 1.6rem;
          color: #2d241d;
          margin: 0 0 0.5rem;
        }
        .header-section p {
          color: #8d6e63;
          margin: 0;
          font-size: 0.95rem;
        }

        .state-card {
          background: white;
          padding: 3rem 2rem;
          border-radius: 20px;
          text-align: center;
          border: 1.5px solid #000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
        .empty-icon {
          font-size: 4rem;
          opacity: 0.8;
        }
        .state-card h3 {
          color: #2d241d;
          margin: 0;
          font-size: 1.3rem;
        }
        .state-card p {
          color: #8d6e63;
          margin: 0;
          font-size: 0.95rem;
        }
        .btn-order {
          background: #C51720;
          color: white;
          border: none;
          padding: 0.8rem 1.5rem;
          border-radius: 12px;
          font-weight: 700;
          font-size: 1rem;
          margin-top: 1rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(197, 23, 32, 0.2);
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .history-card {
          background: white;
          border-radius: 16px;
          border: 1.5px solid #000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .history-card.expanded {
          border-color: #C51720;
          box-shadow: 0 8px 20px rgba(197, 23, 32, 0.1);
        }
        .history-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem;
          cursor: pointer;
          background: white;
        }
        .history-card-header:hover {
          background: #fafafa;
        }
        .hc-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .hc-icon {
          width: 48px;
          height: 48px;
          background: #fff3e0;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }
        .hc-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .hc-date {
          font-weight: 700;
          color: #2d241d;
          font-size: 0.95rem;
        }
        .hc-summary {
          font-size: 0.85rem;
          color: #8d6e63;
        }
        .hc-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }
        .hc-total {
          font-weight: 800;
          color: #2d241d;
          font-size: 1.05rem;
        }
        .hc-points {
          font-size: 0.8rem;
          font-weight: 700;
          color: #16a34a;
          background: #ecfdf5;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
        }

        .history-card-body {
          padding: 0 1.25rem 1.25rem;
          background: #fafafa;
          border-top: 1px dashed #e0e0e0;
        }
        .receipt-divider {
          height: 1px;
          background: repeating-linear-gradient(90deg, #ccc, #ccc 4px, transparent 4px, transparent 8px);
          margin: 1rem 0;
        }
        .receipt-title {
          font-size: 0.9rem;
          color: #5d4037;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 1rem;
        }
        .receipt-items {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .receipt-item-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          font-size: 0.9rem;
        }
        .r-item-main {
          display: flex;
          gap: 0.75rem;
        }
        .r-item-qty {
          font-weight: 700;
          color: #2d241d;
          min-width: 20px;
        }
        .r-item-details {
          display: flex;
          flex-direction: column;
        }
        .r-item-name {
          font-weight: 600;
          color: #2d241d;
        }
        .r-item-type {
          font-size: 0.8rem;
          color: #C51720;
          font-weight: 700;
          opacity: 0.9;
        }
        .r-item-options {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          margin-top: 0.35rem;
          padding-left: 0.25rem;
        }
        .r-option-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8rem;
          color: #8d6e63;
          line-height: 1.2;
        }
        .r-option-bullet {
          color: #d4a373;
          font-weight: 800;
        }
        .r-option-name {
          font-weight: 500;
        }
        .r-option-price {
          font-weight: 700;
          color: #C51720;
          font-size: 0.75rem;
        }
        .r-item-price {
          font-weight: 600;
          color: #2d241d;
        }
        .r-footer-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          color: #5d4037;
          margin-bottom: 0.5rem;
        }
        .r-footer-row.total {
          font-weight: 800;
          color: #2d241d;
          font-size: 1.05rem;
          margin-bottom: 1rem;
        }
        .r-points-earned {
          background: #fff8e1;
          border: 1px solid #ffecb3;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.85rem;
          color: #f57f17;
          text-align: center;
        }
        .r-points-earned strong {
          color: #f57c00;
        }

        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-down { animation: slideDown 0.3s ease-out forwards; transform-origin: top; }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: scaleY(0.9); }
          to { opacity: 1; transform: scaleY(1); }
        }
        
        .loading-screen {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #C51720;
        }
        .loader {
          width: 48px;
          height: 48px;
          border: 5px solid #FFF;
          border-bottom-color: transparent;
          border-radius: 50%;
          animation: rotation 1s linear infinite;
        }
        .loader-small {
          width: 32px;
          height: 32px;
          border: 4px solid #C51720;
          border-bottom-color: transparent;
          border-radius: 50%;
          animation: rotation 1s linear infinite;
        }
        @keyframes rotation {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
