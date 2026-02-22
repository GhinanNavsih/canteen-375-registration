"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, or } from "firebase/firestore";
import { Member } from "@/types/member";
import { VoucherGroup, Voucher } from "@/types/voucher";

export default function DashboardPage() {
  const { member, loading: sessionLoading, logoutMember } = useMember();
  const [liveMember, setLiveMember] = useState<Member | null>(null);
  const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([]);
  const [userVouchers, setUserVouchers] = useState<Voucher[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && !member) {
      router.push("/login");
      return;
    }

    if (member) {
      // Listen for live updates to points
      const unsub = onSnapshot(doc(db, "Members", member.id), (docSnap) => {
        if (docSnap.exists()) {
          setLiveMember({ id: docSnap.id, ...docSnap.data() } as Member);
        }
      });

      // Fetch Active Campaigns
      const qGroups = query(collection(db, "voucherGroup"), where("isActive", "==", true));
      const unsubGroups = onSnapshot(qGroups, (snap) => {
        setVoucherGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as VoucherGroup)));
      });

      // Fetch User's Vouchers
      const qByUserId = query(collection(db, "voucher"), where("userId", "==", member.id.trim()));
      const qByNama = query(collection(db, "voucher"), where("nama", "==", member.fullName.trim()));
      const qByNamaCap = query(collection(db, "voucher"), where("Nama", "==", member.fullName.trim()));
      const qByConstructedId = query(collection(db, "voucher"), where("userId", "==", member.fullName.trim().replace(/\s+/g, "") + "_" + (member.phoneNumber?.trim() || "")));

      // Plural collection variations just in case
      const qPluralNama = query(collection(db, "vouchers"), where("nama", "==", member.fullName.trim()));
      const qPluralId = query(collection(db, "vouchers"), where("userId", "==", member.id.trim()));

      const unsubVouchers: (() => void)[] = [];
      const handleSnap = (snap: any) => {
        setUserVouchers(prev => {
          const merged = [...prev];
          snap.docs.forEach((d: any) => {
            if (!merged.find(v => v.id === d.id)) {
              merged.push({ id: d.id, ...d.data() } as Voucher);
            } else {
              // Update existing
              const idx = merged.findIndex(v => v.id === d.id);
              merged[idx] = { id: d.id, ...d.data() } as Voucher;
            }
          });
          return merged;
        });
      };

      unsubVouchers.push(onSnapshot(qByUserId, handleSnap));
      unsubVouchers.push(onSnapshot(qByNama, handleSnap));
      unsubVouchers.push(onSnapshot(qByNamaCap, handleSnap));
      unsubVouchers.push(onSnapshot(qByConstructedId, handleSnap));
      unsubVouchers.push(onSnapshot(qPluralNama, handleSnap));
      unsubVouchers.push(onSnapshot(qPluralId, handleSnap));

      return () => {
        unsub();
        unsubGroups();
        unsubVouchers.forEach(fn => fn());
      };
    }
  }, [member, sessionLoading, router]);

  if (sessionLoading || !member) {
    return <div className="loading-screen">Loading...</div>;
  }

  const currentPoints = liveMember?.points || member.points || 0;

  return (
    <div className="dashboard-wrapper">
      <Navbar />
      <main className="dashboard-main">
        <div className="dashboard-container animate-fade-in">
          <div className="profile-card">
            <div className="profile-header">
              <div className="avatar">
                {member.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="profile-info">
                <h2>{member.fullName}</h2>
                <span className="category-badge">{member.category}</span>
              </div>
            </div>

            <div className="points-display">
              <div className="points-value">
                <span className="number">{currentPoints}</span>
                <span className="label">Total Points</span>
              </div>
              <div className="points-icon">⭐</div>
            </div>
          </div>

          {voucherGroups.filter(g => g.expireDate && g.expireDate.toDate() > new Date()).length > 0 && (
            <div className="campaigns-card">
              <h3>🎉 Promo Terbatas!</h3>
              <div className="campaigns-grid">
                {voucherGroups
                  .filter(g => g.expireDate && g.expireDate.toDate() > new Date())
                  .map((group, idx) => {
                    const matchVoucher = userVouchers.find(v => {
                      const vGroupId = (v.voucherGroupId || "").trim();
                      const gGroupId = (group.voucherGroupId || "").trim();
                      const vName = (v.voucherName || "").trim().toLowerCase();
                      const gName = (group.voucherName || "").trim().toLowerCase();
                      return (vGroupId && vGroupId === gGroupId) || (vName && vName === gName);
                    });
                    const userProgressPoints = matchVoucher ? matchVoucher.userPoints : 0;
                    const percent = Math.min(100, (userProgressPoints / group.threshold) * 100);
                    const remaining = Math.max(0, group.threshold - userProgressPoints);
                    const status = matchVoucher?.status || "IN_PROGRESS";
                    const isClaimed = status === "CLAIMED";
                    const isReadyToClaim = status === "READY_TO_CLAIM" || (userProgressPoints >= group.threshold && !isClaimed);

                    const expDate = group.expireDate.toDate();
                    const now = new Date();
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
                      <div key={idx} className={`campaign-item ${isClaimed ? 'claimed' : isReadyToClaim ? 'complete' : ''}`}>
                        <div className="c-header">
                          <span className="c-name">{group.voucherName}</span>
                          <span className="c-value">Cashback Rp{group.value.toLocaleString('id-ID')}</span>
                        </div>

                        {!isClaimed && (
                          <div className="c-urgency">
                            <span className={`nudge-text ${diffMs < 86400000 ? 'critical' : diffMs < 604800000 ? 'urgent' : 'normal'}`}>
                              {diffMs < 604800000 ? timerText + " ⏳" : `Berlaku s/d ${expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            </span>
                            {diffMs < 604800000 && (
                              <div className="exp-date-sub">
                                s/d {expDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} • {expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            )}
                          </div>
                        )}

                        {isClaimed ? (
                          <div className="c-claimed-msg">Selamat! Kamu telah berhasil menikmati dan menukarkan voucher cashback ini. 🎉</div>
                        ) : isReadyToClaim ? (
                          <div className="c-ready-section">
                            <div className="c-complete-msg">
                              Voucher Siap Diklaim! 🎁
                            </div>
                            <div className="c-requirement-notice">
                              Minimal transaksi <strong>Rp{(group.transactionRequirement || 0).toLocaleString('id-ID')}</strong> untuk aktivasi cashback.
                            </div>
                          </div>
                        ) : (
                          <div className="c-progress-section">
                            <div className="c-progress-bar-container">
                              <div className="c-progress-bar" style={{ width: `${percent}%` }}></div>
                            </div>
                            <p className="c-progress-text">
                              Kumpulkan {remaining} poin lagi untuk klaim voucher!
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="info-grid">
            <div className="info-item">
              <h4>Email</h4>
              <p>{member.email}</p>
            </div>
            <div className="info-item">
              <h4>Tanggal Lahir</h4>
              <p>{member.dateOfBirth}</p>
            </div>
            {member.phoneNumber && (
              <div className="info-item">
                <h4>No. Telepon</h4>
                <p>{member.phoneNumber}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .dashboard-wrapper {
          min-height: 100vh;
          background: #C51720;
        }
        .dashboard-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
        }
        .dashboard-container {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .profile-card, .info-grid {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1.5px solid #000;
        }
        .profile-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .avatar {
          width: 64px;
          height: 64px;
          background: #5d4037;
          color: white;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 700;
        }
        .profile-info h2 {
          font-size: 1.5rem;
          color: #2d241d;
          margin: 0;
        }
        .category-badge {
          display: inline-block;
          padding: 0.2rem 0.8rem;
          background: #faf7f2;
          color: #8d6e63;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          border: 1px solid #d4a373;
          margin-top: 0.4rem;
        }
        .points-display {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          background: #C51720;
          border-radius: 16px;
          color: white;
        }
        .points-value {
          display: flex;
          flex-direction: column;
        }
        .points-value .number {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
        }
        .points-value .label {
          font-size: 0.9rem;
          opacity: 0.9;
          margin-top: 0.2rem;
        }
        .points-icon {
          font-size: 3rem;
        }
        .campaigns-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1.5px solid #000;
        }
        .campaigns-card h3 {
          margin-bottom: 1.5rem;
          color: #2d241d;
        }
        .campaigns-grid {
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
        }
        .campaign-item {
          background: #faf7f2;
          border: 1.5px solid #d4a373;
          border-radius: 16px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: relative;
          overflow: hidden;
          transition: all 0.3s;
        }
        .campaign-item.complete {
          background: #f1f8e9;
          border-color: #8bc34a;
        }
        .campaign-item.claimed {
          background: #f5f5f5;
          border-color: #ddd;
          opacity: 0.8;
        }
        .c-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .c-name {
          font-size: 1.2rem;
          font-weight: 700;
          color: #2d241d;
        }
        .c-value {
          background: #C51720;
          color: white;
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .c-urgency {
          margin-top: -0.5rem;
        }
        .nudge-text {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .nudge-text.urgent {
          color: #e65100;
          animation: pulse 2s infinite;
        }
        .nudge-text.critical {
          color: #d32f2f;
          font-weight: 800;
          animation: shake 1s infinite alternate;
        }
        .nudge-text.normal {
          color: #7d6a5e;
        }
        .exp-date-sub {
          font-size: 0.75rem;
          color: #8d6e63;
          margin-top: 0.1rem;
          font-weight: 500;
        }
        .c-progress-section {
          margin-top: 0.5rem;
        }
        .c-progress-bar-container {
          height: 10px;
          background: #e0e0e0;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }
        .c-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #ff9800, #ff5722);
          transition: width 0.5s ease-out;
        }
        .c-progress-text {
          font-size: 0.85rem;
          color: #5d4037;
          font-weight: 500;
        }
        .c-ready-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .c-complete-msg {
          font-size: 1rem;
          font-weight: 700;
          color: #2e7d32;
          background: #e8f5e9;
          padding: 0.8rem;
          border-radius: 12px;
          text-align: center;
          border: 1px dashed #2e7d32;
        }
        .c-requirement-notice {
          font-size: 0.85rem;
          color: #5d4037;
          background: #fff3e0;
          padding: 0.7rem;
          border-radius: 8px;
          border-left: 4px solid #ff9800;
          line-height: 1.4;
        }
        .c-requirement-notice strong {
          color: #e65100;
        }
        .c-claimed-msg {
          font-size: 0.9rem;
          font-weight: 700;
          color: #757575;
          text-align: center;
          padding: 0.5rem;
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
          100% { transform: translateX(0); }
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .info-item h4 {
          font-size: 0.85rem;
          color: #8d6e63;
          margin-bottom: 0.3rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .info-item p {
          font-weight: 600;
          color: #2d241d;
        }
        @media (max-width: 480px) {
          .info-grid {
            grid-template-columns: 1fr;
          }
        }
        .loading-screen {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #C51720;
          color: white;
          font-size: 1.5rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
