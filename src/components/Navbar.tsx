"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMember } from "@/context/MemberContext";

export default function Navbar() {
  const pathname = usePathname();
  const { member, isAdmin, logoutMember } = useMember();

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + "/");
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-links">
          {/* ── Admin links ── */}
          {isAdmin && (
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
          {!isAdmin && member && (
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
            </>
          )}

          {/* ── Public links (for non-logged-in users) ── */}
          {!isAdmin && !member && (
            <Link href="/about" className={`nav-link ${isActive("/about") ? "active" : ""}`}>
                Tentang
            </Link>
          )}
        </div>

        {/* ── Auth button ── */}
        {member || isAdmin ? (
          <button onClick={logoutMember} className="btn-auth">
            Logout
          </button>
        ) : (
          <Link href="/login" className="btn-auth">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
