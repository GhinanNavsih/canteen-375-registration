"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMember } from "@/context/MemberContext";

export default function Navbar() {
  const pathname = usePathname();
  const { member, logoutMember } = useMember();

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + "/");
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-links">
          {member && (
            <Link href="/about" className={`nav-link ${isActive("/about") ? "active" : ""}`}>
              About
            </Link>
          )}
          <Link href="/dashboard" className={`nav-link ${isActive("/dashboard") ? "active" : ""}`}>
            Dashboard
          </Link>
          {member && (
            <Link href="/leaderboard" className={`nav-link ${isActive("/leaderboard") ? "active" : ""}`}>
              Leaderboard
            </Link>
          )}
          <Link href="/vouchers" className={`nav-link ${isActive("/vouchers") ? "active" : ""}`}>
            Vouchers
          </Link>
        </div>
        {member ? (
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
