"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, or, addDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Member } from "@/types/member";
import { VoucherGroup, Voucher } from "@/types/voucher";

export default function DashboardPage() {
  const { member, loading: sessionLoading, logoutMember, isAdmin } = useMember();
  const [liveMember, setLiveMember] = useState<Member | null>(null);
  const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([]);
  const [userVouchers, setUserVouchers] = useState<Voucher[]>([]);
  const [competitionPoints, setCompetitionPoints] = useState<number>(0);
  const [competitionData, setCompetitionData] = useState<any>(null);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [allMembers, setAllMembers] = useState<Record<string, Member>>({});
  const [showModal, setShowModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const router = useRouter();

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Redirect admins to their own panel
  useEffect(() => {
    if (!sessionLoading && isAdmin) {
      router.push("/admin/menu");
    }
  }, [isAdmin, sessionLoading, router]);

  useEffect(() => {
    if (!sessionLoading && !member) {
      router.push("/leaderboard");
      return;
    }

    if (member) {
      // Fetch all members once to know categories for ranking
      const fetchMembers = async () => {
        const { getDocs, collection } = await import("firebase/firestore");
        const snap = await getDocs(collection(db, "Members"));
        const membersMap: Record<string, Member> = {};
        snap.forEach(doc => {
          const tid = doc.id.trim();
          membersMap[tid] = { ...doc.data(), id: tid } as Member;
        });
        setAllMembers(membersMap);
      };
      fetchMembers();

      // Listen for live updates to points
      const unsub = onSnapshot(doc(db, "Members", member.id), (docSnap) => {
        if (docSnap.exists()) {
          setLiveMember({ id: docSnap.id, ...docSnap.data() } as Member);
        }
      });

      // Listen for competition points
      const unsubCompetition = onSnapshot(doc(db, "competitionRecords", currentMonth), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCompetitionData(data);
          const userStats = data[member.id];
          if (userStats) {
            setCompetitionPoints(userStats.customerPoints || 0);
          }
        }
      });

      // Fetch Active Campaigns
      const qGroups = query(collection(db, "voucherGroup"), where("isActive", "==", true));
      const unsubGroups = onSnapshot(qGroups, (snap) => {
        setVoucherGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as VoucherGroup)));
      });

      const unsubVouchers: (() => void)[] = [];
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

      const qByUserId = query(collection(db, "voucher"), where("userId", "==", member.id.trim()));
      const qPluralId = query(collection(db, "vouchers"), where("userId", "==", member.id.trim()));

      unsubVouchers.push(onSnapshot(qByUserId, handleSnap));
      unsubVouchers.push(onSnapshot(qPluralId, handleSnap));

      return () => {
        unsub();
        unsubCompetition();
        unsubGroups();
        unsubVouchers.forEach(fn => fn());
      };
    }
  }, [member, sessionLoading, router, currentMonth]);

  // Reactive Rank Calculation
  useEffect(() => {
    if (member && competitionData && Object.keys(allMembers).length > 0) {
      const targetId = member.id.trim();
      const targetCategory = (liveMember?.category || member.category || "").trim();

      const records: any[] = [];
      Object.entries(competitionData).forEach(([mId, stats]: [string, any]) => {
        const trimmedMId = mId.trim();
        const mInfo = allMembers[trimmedMId];

        // Match the logic used in LeaderboardPage
        if (mInfo && mInfo.category?.trim() === targetCategory) {
          records.push({
            memberId: trimmedMId,
            points: stats.customerPoints || 0,
            amountSpent: stats.amountSpent || 0,
            numberOfTransaction: stats.numberOfTransaction || 0
          });
        }
      });

      const sorted = records.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.amountSpent !== a.amountSpent) return b.amountSpent - a.amountSpent;
        return b.numberOfTransaction - a.numberOfTransaction;
      });

      const rank = sorted.findIndex(r => r.memberId === targetId) + 1;
      setUserRank(rank > 0 ? rank : null);
    }
  }, [member, competitionData, allMembers, liveMember]);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackContent.trim() || !member) return;

    setFeedbackStatus("submitting");
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
      const customId = `FB-${dateStr}-${randomStr}`;

      await setDoc(doc(db, "feedbacks", customId), {
        memberId: member.id,
        memberName: member.fullName,
        content: feedbackContent,
        timestamp: serverTimestamp(),
        status: "pending"
      });
      setFeedbackStatus("success");
      setFeedbackContent("");
      setTimeout(() => setFeedbackStatus("idle"), 3000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      setFeedbackStatus("error");
      setTimeout(() => setFeedbackStatus("idle"), 3000);
    }
  };

  if (sessionLoading || !member) {
    return <div className="loading-screen">Loading...</div>;
  }

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return "🏆";
  };

  const currentPoints = competitionPoints;

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
              <div className="points-content">
                <div className="points-main-row">
                  <span className="number">{currentPoints}</span>
                  {userRank && (
                    <div className="dashboard-rank-badge">
                      <span className="rank-emoji">{getRankEmoji(userRank)}</span>
                      <span className="rank-text">#{userRank}</span>
                    </div>
                  )}
                </div>
                <span className="label">Jumlah Points Anda Bulan Ini</span>
              </div>
              <div className="points-icon-large">⭐</div>
            </div>
          </div>

          {(() => {
            const now = new Date();
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
              if (!v.voucherGroupId && v.status !== "CLAIMED") {
                const isExpired = v.expireDate && v.expireDate.toDate() < now;
                if (!isExpired) {
                  activeVouchers.push({ type: 'standalone', data: v, matchVoucher: v });
                }
              }
            });

            if (activeVouchers.length === 0) return null;

            return (
              <div className="campaigns-card">
                <div className="card-header-with-link">
                  <h3>🎉 Promo Terbatas!</h3>
                  <Link href="/vouchers" className="view-all-link">Lihat Semua →</Link>
                </div>
                <div className="campaigns-grid">
                  {activeVouchers.map((item, idx) => {
                    const isGroup = item.type === 'group';
                    const { data, matchVoucher } = item;

                    const voucherName = isGroup ? data.voucherName : data.voucherName;
                    const value = isGroup ? data.value : data.value;
                    const transactionReq = isGroup ? data.transactionRequirement : data.transactionRequirement;

                    const userProgressPoints = matchVoucher ? matchVoucher.userPoints : 0;
                    const threshold = isGroup ? data.threshold : 0;
                    const percent = isGroup ? Math.min(100, (userProgressPoints / threshold) * 100) : 100;
                    const remaining = isGroup ? Math.max(0, threshold - userProgressPoints) : 0;

                    const status = matchVoucher?.status || "IN_PROGRESS";
                    const isClaimed = status === "CLAIMED";
                    const isReadyToClaim = status === "READY_TO_CLAIM" || (isGroup && userProgressPoints >= threshold && !isClaimed);

                    const expDate = isGroup ? data.expireDate.toDate() : data.expireDate.toDate();
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
                        className={`campaign-item ${isReadyToClaim ? 'complete' : ''} ${isReadyToClaim ? 'clickable' : ''}`}
                        onClick={() => {
                          if (isReadyToClaim && matchVoucher) {
                            setSelectedVoucher(matchVoucher);
                            setShowModal(true);
                          }
                        }}
                      >
                        <div className="c-header">
                          <span className="c-name">{voucherName}</span>
                          <span className="c-value">Cashback Rp{value.toLocaleString('id-ID')}</span>
                        </div>

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

                        {isReadyToClaim ? (
                          <div className="c-ready-section">
                            <div className="c-complete-msg">
                              Voucher Siap Diklaim! 🎁
                            </div>
                            <div className="c-requirement-notice">
                              Minimal transaksi <strong>Rp{(transactionReq || 0).toLocaleString('id-ID')}</strong> untuk aktivasi cashback.
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
            );
          })()}

          <div className="feedback-card">
            <div className="feedback-header">
              <h3>Kritik & Saran</h3>
              <p>Bantu kami untuk terus menjadi lebih baik.</p>
            </div>
            <form onSubmit={handleFeedbackSubmit} className="feedback-form">
              <textarea
                value={feedbackContent}
                onChange={(e) => setFeedbackContent(e.target.value)}
                placeholder="Tuliskan pengalaman, ide, atau saran Anda di sini..."
                rows={4}
                required
                disabled={feedbackStatus === "submitting"}
              />
              <div className="feedback-actions">
                <button
                  type="submit"
                  disabled={feedbackStatus === "submitting" || feedbackStatus === "success" || !feedbackContent.trim()}
                  className={`btn-submit ${feedbackStatus === "submitting" ? "loading" : ""} ${feedbackStatus === "success" ? "success" : ""}`}
                >
                  {feedbackStatus === "submitting" ? "Mengirim..." :
                    feedbackStatus === "success" ? "Terima kasih atas masukannya!" : "Kirim"}
                </button>
              </div>
            </form>
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
                  <p className="v-value">{selectedVoucher.voucherName}</p>
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
        .dashboard-wrapper {
          min-height: 100vh;
          background: #C51720;
          position: relative;
        }
        .dashboard-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
          /* The "Effect": Semi-transparent peach over red + massive blur */
          background: rgba(250, 247, 242, 0.66);
          backdrop-filter: blur(300px);
          -webkit-backdrop-filter: blur(300px);
          min-height: calc(100vh - 65px);
          background-image: 
            radial-gradient(circle at 20% 20%, rgba(240, 231, 170, 0.5), transparent 66%),
            radial-gradient(circle at 70% 80%, rgba(255, 248, 180, 0.5), transparent 66%);
        }
        .dashboard-container {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .profile-card {
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
        .points-content .number {
          font-size: 3.2rem;
          font-weight: 800;
          line-height: 1;
        }
        .points-content .label {
          font-size: 0.9rem;
          opacity: 0.9;
          margin-top: 0.2rem;
        }
        .points-main-row {
          display: flex;
          align-items: baseline;
          gap: 0.8rem;
        }
        .dashboard-rank-badge {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(8px);
          padding: 0.25rem 0.75rem;
          border-radius: 30px;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border: 1px solid rgba(255, 255, 255, 0.3);
          transform: translateY(-8px);
        }
        .rank-emoji {
          font-size: 1.1rem;
        }
        .rank-text {
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .points-icon-large {
          font-size: 3.5rem;
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.2));
        }
        .campaigns-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1.5px solid #000;
        }
        .campaigns-card h3 {
          margin: 0;
          color: #2d241d;
        }
        .card-header-with-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .view-all-link {
          font-size: 0.9rem;
          font-weight: 700;
          color: #C51720;
          text-decoration: none;
          transition: all 0.2s;
        }
        .view-all-link:hover {
          transform: translateX(4px);
          opacity: 0.8;
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
        .campaign-item.clickable {
          cursor: pointer;
        }
        .campaign-item.clickable:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
          border-color: #4caf50;
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
        
        .feedback-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1.5px solid #000;
        }
        .feedback-header {
          margin-bottom: 1.5rem;
        }
        .feedback-header h3 {
          margin: 0 0 0.5rem 0;
          color: #2d241d;
          font-size: 1.4rem;
        }
        .feedback-header p {
          margin: 0;
          font-size: 0.9rem;
          color: #5d4037;
        }
        .feedback-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .feedback-form textarea {
          width: 100%;
          padding: 1rem;
          border-radius: 12px;
          border: 1.5px solid #d4a373;
          background: #faf7f2;
          font-family: inherit;
          font-size: 0.95rem;
          color: #2d241d;
          resize: vertical;
          min-height: 100px;
          transition: all 0.2s;
        }
        .feedback-form textarea:focus {
          outline: none;
          border-color: #C51720;
          background: white;
          box-shadow: 0 4px 12px rgba(197, 23, 32, 0.1);
        }
        .feedback-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .feedback-msg {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .feedback-msg.success { color: #2e7d32; }
        .feedback-msg.error { color: #d32f2f; }
        
        .btn-submit {
          background: #C51720;
          color: white;
          border: none;
          padding: 0.8rem 1.5rem;
          border-radius: 30px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
        }
        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(197, 23, 32, 0.3);
        }
        .btn-submit.success {
          background: #2e7d32;
          cursor: default;
          transform: none;
          box-shadow: 0 4px 10px rgba(46, 125, 50, 0.2);
        }
        .btn-submit:disabled:not(.success) {
          background: #ccc;
          color: #888;
          cursor: not-allowed;
        }
        .btn-submit.loading {
          opacity: 0.8;
        }

        
        /* Modal Styles */
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
        .animate-pop-in {
          animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes popIn {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .modal-header {
          padding: 1.5rem;
          background: #C51720;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h3 { margin: 0; font-size: 1.25rem; }
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
          line-height: 1;
        }
        .modal-body {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .voucher-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .v-label {
          font-size: 0.85rem;
          color: #8d6e63;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .v-value {
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
          font-family: 'Monaco', 'Consolas', monospace;
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
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
