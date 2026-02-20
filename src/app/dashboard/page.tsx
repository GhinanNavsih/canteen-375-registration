"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useMember } from "@/hooks/useMember";
import Navbar from "@/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { Member } from "@/types/member";

const MILESTONES = [
  { points: 10, label: "Free Drink", icon: "🥤" },
  { points: 50, label: "10% Voucher", icon: "🎟️" },
  { points: 100, label: "50k Voucher", icon: "💰" },
  { points: 250, label: "Free Lunch + Merch", icon: "🎁" },
];

export default function DashboardPage() {
  const { member, loading: sessionLoading, logoutMember } = useMember();
  const [liveMember, setLiveMember] = useState<Member | null>(null);
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
      return () => unsub();
    }
  }, [member, sessionLoading, router]);

  if (sessionLoading || !member) {
    return <div className="loading-screen">Loading...</div>;
  }

  const currentPoints = liveMember?.points || member.points || 0;
  const nextMilestone = MILESTONES.find((m) => m.points > currentPoints) || MILESTONES[MILESTONES.length - 1];
  const prevMilestonePoints = [...MILESTONES].reverse().find(m => m.points <= currentPoints)?.points || 0;

  const progress = Math.min(100, (currentPoints / nextMilestone.points) * 100);

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

          <div className="milestones-card">
            <h3>Milestones & Perks</h3>
            <div className="progress-section">
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="progress-text">
                {currentPoints >= nextMilestone.points
                  ? "Semua milestone tercapai! 🎉"
                  : `${nextMilestone.points - currentPoints} points lagi untuk mendapat ${nextMilestone.label}`}
              </p>
            </div>

            <div className="milestones-grid">
              {MILESTONES.map((m, idx) => (
                <div
                  key={idx}
                  className={`milestone-item ${currentPoints >= m.points ? 'completed' : ''}`}
                >
                  <div className="m-icon">{m.icon}</div>
                  <div className="m-info">
                    <span className="m-label">{m.label}</span>
                    <span className="m-points">{m.points} Points</span>
                  </div>
                  {currentPoints >= m.points && <div className="check">✓</div>}
                </div>
              ))}
            </div>
          </div>

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
        .profile-card, .milestones-card, .info-grid {
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
        .milestones-card h3 {
          margin-bottom: 1.5rem;
          color: #2d241d;
        }
        .progress-section {
          margin-bottom: 2rem;
        }
        .progress-bar-container {
          height: 12px;
          background: #f0f0f0;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 0.8rem;
          border: 1px solid #ddd;
        }
        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #C51720, #e53935);
          transition: width 0.5s ease-out;
        }
        .progress-text {
          font-size: 0.9rem;
          color: #5d4037;
          font-weight: 500;
        }
        .milestones-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .milestone-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border-radius: 12px;
          border: 1.5px solid #eee;
          transition: all 0.2s;
        }
        .milestone-item.completed {
          background: #f1f8e9;
          border-color: #8bc34a;
        }
        .m-icon {
          font-size: 1.5rem;
        }
        .m-info {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .m-label {
          font-weight: 600;
          color: #2d241d;
        }
        .m-points {
          font-size: 0.85rem;
          color: #7d6a5e;
        }
        .check {
          color: #4caf50;
          font-weight: 700;
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
