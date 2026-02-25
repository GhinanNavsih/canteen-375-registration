"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function AboutPage() {
  return (
    <div className="about-wrapper">
      <Navbar />
      <main className="about-main">
        <div className="about-container animate-fade-in">

          {/* Page Header */}
          <div className="about-page-header">
            <h1>Tentang Program</h1>
            <p>Kenali semua cara kamu bisa dapatkan hadiah dari Canteen 375!</p>
          </div>

          {/* Campaign 1: Monthly Competition */}
          <div className="about-card">
            <div className="about-card-inner-highlight">
              <div className="highlight-left">
                <span className="highlight-icon">🏆</span>
                <div>
                  <h2 className="highlight-title">Kompetisi Poin Bulanan</h2>
                  <p className="highlight-sub">Bersaing, kumpulkan poin, menangkan hadiah!</p>
                </div>
              </div>
              <span className="highlight-star">⭐</span>
            </div>

            <p className="about-section-desc">
              Setiap bulan, anggota yang berhasil mengumpulkan poin <strong>terbanyak</strong> akan
              mendapatkan reward eksklusif. 1 poin diperoleh dari setiap transaksi kelipatan Rp10.000 di Canteen 375.
            </p>

            <div className="prizes-list">
              <div className="prize-item">
                <div className="prize-rank">
                  <span className="prize-emoji">🥇</span>
                  <div>
                    <span className="prize-label">Juara 1</span>
                    <span className="prize-desc">Poin tertinggi bulan ini</span>
                  </div>
                </div>
                <span className="prize-badge gold">Rp25.000</span>
              </div>

              <div className="prize-item">
                <div className="prize-rank">
                  <span className="prize-emoji">🥈</span>
                  <div>
                    <span className="prize-label">Juara 2</span>
                    <span className="prize-desc">Poin tertinggi kedua</span>
                  </div>
                </div>
                <span className="prize-badge silver">Rp15.000</span>
              </div>

              <div className="prize-item">
                <div className="prize-rank">
                  <span className="prize-emoji">🥉</span>
                  <div>
                    <span className="prize-label">Juara 3</span>
                    <span className="prize-desc">Poin tertinggi ketiga</span>
                  </div>
                </div>
                <span className="prize-badge bronze">Rp10.000</span>
              </div>
            </div>

            <div className="about-note">
              <span>💡</span>
              <p>Peringkat diperbarui secara real-time. Pantau posisimu di halaman Leaderboard!</p>
            </div>
          </div>

          {/* Campaign 2: Milestone Vouchers */}
          <div className="about-card">
            <div className="about-card-header">
              <span>🎉</span>
              <h2>Kampanye Hadiah Poin</h2>
            </div>

            <p className="about-section-desc">
              Selain kompetisi, kamu juga bisa mendapatkan <strong>voucher cashback otomatis</strong> saat
              poin kamu mencapai ambang batas tertentu yang ditentukan oleh Canteen 375.
            </p>

            <div className="milestone-item">
              <div className="milestone-header">
                <span className="milestone-label">🎁 Cara Kerja Kampanye Poin</span>
              </div>
              <div className="milestone-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <p>Lakukan transaksi di Canteen 375 untuk mengumpulkan poin.</p>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <p>Saat poinmu mencapai ambang yang ditentukan, voucher cashback akan <strong>otomatis aktif</strong> di akunmu.</p>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <p>Buka halaman <strong>Vouchers</strong> dan tunjukkan kode voucher ke kasir!</p>
                </div>
              </div>
            </div>

            <div className="about-note">
              <span>⏳</span>
              <p>Perhatikan tanggal berlaku voucher. Voucher yang kedaluwarsa tidak dapat digunakan. (1 poin = Transaksi kelipatan Rp10.000)</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="about-actions-card">
            <Link href="/leaderboard" className="btn-primary-red">
              🏆 Lihat Peringkat Saya
            </Link>
            <Link href="/dashboard" className="btn-secondary-outline">
              ← Kembali ke Dashboard
            </Link>
          </div>

        </div>
      </main>

      <style jsx>{`
        .about-wrapper {
          min-height: 100vh;
          background: #C51720;
        }
        .about-main {
          padding: 2rem 1rem;
          display: flex;
          justify-content: center;
          background:
            radial-gradient(circle at top right, #faedcd, transparent),
            radial-gradient(circle at bottom left, #fefae0, transparent);
          min-height: calc(100vh - 65px);
        }
        .about-container {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Page Header */
        .about-page-header {
          text-align: center;
          color: white;
          margin-bottom: 0.5rem;
        }
        .about-page-header h1 {
          font-size: 1.8rem;
          font-weight: 700;
          text-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .about-page-header p {
          opacity: 0.9;
          font-size: 1rem;
          margin-top: 0.25rem;
        }

        /* Cards */
        .about-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          border: 1.5px solid #000;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        /* Inner highlight (like points-display) */
        .about-card-inner-highlight {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          background: #C51720;
          border-radius: 16px;
          color: white;
        }
        .highlight-left {
          display: flex;
          align-items: center;
          gap: 0.9rem;
        }
        .highlight-icon {
          font-size: 2rem;
        }
        .highlight-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0;
          line-height: 1.2;
        }
        .highlight-sub {
          font-size: 0.82rem;
          opacity: 0.88;
          margin-top: 0.15rem;
        }
        .highlight-star {
          font-size: 2.5rem;
        }

        /* Section description */
        .about-section-desc {
          font-size: 0.95rem;
          color: #5d4037;
          line-height: 1.6;
        }
        .about-section-desc strong {
          color: #2d241d;
        }

        /* Card section header row */
        .about-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .about-card-header span {
          font-size: 1.6rem;
        }
        .about-card-header h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #2d241d;
          margin: 0;
        }

        /* Prizes list */
        .prizes-list {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .prize-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #faf7f2;
          border: 1.5px solid #d4a373;
          border-radius: 14px;
          padding: 1rem 1.25rem;
          gap: 1rem;
        }
        .prize-rank {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .prize-emoji {
          font-size: 1.6rem;
        }
        .prize-label {
          display: block;
          font-weight: 700;
          color: #2d241d;
          font-size: 1rem;
        }
        .prize-desc {
          display: block;
          font-size: 0.78rem;
          color: #8d6e63;
          margin-top: 0.1rem;
        }
        .prize-badge {
          padding: 0.35rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 700;
          white-space: nowrap;
          color: white;
        }
        .prize-badge.gold {
          background: #EFBF04;
        }
        .prize-badge.silver {
          background: #C0C0C0;
        }
        .prize-badge.bronze {
          background: #a1795a;
        }

        /* Milestone */
        .milestone-item {
          background: #faf7f2;
          border: 1.5px solid #d4a373;
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .milestone-label {
          font-weight: 700;
          color: #2d241d;
          font-size: 0.95rem;
        }
        .milestone-steps {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .step {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
        }
        .step-number {
          min-width: 28px;
          height: 28px;
          background: #C51720;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          flex-shrink: 0;
        }
        .step p {
          font-size: 0.9rem;
          color: #5d4037;
          line-height: 1.5;
          margin: 0;
          padding-top: 0.15rem;
        }
        .step p strong {
          color: #2d241d;
        }

        /* Info note */
        .about-note {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          background: #fff3e0;
          border-left: 4px solid #d4a373;
          border-radius: 8px;
          padding: 0.8rem 1rem;
        }
        .about-note span {
          font-size: 1rem;
          flex-shrink: 0;
          padding-top: 0.05rem;
        }
        .about-note p {
          font-size: 0.85rem;
          color: #5d4037;
          line-height: 1.5;
          margin: 0;
        }

        /* Action buttons card */
        .about-actions-card {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          border: 1.5px solid #000;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .btn-primary-red {
          display: block;
          width: 100%;
          padding: 1rem;
          background: #C51720;
          color: white;
          border-radius: 12px;
          font-weight: 700;
          font-size: 1rem;
          text-align: center;
          text-decoration: none;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(197, 23, 32, 0.25);
        }
        .btn-primary-red:hover {
          background: #a81219;
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(197, 23, 32, 0.35);
        }
        .btn-secondary-outline {
          display: block;
          width: 100%;
          padding: 1rem;
          background: white;
          color: #C51720;
          border: 1.5px solid #C51720;
          border-radius: 12px;
          font-weight: 700;
          font-size: 1rem;
          text-align: center;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .btn-secondary-outline:hover {
          background: #fff0f1;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
