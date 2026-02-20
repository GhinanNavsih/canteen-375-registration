"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMember } from "@/context/MemberContext";

export default function Navbar() {
  const pathname = usePathname();
  const { member, logoutMember } = useMember();

  if (!member) return null;

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-links">
          <Link href="/dashboard" className={`nav-link ${isActive("/dashboard") ? "active" : ""}`}>
            Dashboard
          </Link>
          <Link href="/leaderboard" className={`nav-link ${isActive("/leaderboard") ? "active" : ""}`}>
            Leaderboard
          </Link>
        </div>
        <button onClick={logoutMember} className="btn-logout">
          Logout
        </button>
      </div>
      <style jsx>{`
        .navbar {
          width: 100%;
          background: white;
          padding: 1rem 2rem;
          border-bottom: 1.5px solid #000;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .nav-container {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .nav-links {
          display: flex;
          gap: 2rem;
        }
        .nav-link {
          text-decoration: none;
          color: #5d4037;
          font-weight: 600;
          font-size: 1rem;
          padding: 0.5rem 0;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .nav-link:hover {
          color: #C51720;
        }
        .nav-link.active {
          color: #C51720;
          border-bottom-color: #C51720;
        }
        .btn-logout {
          background: #fdf2f2;
          color: #C51720;
          border: 1px solid #C51720;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-logout:hover {
          background: #C51720;
          color: white;
        }
      `}</style>
    </nav>
  );
}
