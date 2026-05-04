"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, collection, query, where, onSnapshot } from "firebase/firestore";
import { CompetitionRecord, Member, Category } from "@/types/member";
import { VoucherGroup } from "@/types/voucher";

/** Track which members just received points and which moved up in rank */
interface AnimationState {
  pointBump: Set<string>;   // memberIds that just got points
  rankUp: Set<string>;      // memberIds that moved up
  rankDown: Set<string>;    // memberIds that moved down
}

export default function LeaderboardPage() {
  const { member, isAdmin, firebaseUser, loading: sessionLoading } = useMember();
  const [records, setRecords] = useState<CompetitionRecord[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [selectedCategory, setSelectedCategory] = useState<Category>("Mahasiswa");
  const [loading, setLoading] = useState(true);
  const [activePrograms, setActivePrograms] = useState<VoucherGroup[]>([]);
  const [animations, setAnimations] = useState<AnimationState>({
    pointBump: new Set(),
    rankUp: new Set(),
    rankDown: new Set(),
  });

  // Keep previous snapshots to detect changes
  const prevRecordsRef = useRef<CompetitionRecord[]>([]);
  const prevRankMapRef = useRef<Map<string, number>>(new Map());
  const isFirstLoadRef = useRef(true);

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // yyyy-mm
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Generate list of months for history (starting from April 2026)
  const historyMonths: string[] = [];
  const startMonth = new Date("2026-04-01");
  let tempDate = new Date();
  tempDate.setDate(1);

  while (tempDate >= startMonth) {
    historyMonths.push(tempDate.toISOString().slice(0, 7));
    tempDate.setMonth(tempDate.getMonth() - 1);
  }

  useEffect(() => {
    if (member?.category) {
      setSelectedCategory(member.category);
    }
  }, [member?.category]);

  // ─── Real-time listeners for Members + CompetitionRecords ───
  useEffect(() => {
    if (sessionLoading) return;

    if (!firebaseUser) {
      setMembers({});
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    isFirstLoadRef.current = true;

    // Listener 1: Members collection
    const unsubMembers = onSnapshot(
      collection(db, "Members"),
      (snap) => {
        const membersMap: Record<string, Member> = {};
        snap.forEach((d) => {
          membersMap[d.id] = { id: d.id, ...d.data() } as Member;
        });
        setMembers(membersMap);
      },
      (err) => {
        console.error("Members listener error:", err);
      }
    );

    // Listener 2: Competition records document for the selected month
    const unsubCompetition = onSnapshot(
      doc(db, "competitionRecords", selectedMonth),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const parsed: CompetitionRecord[] = [];

          Object.entries(data).forEach(([memberId, stats]: [string, any]) => {
            parsed.push({
              memberId,
              memberName: "", // will be resolved at render time from `members`
              amountSpent: stats.amountSpent || 0,
              points: stats.customerPoints || 0,
              numberOfTransaction: stats.numberOfTransaction || 0,
            });
          });

          setRecords(parsed);
        } else {
          setRecords([]);
        }
        setLoading(false);
      },
      (err) => {
        console.error("CompetitionRecords listener error:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubMembers();
      unsubCompetition();
    };
  }, [sessionLoading, firebaseUser, selectedMonth]);

  // Active voucher campaigns (already real-time)
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

  // ─── Detect point bumps & rank changes ───
  const detectAnimations = useCallback(
    (currentFiltered: CompetitionRecord[]) => {
      // Skip animation triggers on the very first render
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        // Seed prev state
        prevRecordsRef.current = currentFiltered;
        const rankMap = new Map<string, number>();
        currentFiltered.forEach((r, i) => rankMap.set(r.memberId, i));
        prevRankMapRef.current = rankMap;
        return;
      }

      const prevRecords = prevRecordsRef.current;
      const prevRankMap = prevRankMapRef.current;

      const pointBump = new Set<string>();
      const rankUp = new Set<string>();
      const rankDown = new Set<string>();

      // Build a quick lookup for previous points
      const prevPointsMap = new Map<string, number>();
      prevRecords.forEach((r) => prevPointsMap.set(r.memberId, r.points));

      currentFiltered.forEach((rec, newIndex) => {
        const oldPoints = prevPointsMap.get(rec.memberId);
        // Point bump: member existed before and points increased
        if (oldPoints !== undefined && rec.points > oldPoints) {
          pointBump.add(rec.memberId);
        }

        const oldIndex = prevRankMap.get(rec.memberId);
        if (oldIndex !== undefined) {
          if (newIndex < oldIndex) rankUp.add(rec.memberId);
          else if (newIndex > oldIndex) rankDown.add(rec.memberId);
        }
      });

      if (pointBump.size > 0 || rankUp.size > 0 || rankDown.size > 0) {
        setAnimations({ pointBump, rankUp, rankDown });

        // Clear animations after they play
        setTimeout(() => {
          setAnimations({ pointBump: new Set(), rankUp: new Set(), rankDown: new Set() });
        }, 1800);
      }

      // Update prev refs
      prevRecordsRef.current = currentFiltered;
      const newRankMap = new Map<string, number>();
      currentFiltered.forEach((r, i) => newRankMap.set(r.memberId, i));
      prevRankMapRef.current = newRankMap;
    },
    []
  );

  // ─── Derived: filter + sort ───
  const filteredRecords = records
    .map((r) => ({
      ...r,
      memberName:
        members[r.memberId]?.fullName || r.memberId.split("_")[0],
    }))
    .filter((r) => {
      const m = members[r.memberId];
      if (selectedCategory === "Guru/Dosen/Staff") {
        return m?.category === "Guru/Dosen/Staff" || m?.category === "Guru/Dosen";
      }
      return m?.category === selectedCategory;
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.numberOfTransaction !== a.numberOfTransaction) return b.numberOfTransaction - a.numberOfTransaction;
      return b.amountSpent - a.amountSpent;
    });

  // Trigger animation detection whenever filteredRecords changes
  useEffect(() => {
    if (!loading) {
      detectAnimations(filteredRecords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, members, selectedCategory, loading]);

  const myRank = filteredRecords.findIndex((r) => r.memberId === member?.id) + 1;

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  if (sessionLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!firebaseUser) {
    return (
      <>
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
        </div>
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
      </>
    );
  }

  return (
    <div className="leaderboard-wrapper">
      <Navbar />
      <main className="leaderboard-main">
        <div className="leaderboard-container animate-fade-in">
          <div className="lb-header">
            <h2>🏆 Leaderboard {new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</h2>
            <p>Berkompetisi untuk mendapatkan voucher menarik!</p>
            <div className="live-indicator">
              <span className="live-dot" />
              <span>LIVE</span>
            </div>
          </div>

          {activePrograms.length > 0 && (
            <aside className="voucher-announcement" aria-label="Program voucher aktif">
              <div className="announcement-shimmer" />
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
                      <span className="announcement-program-value shine-blink-periodic">Rp{(prog.value || 0).toLocaleString("id-ID")}</span>
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
            {(["Santri", "Mahasiswa", "Guru/Dosen/Staff"] as Category[]).map(cat => (
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
            <div className="lb-month-indicator">
              📅 {selectedMonth === currentMonth ? "Kompetisi Bulan Ini" : `Arsip Kompetisi: ${selectedMonth}`}
              {selectedMonth !== currentMonth && (
                <button onClick={() => setSelectedMonth(currentMonth)} className="btn-back-current">
                  Kembali ke Sekarang
                </button>
              )}
            </div>
            {loading ? (
              <div className="lb-loading">Memuat peringkat...</div>
            ) : filteredRecords.length === 0 ? (
              <div className="lb-empty">Belum ada data untuk kategori ini.</div>
            ) : (
              <div className="lb-list">
                {filteredRecords.map((rec, idx) => {
                  const hasPointBump = animations.pointBump.has(rec.memberId);
                  const hasRankUp = animations.rankUp.has(rec.memberId);
                  const hasRankDown = animations.rankDown.has(rec.memberId);

                  const animClasses = [
                    hasPointBump ? "anim-point-bump" : "",
                    hasRankUp ? "anim-rank-up" : "",
                    hasRankDown ? "anim-rank-down" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={rec.memberId}
                      className={`lb-item ${!isAdmin && rec.memberId === member?.id ? 'is-me' : ''} ${idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : ''
                        } ${animClasses}`}
                    >
                      {/* Rank-up arrow indicator */}
                      {hasRankUp && (
                        <div className="rank-change-arrow up">▲</div>
                      )}
                      {hasRankDown && (
                        <div className="rank-change-arrow down">▼</div>
                      )}

                      <div className="lb-rank">{getRankBadge(idx + 1)}</div>
                      <div className="lb-name">
                        <span>{rec.memberName}</span>
                        {!isAdmin && rec.memberId === member?.id && <span className="me-badge">Kamu</span>}
                      </div>

                      {idx === 0 && <span className="prize-badge gold">Rp50.000</span>}
                      {idx === 1 && <span className="prize-badge silver">Rp25.000</span>}
                      {idx === 2 && <span className="prize-badge bronze">Rp15.000</span>}
                      <div className="lb-stats">
                        <span className={`pts ${hasPointBump ? "pts-flash" : ""}`}>
                          {rec.points} points
                          {hasPointBump && <span className="plus-indicator">+</span>}
                        </span>
                        <span className="tx">{rec.numberOfTransaction} transaksi</span>
                      </div>

                      {/* Particle burst overlay for point bump */}
                      {hasPointBump && (
                        <div className="particle-burst">
                          {[...Array(8)].map((_, i) => (
                            <span key={i} className={`particle p-${i}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!isAdmin && member && myRank > 0 && !loading && (
            <div className="my-rank-summary">
              <p>Posisi kamu saat ini: <strong>Peringkat {myRank}</strong></p>
            </div>
          )}

          {/* ─── Competition History Section ─── */}
          <div className="history-section">
            <div className="history-card">
              <h3>📜 Riwayat Kompetisi</h3>
              <p>Lihat hasil kompetisi bulan-bulan sebelumnya.</p>
              <div className="history-picker">
                <label htmlFor="month-select">Pilih Bulan:</label>
                <select
                  id="month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {historyMonths.map(m => {
                    const date = new Date(m + "-01");
                    const label = date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>
              </div>
            </div>
          </div>
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

        /* ── Prize Badges in List ── */
        .prize-badge {
          padding: 0.35rem 0.8rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          white-space: nowrap;
          color: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .prize-badge.gold { background: #EFBF04; }
        .prize-badge.silver { background: #C0C0C0; }
        .prize-badge.bronze { background: #a1795a; }
        
        /* ── Live indicator ── */
        .live-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.5rem;
          padding: 0.3rem 0.8rem;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #fff;
          text-transform: uppercase;
        }
        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 6px 2px rgba(74, 222, 128, 0.6);
          animation: livePulse 1.5s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }

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
          position: relative;
          overflow: hidden;
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
                      background 0.4s ease,
                      box-shadow 0.4s ease;
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
          position: relative;
          transition: transform 0.3s ease;
        }
        .lb-stats .tx {
          font-size: 0.85rem;
          color: #8d6e63;
        }

        /* ── Point Bump Animation ── */
        .anim-point-bump {
          animation: pointBumpCard 1.6s ease-out;
        }
        @keyframes pointBumpCard {
          0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
          15% {
            box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.5),
                        0 0 24px 8px rgba(74, 222, 128, 0.25);
            transform: scale(1.015);
          }
          40% {
            box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.3),
                        0 0 16px 4px rgba(74, 222, 128, 0.15);
            transform: scale(1.005);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
            transform: scale(1);
          }
        }

        .pts-flash {
          animation: ptsFlash 1.2s ease-out;
        }
        @keyframes ptsFlash {
          0% { transform: scale(1); color: #C51720; }
          20% { transform: scale(1.25); color: #16a34a; }
          50% { transform: scale(1.1); color: #16a34a; }
          100% { transform: scale(1); color: #C51720; }
        }

        .plus-indicator {
          position: absolute;
          right: -16px;
          top: -4px;
          font-size: 0.8rem;
          font-weight: 900;
          color: #16a34a;
          animation: plusFloat 1.2s ease-out forwards;
        }
        @keyframes plusFloat {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-18px); }
        }

        /* ── Particle burst ── */
        .particle-burst {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .particle {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #4ade80;
          animation: particleFly 1s ease-out forwards;
          opacity: 0;
        }
        .p-0 { animation-delay: 0s;    --px: -30px; --py: -20px; background: #fbbf24; }
        .p-1 { animation-delay: 0.05s; --px: 30px;  --py: -25px; background: #4ade80; }
        .p-2 { animation-delay: 0.1s;  --px: -20px; --py: 20px;  background: #f87171; }
        .p-3 { animation-delay: 0.08s; --px: 25px;  --py: 18px;  background: #60a5fa; }
        .p-4 { animation-delay: 0.03s; --px: -35px; --py: -5px;  background: #fbbf24; }
        .p-5 { animation-delay: 0.12s; --px: 35px;  --py: 5px;   background: #a78bfa; }
        .p-6 { animation-delay: 0.07s; --px: -10px; --py: -30px; background: #34d399; }
        .p-7 { animation-delay: 0.09s; --px: 15px;  --py: 28px;  background: #fb923c; }
        @keyframes particleFly {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          70% { opacity: 0.8; transform: translate(var(--px), var(--py)) scale(1.2); }
          100% { opacity: 0; transform: translate(calc(var(--px) * 1.5), calc(var(--py) * 1.5)) scale(0); }
        }

        /* ── Rank Up Animation ── */
        .anim-rank-up {
          animation: rankSlideUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes rankSlideUp {
          0% { transform: translateY(40px); opacity: 0.4; }
          60% { transform: translateY(-4px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }

        /* ── Rank Down Animation ── */
        .anim-rank-down {
          animation: rankSlideDown 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes rankSlideDown {
          0% { transform: translateY(-40px); opacity: 0.4; }
          60% { transform: translateY(4px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }

        /* ── Rank change arrow indicators ── */
        .rank-change-arrow {
          position: absolute;
          left: 6px;
          font-size: 0.6rem;
          font-weight: 900;
          pointer-events: none;
          animation: arrowFade 1.6s ease-out forwards;
        }
        .rank-change-arrow.up {
          top: 4px;
          color: #16a34a;
        }
        .rank-change-arrow.down {
          bottom: 4px;
          color: #dc2626;
        }
        @keyframes arrowFade {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
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
          position: relative;
          overflow: hidden;
        }
        .announcement-shimmer {
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 248, 200, 0.55) 35%,
            rgba(255, 215, 0, 0.3) 50%,
            rgba(255, 248, 200, 0.55) 65%,
            transparent 100%
          );
          animation: announcementShimmer 4s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        @keyframes announcementShimmer {
          0% { left: -100%; }
          50% { left: 100%; }
          100% { left: 100%; }
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
          display: inline-block;
        }
        .shine-blink-periodic {
          animation: textShinePeriodic 4s ease-in-out infinite;
        }
        @keyframes textShinePeriodic {
          0%, 20%, 100% { text-shadow: 0 0 0 rgba(255,215,0,0); transform: scale(1); }
          10% { text-shadow: 0 0 15px rgba(255,215,0,0.8), 0 0 25px rgba(255,223,0,0.5); transform: scale(1.1); }
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

        /* History Section */
        .history-section {
          margin-top: 2rem;
          padding-bottom: 2rem;
        }
        .history-card {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          border: 1.5px solid #000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .history-card h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: #2d241d;
          margin-bottom: 0.5rem;
        }
        .history-card p {
          font-size: 0.85rem;
          color: #8d6e63;
          margin-bottom: 1rem;
        }
        .history-picker {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .history-picker label {
          font-size: 0.9rem;
          font-weight: 700;
          color: #5d4037;
        }
        .history-picker select {
          padding: 0.6rem 1rem;
          border-radius: 10px;
          border: 1.5px solid #d4a373;
          background: #faf7f2;
          font-family: inherit;
          font-size: 0.9rem;
          color: #2d241d;
          cursor: pointer;
          flex: 1;
        }

        .lb-month-indicator {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: #fdf5e6;
          border-bottom: 1px solid #eee;
          font-size: 0.85rem;
          font-weight: 700;
          color: #8b4513;
        }
        .btn-back-current {
          background: #C51720;
          color: white;
          border: none;
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
