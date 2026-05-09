"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMember } from "@/context/MemberContext";

export default function Navbar() {
  const pathname = usePathname();
  const { member, isAdmin, loading, logoutMember } = useMember();
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setIsTesting(localStorage.getItem("zTestingMode") === "true");
  }, []);

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + "/");
  };

  const handleSecretClick = (e: React.MouseEvent) => {
    if (e.detail === 5) {
      const current = localStorage.getItem("zTestingMode") === "true";
      localStorage.setItem("zTestingMode", (!current).toString());
      alert(`Testing mode ${!current ? 'ENABLED' : 'DISABLED'}. Refreshing page...`);
      window.location.reload();
    }
  };

  return (
    <>
      <nav className="navbar">
        <div 
          onClick={handleSecretClick}
          style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '40px', zIndex: 9999, cursor: 'default' }}
        />
        <div className="nav-container">
          <div className="nav-links">
            {/* ── Admin links ── */}
            {!loading && isAdmin && (
              <>
                <Link href="/admin/menu" className={`nav-link ${isActive("/admin/menu") ? "active" : ""}`}>
                  🍽️ Menu Manager
                </Link>
                <Link href="/admin/menu-display" className={`nav-link ${isActive("/admin/menu-display") ? "active" : ""}`}>
                  📺 Menu Display
                </Link>
                <Link href="/leaderboard" className={`nav-link ${isActive("/leaderboard") ? "active" : ""}`}>
                  🏆 Leaderboard
                </Link>
              </>
            )}

            {/* ── Member links ── */}
            {!loading && !isAdmin && member && (
              <>
                <Link href="/dashboard" className={`nav-link ${isActive("/dashboard") ? "active" : ""}`}>
                  Dasboard
                </Link>
                <Link href="/order" className={`nav-link ${isActive("/order") ? "active" : ""}`}>
                  🛒 Pesanan
                </Link>
                <Link href="/leaderboard" className={`nav-link ${isActive("/leaderboard") ? "active" : ""}`}>
                  Papan Peringkat
                </Link>
                <Link href="/vouchers" className={`nav-link ${isActive("/vouchers") ? "active" : ""}`}>
                  Voucher
                </Link>
                <Link href="/history" className={`nav-link ${isActive("/history") ? "active" : ""}`}>
                  Riwayat
                </Link>
              </>
            )}

            {/* ── Public links (for non-logged-in users) ── */}
            {!loading && !isAdmin && !member && (
              <Link href="/about" className={`nav-link ${isActive("/about") ? "active" : ""}`}>
                  Tentang
              </Link>
            )}
          </div>

          {/* ── Auth button ── */}
          {loading ? (
            <div className="nav-loading-spinner" />
          ) : (member || isAdmin ? (
            <button onClick={logoutMember} className="btn-auth">
              Logout
            </button>
          ) : (
            <Link href="/login" className="btn-auth">
              Login
            </Link>
          ))}
        </div>
      </nav>
      {isTesting && (
        <div className="testing-ribbon">
          <div className="ribbon-text">
            {Array(15).fill("TESTING MODE").join(" • ")}
          </div>
        </div>
      )}
    </>
  );
}
