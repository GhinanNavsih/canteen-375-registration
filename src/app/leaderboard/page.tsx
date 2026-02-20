"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { CompetitionRecord, Member, Category } from "@/types/member";

export default function LeaderboardPage() {
  const { member, loading: sessionLoading } = useMember();
  const [records, setRecords] = useState<CompetitionRecord[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [selectedCategory, setSelectedCategory] = useState<Category>("Santri");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const currentMonth = new Date().toISOString().slice(0, 7); // yyyy-mm

  useEffect(() => {
    if (!sessionLoading && !member) {
      router.push("/login");
      return;
    }

    if (member?.category) {
      setSelectedCategory(member.category);
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch all members once (to get categories and clean names)
        const membersSnap = await getDocs(collection(db, "Members"));
        const membersMap: Record<string, Member> = {};
        membersSnap.forEach(doc => {
          membersMap[doc.id] = { id: doc.id, ...doc.data() } as Member;
        });
        setMembers(membersMap);

        // 2. Fetch the current month's competition records
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
        }
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };

    if (member) {
      fetchData();
    }
  }, [member, sessionLoading, router, currentMonth]);

  if (sessionLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  // Filter records by category and sort by points
  const filteredRecords = records
    .filter(r => {
      const m = members[r.memberId];
      return m?.category === selectedCategory;
    })
    .sort((a, b) => b.points - a.points);

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
                    className={`lb-item ${rec.memberId === member?.id ? 'is-me' : ''}`}
                  >
                    <div className="lb-rank">{getRankBadge(idx + 1)}</div>
                    <div className="lb-name">
                      <span>{rec.memberName}</span>
                      {rec.memberId === member?.id && <span className="me-badge">Kamu</span>}
                    </div>
                    <div className="lb-stats">
                      <span className="pts">{rec.points} pts</span>
                      <span className="tx">{rec.numberOfTransaction} tx</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {myRank > 0 && !loading && (
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
        }
        .leaderboard-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
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
      `}</style>
    </div>
  );
}
