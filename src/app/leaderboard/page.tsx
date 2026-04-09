"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { CompetitionRecord, Member, Category } from "@/types/member";
import { VoucherGroup } from "@/types/voucher";

export default function LeaderboardPage() {
  const { member, isAdmin, firebaseUser, loading: sessionLoading } = useMember();
  const [records, setRecords] = useState<CompetitionRecord[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [selectedCategory, setSelectedCategory] = useState<Category>("Mahasiswa");
  const [loading, setLoading] = useState(true);
  const [activePrograms, setActivePrograms] = useState<VoucherGroup[]>([]);

  const currentMonth = new Date().toISOString().slice(0, 7); // yyyy-mm

  useEffect(() => {
    if (member?.category) {
      setSelectedCategory(member.category);
    }

    if (sessionLoading) return;

    if (!firebaseUser) {
      setMembers({});
      setRecords([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const membersSnap = await getDocs(collection(db, "Members"));
        const membersMap: Record<string, Member> = {};
        membersSnap.forEach(doc => {
          membersMap[doc.id] = { id: doc.id, ...doc.data() } as Member;
        });
        setMembers(membersMap);

        const competitionDoc = await getDoc(doc(db, "competitionRecords", currentMonth));

        if (competitionDoc.exists()) {
          const data = competitionDoc.data();
          const parsedRecords: CompetitionRecord[] = [];

          Object.entries(data).forEach(([memberId, stats]: [string, any]) => {
            const memberInfo = membersMap[memberId];
            parsedRecords.push({
              memberId,
              memberName: memberInfo?.fullName || memberId.split('_')[0],
              amountSpent: stats.amountSpent || 0,
              points: stats.customerPoints || 0,
              numberOfTransaction: stats.numberOfTransaction || 0
            });
          });

          setRecords(parsedRecords);
        } else {
          setRecords([]);
        }
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [member, sessionLoading, firebaseUser, currentMonth]);

  // Active voucher campaigns (announcement above leaderboard — cashier + members)
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, "voucherGroup"), where("isActive", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setActivePrograms(snap.docs.map(d => ({ id: d.id, ...d.data() } as VoucherGroup)));
      },
      (err) => {
        console.error("Leaderboard voucherGroup listener:", err);
        setActivePrograms([]);
      }
    );
    return () => unsub();
  }, [firebaseUser]);

  if (sessionLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!firebaseUser) {
    return (
      <div className="leaderboard-wrapper">
        <Navbar />
        <main className="leaderboard-main">
          <div className="leaderboard-container animate-fade-in">
            <div className="lb-guest-card">
              <h2>Papan peringkat</h2>
              <p>Silakan masuk untuk melihat leaderboard dan program voucher.</p>
              <Link href="/login?redirect=/leaderboard" className="lb-login-btn">
                Masuk
              </Link>
            </div>
          </div>
        </main>
        <style jsx>{`
          .leaderboard-wrapper { min-height: 100vh; background: #C51720; }
          .leaderboard-main {
            padding: 2rem 1rem;
            display: flex;
            justify-content: center;
            background: rgba(250, 247, 242, 0.66);
            backdrop-filter: blur(300px);
            min-height: 70vh;
          }
          .leaderboard-container { width: 100%; max-width: 600px; }
          .lb-guest-card {
            background: white;
            border-radius: 20px;
            border: 1.5px solid #000;
            padding: 2rem;
            text-align: center;
            color: #2d241d;
          }
          .lb-guest-card h2 { margin: 0 0 0.75rem; font-size: 1.5rem; }
          .lb-guest-card p { margin: 0 0 1.25rem; color: #5d4037; line-height: 1.5; }
          .lb-login-btn {
            display: inline-block;
            background: #C51720;
            color: white;
            font-weight: 700;
            padding: 0.75rem 1.75rem;
            border-radius: 12px;
            text-decoration: none;
          }
        `}</style>
      </div>
    );
  }

  // Filter records by category and sort by points
  const filteredRecords = records
    .filter(r => {
      const m = members[r.memberId];
      return m?.category === selectedCategory;
    })
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      if (b.amountSpent !== a.amountSpent) {
        return b.amountSpent - a.amountSpent;
      }
      return b.numberOfTransaction - a.numberOfTransaction;
    });

  const myRank = filteredRecords.findIndex(r => r.memberId === member?.id) + 1;

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <div className="leaderboard-wrapper">
      <Navbar />
      <main className="leaderboard-main">
        <div className="leaderboard-container animate-fade-in">
          <div className="lb-header">
            <h2>🏆 Leaderboard {new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</h2>
            <p>Berkompetisi untuk mendapatkan voucher menarik!</p>
          </div>

          {activePrograms.length > 0 && (
            <aside className="voucher-announcement" aria-label="Program voucher aktif">
              <div className="announcement-badge">📢 Pengumuman</div>
              <h3 className="announcement-title">🎁 Program Voucher Aktif</h3>
              <p className="announcement-nudge">
                Naik peringkat dan raih reward — klaim di menu <strong>Voucher Aktif</strong> di akunmu!
              </p>
              <div className="announcement-programs">
                {activePrograms.map((prog) => (
                  <div key={prog.id} className="announcement-program-row">
                    <div className="announcement-program-main">
                      <span className="announcement-program-name">{prog.voucherName}</span>
                      <span className="announcement-program-value">Rp{(prog.value || 0).toLocaleString("id-ID")}</span>
                    </div>
                    {(prog.threshold ?? 0) > 0 && (
                      <div className="announcement-points-needed">
                        ⭐ Kumpulkan{" "}
                        <strong>{(prog.threshold ?? 0).toLocaleString("id-ID")} poin</strong> untuk mendapatkan voucher ini
                        <br />
                      </div>
                    )}
                    <div className="announcement-program-foot">
                      {prog.totalParticipants != null && (
                        <span>👥 {prog.totalClaimed || 0}/{prog.totalParticipants} peserta</span>
                      )}
                      {prog.expireDate && (
                        <span className="announcement-expire">
                          s.d. {prog.expireDate.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}

          <div className="category-tabs">
            {(["Santri", "Mahasiswa", "Guru/Dosen"] as Category[]).map(cat => (
              <button
                key={cat}
                className={`tab-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="lb-card">
            {loading ? (
              <div className="lb-loading">Memuat peringkat...</div>
            ) : filteredRecords.length === 0 ? (
              <div className="lb-empty">Belum ada data untuk kategori ini.</div>
            ) : (
              <div className="lb-list">
                {filteredRecords.map((rec, idx) => (
                  <div
                    key={rec.memberId}
                    className={`lb-item ${!isAdmin && rec.memberId === member?.id ? 'is-me' : ''} ${idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : ''
                      }`}
                  >
                    <div className="lb-rank">{getRankBadge(idx + 1)}</div>
                    <div className="lb-name">
                      <span>{rec.memberName}</span>
                      {!isAdmin && rec.memberId === member?.id && <span className="me-badge">Kamu</span>}
                    </div>
                    <div className="lb-stats">
                      <span className="pts">{rec.points} points</span>
                      <span className="tx">{rec.numberOfTransaction} transaksi</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isAdmin && member && myRank > 0 && !loading && (
            <div className="my-rank-summary">
              <p>Posisi kamu saat ini: <strong>Peringkat {myRank}</strong></p>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .leaderboard-wrapper {
          min-height: 100vh;
          background: #C51720;
          position: relative;
        }
        .leaderboard-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
          /* The "Effect": Semi-transparent peach over red + massive blur */
          background: rgba(250, 247, 242, 0.66);
          backdrop-filter: blur(300px);
          -webkit-backdrop-filter: blur(300px);
          background-image: 
            radial-gradient(circle at 20% 20%, rgba(240, 231, 170, 0.5), transparent 66%),
            radial-gradient(circle at 70% 80%, rgba(255, 248, 180, 0.5), transparent 66%);
        }
        .leaderboard-container {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .lb-header {
          text-align: center;
          color: white;
          margin-bottom: 0.5rem;
        }
        .lb-header h2 { font-size: 1.8rem; }
        .lb-header p { opacity: 0.9; font-size: 1rem; }
        
        .category-tabs {
          display: flex;
          background: rgba(255,255,255,0.1);
          padding: 0.4rem;
          border-radius: 12px;
          gap: 0.4rem;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          padding: 0.8rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .tab-btn.active {
          background: white;
          color: #C51720;
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .lb-card {
          background: white;
          border-radius: 20px;
          border: 1.5px solid #000;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .lb-list {
          display: flex;
          flex-direction: column;
        }
        .lb-item {
          display: flex;
          align-items: center;
          padding: 1.2rem 1.5rem;
          border-bottom: 1px solid #eee;
          gap: 1rem;
        }
        .lb-item:last-child { border-bottom: none; }
        .lb-item.is-me {
          background: #fff8e1;
        }
        .lb-item.rank-gold {
          background: linear-gradient(to right, #fffdf2, #fff9c4);
          border-bottom: none;
          margin-bottom: 10px;
          border-radius: 12px;
          box-shadow:
            0 0 0 2px #e6bc00,
            0 4px 14px rgba(230, 188, 0, 0.35);
        }
        .lb-item.rank-silver {
          background: linear-gradient(to right, #fafafa, #eceff4);
          border-bottom: none;
          margin-bottom: 10px;
          border-radius: 12px;
          box-shadow:
            0 0 0 2px #9aa3b2,
            0 4px 14px rgba(154, 163, 178, 0.4);
        }
        .lb-item.rank-bronze {
          background: linear-gradient(to right, #fff9f5, #fdf0e8);
          border-bottom: none;
          margin-bottom: 10px;
          border-radius: 12px;
          box-shadow:
            0 0 0 2px #b87333,
            0 4px 14px rgba(184, 115, 51, 0.35);
        }
        .lb-rank {
          width: 40px;
          font-weight: 700;
          font-size: 1.2rem;
          color: #5d4037;
        }
        .lb-name {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .lb-name span {
          font-weight: 600;
          color: #2d241d;
          font-size: 1rem;
        }
        .me-badge {
          font-size: 0.75rem;
          color: #bc6c25;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .lb-stats {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .lb-stats .pts {
          font-weight: 700;
          color: #C51720;
          font-size: 1.1rem;
        }
        .lb-stats .tx {
          font-size: 0.85rem;
          color: #8d6e63;
        }
        .my-rank-summary {
          text-align: center;
          background: white;
          padding: 1rem;
          border-radius: 12px;
          border: 1.5px solid #000;
          color: #2d241d;
        }
        .lb-loading, .lb-empty {
          padding: 3rem;
          text-align: center;
          color: #8d6e63;
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

        /* ── Voucher announcement (above leaderboard) ── */
        .voucher-announcement {
          background: linear-gradient(145deg, #fffdf5 0%, #fff3e0 45%, #ffe8cc 100%);
          border-radius: 16px;
          border: 3px solid #f9a825;
          padding: 1.25rem 1.35rem 1.35rem;
          box-shadow:
            0 0 0 1px rgba(255, 193, 7, 0.5),
            0 8px 28px rgba(197, 23, 32, 0.12),
            0 2px 0 rgba(255, 255, 255, 0.6) inset;
        }
        .announcement-badge {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #bf360c;
          background: rgba(255, 255, 255, 0.85);
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          border: 1px solid #ffcc80;
          margin-bottom: 0.5rem;
        }
        .announcement-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0 0 0.45rem;
          line-height: 1.25;
        }
        .announcement-nudge {
          font-size: 0.88rem;
          color: #5d4037;
          line-height: 1.45;
          margin: 0 0 1rem;
        }
        .announcement-nudge strong {
          color: #C51720;
        }
        .announcement-programs {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .announcement-program-row {
          background: rgba(255, 255, 255, 0.92);
          border: 2px solid #ffb74d;
          border-radius: 12px;
          padding: 0.85rem 1rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }
        .announcement-points-needed {
          font-size: 0.86rem;
          color: #4e342e;
          line-height: 1.4;
          margin-top: 0.5rem;
          padding: 0.5rem 0.65rem;
          background: rgba(255, 213, 79, 0.25);
          border-radius: 8px;
          border: 1px solid rgba(249, 168, 37, 0.45);
        }
        .announcement-points-needed strong {
          color: #bf360c;
          font-weight: 800;
        }
        .announcement-program-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .announcement-program-name {
          font-weight: 700;
          font-size: 0.95rem;
          color: #2d241d;
          flex: 1;
          line-height: 1.3;
        }
        .announcement-program-value {
          font-weight: 800;
          font-size: 1.05rem;
          color: #C51720;
          white-space: nowrap;
        }
        .announcement-program-foot {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 0.35rem 0.75rem;
          margin-top: 0.45rem;
          font-size: 0.78rem;
          color: #8d6e63;
        }
        .announcement-expire {
          font-style: italic;
          color: #a1887f;
        }
      `}</style>
    </div>
  );
}
