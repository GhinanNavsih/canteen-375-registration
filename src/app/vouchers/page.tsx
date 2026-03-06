"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { Member } from "@/types/member";
import { VoucherGroup, Voucher } from "@/types/voucher";

export default function VouchersPage() {
  const { member, loading: sessionLoading } = useMember();
  const [liveMember, setLiveMember] = useState<Member | null>(null);
  const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([]);
  const [userVouchers, setUserVouchers] = useState<Voucher[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [view, setView] = useState<"active" | "history">("active");
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && !member) {
      router.push("/leaderboard");
      return;
    }

    if (member) {
      const unsub = onSnapshot(doc(db, "Members", member.id), (docSnap) => {
        if (docSnap.exists()) {
          setLiveMember({ id: docSnap.id, ...docSnap.data() } as Member);
        }
      });

      // Fetch All Campaigns (Active and Inactive for history context)
      const qGroups = query(collection(db, "voucherGroup"));
      const unsubGroups = onSnapshot(qGroups, (snap) => {
        setVoucherGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as VoucherGroup)));
      });

      // Fetch User's Vouchers
      const memberId = member.id.trim();

      const handleSnap = (snap: any) => {
        setUserVouchers(prev => {
          const merged = [...prev];
          snap.docs.forEach((d: any) => {
            if (!merged.find(v => v.id === d.id)) {
              merged.push({ id: d.id, ...d.data() } as Voucher);
            } else {
              const idx = merged.findIndex(v => v.id === d.id);
              merged[idx] = { id: d.id, ...d.data() } as Voucher;
            }
          });
          return merged;
        });
      };

      const qByUserId = query(collection(db, "voucher"), where("userId", "==", memberId));
      const qPluralId = query(collection(db, "vouchers"), where("userId", "==", memberId));

      const unsub1 = onSnapshot(qByUserId, handleSnap);
      const unsub2 = onSnapshot(qPluralId, handleSnap);

      return () => {
        unsub();
        unsubGroups();
        unsub1();
        unsub2();
      };
    }
  }, [member, sessionLoading, router]);

  if (sessionLoading || !member) {
    return <div className="loading-screen">Loading...</div>;
  }

  const now = new Date();

  // Active Vouchers: Not claimed yet, and either active or future
  // Combine all vouchers (from groups + standalones like birthday)
  const activeVouchers: any[] = [];

  // 1. Group-based vouchers
  voucherGroups.forEach(g => {
    const isExpired = g.expireDate && g.expireDate.toDate() < now;
    if (!isExpired) {
      const matchVoucher = userVouchers.find(v =>
        v.voucherGroupId && v.voucherGroupId.trim() === g.voucherGroupId?.trim()
      );
      if (matchVoucher?.status !== "CLAIMED") {
        activeVouchers.push({ type: 'group', data: g, matchVoucher });
      }
    }
  });

  // 2. Standalone vouchers (like BDAY) that belong directly to the user
  userVouchers.forEach(v => {
    // If it's not tied to a voucherGroup AND it's not claimed AND not expired
    if (!v.voucherGroupId && v.status !== "CLAIMED") {
      const isExpired = v.expireDate && v.expireDate.toDate() < now;
      if (!isExpired) {
        activeVouchers.push({ type: 'standalone', data: v, matchVoucher: v });
      }
    }
  });

  // History Vouchers: Claimed
  const historyVouchers = userVouchers.filter(v => v.status === "CLAIMED");

  return (
    <div className="vouchers-wrapper">
      <Navbar />
      <main className="vouchers-main">
        <div className="vouchers-container animate-fade-in">
          <div className="vouchers-card">
            <div className="card-header">
              <div className="title-row">
                <Link href="/dashboard" className="back-link">←</Link>
                <h2>🎁 Voucher Saya</h2>
              </div>
              <div className="toggle-container">
                <button
                  className={`toggle-btn ${view === "active" ? "active" : ""}`}
                  onClick={() => setView("active")}
                >
                  Promo Aktif
                </button>
                <button
                  className={`toggle-btn ${view === "history" ? "active" : ""}`}
                  onClick={() => setView("history")}
                >
                  Riwayat
                </button>
              </div>
            </div>

            <div className="vouchers-content">
              {view === "active" ? (
                <div className="vouchers-grid">
                  {activeVouchers.length > 0 ? (
                    activeVouchers.map((item, idx) => {
                      const isGroup = item.type === 'group';
                      const { data, matchVoucher } = item;

                      const voucherName = isGroup ? data.voucherName : data.voucherName;
                      const value = isGroup ? data.value : data.value;
                      const transactionReq = isGroup ? data.transactionRequirement : data.transactionRequirement;

                      const userProgressPoints = matchVoucher ? matchVoucher.userPoints : 0;
                      // Standalone vouchers like BIRTHDAY don't have a threshold, they are ready immediately
                      const threshold = isGroup ? data.threshold : 0;
                      const percent = isGroup ? Math.min(100, (userProgressPoints / threshold) * 100) : 100;
                      const remaining = isGroup ? Math.max(0, threshold - userProgressPoints) : 0;

                      const status = matchVoucher?.status || "IN_PROGRESS";
                      const isReadyToClaim = status === "READY_TO_CLAIM" || (isGroup && userProgressPoints >= threshold);

                      const expDate = isGroup ? data.expireDate.toDate() : data.expireDate.toDate();
                      const activeDate = isGroup ? data.activeDate?.toDate() : null;
                      const isFuture = activeDate && activeDate > now;

                      const diffMs = expDate.getTime() - now.getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                      let timerText = "";
                      if (diffDays > 0) {
                        timerText = `Berakhir dalam ${diffDays} hari ${diffHours} jam`;
                      } else if (diffHours > 0) {
                        timerText = `Berakhir dalam ${diffHours} jam lagi!`;
                      } else {
                        timerText = "Berakhir segera!";
                      }

                      return (
                        <div
                          key={idx}
                          className={`voucher-item ${isReadyToClaim ? 'complete' : ''} ${isReadyToClaim ? 'clickable' : ''} ${isFuture ? 'future' : ''}`}
                          onClick={() => {
                            if (isReadyToClaim && matchVoucher) {
                              setSelectedVoucher(matchVoucher);
                              setShowModal(true);
                            }
                          }}
                        >
                          <div className="v-header">
                            <span className="v-name">{voucherName}</span>
                            <span className="v-value">Rp{value.toLocaleString('id-ID')}</span>
                          </div>

                          {isFuture ? (
                            <div className="v-future-msg">
                              Coming Soon! Mulai {activeDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          ) : (
                            <>
                              <div className="v-urgency">
                                <span className={`nudge-text ${diffMs < 86400000 ? 'critical' : diffMs < 604800000 ? 'urgent' : 'normal'}`}>
                                  {diffMs < 604800000 ? timerText + " ⏳" : `s/d ${expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                </span>
                              </div>

                              {isReadyToClaim ? (
                                <div className="v-ready-section">
                                  <div className="v-complete-msg">
                                    Voucher Siap Diklaim! 🎁
                                  </div>
                                  <div className="v-requirement-notice">
                                    Min. transaksi <strong>Rp{(transactionReq || 0).toLocaleString('id-ID')}</strong>
                                  </div>
                                </div>
                              ) : (
                                <div className="v-progress-section">
                                  <div className="v-progress-bar-container">
                                    <div className="v-progress-bar" style={{ width: `${percent}%` }}></div>
                                  </div>
                                  <p className="v-progress-text">
                                    {remaining} poin lagi untuk klaim
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-state">
                      <p>Tidak ada promo aktif saat ini.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="vouchers-grid">
                  {historyVouchers.length > 0 ? (
                    historyVouchers.map((voucher, idx) => (
                      <div key={idx} className="voucher-item history">
                        <div className="v-header">
                          <span className="v-name">{voucher.voucherName}</span>
                          <span className="v-value history">Claimed</span>
                        </div>
                        <div className="v-history-details">
                          <p>Berhasil ditukarkan pada:</p>
                          <p className="v-date">
                            {voucher.lastUpdatedAt?.toDate().toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          <div className="v-id-badge">
                            ID: {voucher.voucherId}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p>Belum ada riwayat voucher.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {showModal && selectedVoucher && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="voucher-modal animate-pop-in" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Redeem Voucher</h3>
                <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="voucher-info">
                  <span className="v-label">Voucher Name</span>
                  <p className="v-value-modal">{selectedVoucher.voucherName}</p>
                </div>
                <div className="voucher-info">
                  <span className="v-label">Voucher ID</span>
                  <div className="id-container">
                    <p className="v-id">{selectedVoucher.voucherId || "N/A"}</p>
                  </div>
                </div>
                <div className="modal-instructions">
                  <p>Tunjukkan kode ini kepada kasir untuk menukarkan voucher cashback Anda.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .vouchers-wrapper {
          min-height: 100vh;
          background: #C51720;
        }
        .vouchers-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
        }
        .vouchers-container {
          width: 100%;
          max-width: 600px;
        }
        .vouchers-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1.5px solid #000;
        }
        .card-header {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .card-header h2 {
          margin: 0;
          color: #2d241d;
          font-size: 1.8rem;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .back-link {
          text-decoration: none;
          color: #C51720;
          font-size: 1.5rem;
          font-weight: 700;
          padding: 0.5rem;
          border-radius: 50%;
          background: #fdf2f2;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          border: 1px solid #C51720;
        }
        .back-link:hover {
          background: #C51720;
          color: white;
          transform: translateX(-4px);
        }
        .toggle-container {
          display: flex;
          background: #f5f5f5;
          padding: 0.4rem;
          border-radius: 12px;
          border: 1px solid #ddd;
        }
        .toggle-btn {
          flex: 1;
          padding: 0.8rem;
          border: none;
          background: transparent;
          font-weight: 700;
          color: #7d6a5e;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .toggle-btn.active {
          background: rgba(197, 23, 32, 0.15);
          color: #C51720;
          box-shadow: 0 2px 8px rgba(197, 23, 32, 0.15);
          border: 1.5px solid #C51720;
        }
        .vouchers-grid {
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
        }
        .voucher-item {
          background: #faf7f2;
          border: 1.5px solid #d4a373;
          border-radius: 16px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          transition: all 0.3s;
        }
        .voucher-item.complete {
          background: #f1f8e9;
          border-color: #8bc34a;
        }
        .voucher-item.clickable {
          cursor: pointer;
        }
        .voucher-item.clickable:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        .voucher-item.history {
          background: #f8f9fa;
          border-color: #dee2e6;
          opacity: 0.9;
        }
        .voucher-item.future {
          opacity: 0.7;
          border-style: dashed;
        }
        .v-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .v-name {
          font-size: 1.2rem;
          font-weight: 700;
          color: #2d241d;
        }
        .v-value {
          background: #C51720;
          color: white;
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 700;
        }
        .v-value.history {
          background: #6c757d;
        }
        .v-future-msg {
          font-size: 0.9rem;
          color: #8d6e63;
          font-weight: 600;
          font-style: italic;
        }
        .v-urgency {
          margin-top: -0.5rem;
        }
        .nudge-text {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .nudge-text.urgent { color: #e65100; }
        .nudge-text.critical { color: #d32f2f; font-weight: 800; }
        .nudge-text.normal { color: #7d6a5e; }
        
        .v-progress-bar-container {
          height: 10px;
          background: #e0e0e0;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }
        .v-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #ff9800, #ff5722);
        }
        .v-progress-text {
          font-size: 0.85rem;
          color: #5d4037;
          font-weight: 500;
        }
        .v-ready-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .v-complete-msg {
          font-size: 1rem;
          font-weight: 700;
          color: #2e7d32;
          background: #e8f5e9;
          padding: 0.8rem;
          border-radius: 12px;
          text-align: center;
          border: 1px dashed #2e7d32;
        }
        .v-requirement-notice {
          font-size: 0.85rem;
          color: #5d4037;
          text-align: center;
        }
        .v-history-details {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .v-history-details p {
          margin: 0;
          font-size: 0.85rem;
          color: #6c757d;
        }
        .v-date {
          font-weight: 700;
          color: #2d241d !important;
        }
        .v-id-badge {
          margin-top: 0.5rem;
          font-family: monospace;
          background: #eee;
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
          font-size: 0.8rem;
          color: #444;
          align-self: flex-start;
        }
        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
          color: #8d6e63;
          font-style: italic;
        }

        /* Modal Styles - Shared with dashboard */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          z-index: 1000;
        }
        .voucher-modal {
          background: white;
          width: 100%;
          max-width: 400px;
          border-radius: 24px;
          border: 2px solid #000;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .modal-header {
          padding: 1.5rem;
          background: #C51720;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h3 { margin: 0; }
        .close-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          font-size: 1.8rem;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .modal-body {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .v-label {
          font-size: 0.85rem;
          color: #8d6e63;
          text-transform: uppercase;
          font-weight: 700;
        }
        .v-value-modal {
          font-size: 1.2rem;
          font-weight: 700;
          color: #2d241d;
        }
        .id-container {
          background: #faf7f2;
          border: 2px dashed #d4a373;
          padding: 1rem;
          border-radius: 12px;
          text-align: center;
        }
        .v-id {
          font-family: monospace;
          font-size: 1.8rem;
          font-weight: 800;
          color: #C51720;
          letter-spacing: 0.1em;
        }
        .modal-instructions {
          font-size: 0.9rem;
          color: #5d4037;
          text-align: center;
          line-height: 1.5;
          padding-top: 0.5rem;
          border-top: 1px solid #eee;
        }
        .loading-screen {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #C51720;
          color: white;
          font-size: 1.5rem;
        }

        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-pop-in {
          animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes popIn {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
