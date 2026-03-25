"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { MenuItem, OptionGroup } from "@/types/menu";

export default function MenuDisplayPage() {
  const { member, isAdmin, loading: sessionLoading } = useMember();
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!sessionLoading && !member && !isAdmin) {
      router.push("/login?redirect=/admin/menu-display");
    }
  }, [member, isAdmin, sessionLoading, router]);

  useEffect(() => {
    if (sessionLoading || (!member && !isAdmin)) return;
    const fetchData = async () => {
      try {
        const snap = await getDocs(collection(db, "Canteens", "canteen375", "MenuCollection"));
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            category:
              data.category && typeof data.category === "string" && data.category.trim() !== ""
                ? data.category
                : "Lainnya",
          } as MenuItem;
        });

        const configSnap = await getDoc(doc(db, "Canteens", "canteen375", "Metadata", "MenuConfig"));
        let sortedCats: string[] = [];
        const distinctCats = Array.from(new Set(items.map((i) => i.category)));
        if (configSnap.exists()) {
          const stored = configSnap.data().categoryOrder || [];
          sortedCats = stored.filter((c: string) => distinctCats.includes(c));
          const missing = distinctCats.filter((c) => !sortedCats.includes(c));
          sortedCats = [...sortedCats, ...missing];
        } else {
          sortedCats = distinctCats.sort();
        }

        setMenuItems(
          items.sort((a, b) => {
            const orderDiff = (a.order ?? 0) - (b.order ?? 0);
            return orderDiff !== 0 ? orderDiff : a.namaMenu.localeCompare(b.namaMenu);
          })
        );
        setCategoryOrder(sortedCats);

        const ogSnap = await getDocs(collection(db, "Canteens", "canteen375", "OptionGroups"));
        setOptionGroups(
          ogSnap.docs.map((d) => {
            const data = d.data();
            return {
              ...data,
              id: d.id,
              options: data.options || [],
              linkedItemIds: data.linkedItemIds || [],
              linkedMenuItems: data.linkedMenuItems || [],
              selectionRule: data.selectionRule || "optional",
              ruleType: data.ruleType || "exactly",
              ruleCount: data.ruleCount || 1,
            } as OptionGroup;
          })
        );
      } catch (err) {
        console.error("Error fetching menu:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [member, isAdmin, sessionLoading]);

  const recommended = useMemo(() => {
    const manual = menuItems.filter((i) => i.isRecommended);
    const others = menuItems.filter((i) => !i.isRecommended);
    const food = others.filter((i) => i.isMakanan);
    const drink = others.filter((i) => !i.isMakanan);
    return [...manual, ...food, ...drink].slice(0, 6);
  }, [menuItems]);

  const categorisedGroups = useMemo(() => {
    const groups: { category: string; items: MenuItem[] }[] = [];
    categoryOrder.forEach((cat) => {
      const items = menuItems.filter((i) => i.category === cat);
      if (items.length > 0) groups.push({ category: cat, items });
    });
    return groups;
  }, [menuItems, categoryOrder]);

  const hasOptions = (item: MenuItem) => {
    return optionGroups.some(
      (g) => g.linkedItemIds.includes(item.id) || (g.linkedMenuItems || []).includes(item.namaMenu)
    );
  };

  const formatPrice = (price: number) => `Rp${(price || 0).toLocaleString("id-ID")}`;

  if (loading || sessionLoading) {
    return (
      <>
        <style jsx global>{`
          .mdl-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #faf7f2;
            gap: 1rem;
            font-family: 'Inter', sans-serif;
          }
          .mdl-loading p {
            color: #8d6e63;
            font-weight: 600;
            font-size: 0.95rem;
          }
          .mdl-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #ece8e3;
            border-top-color: #C51720;
            border-radius: 50%;
            animation: mdl-spin 0.8s linear infinite;
          }
          @keyframes mdl-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div className="mdl-loading">
          <div className="mdl-spinner" />
          <p>Memuat menu…</p>
        </div>
      </>
    );
  }

  /* ── Card renderer (inline to avoid styled-jsx scoping issues) ── */
  const renderCard = (item: MenuItem, keyPrefix: string = "") => (
    <div className="mdl-card" key={`${keyPrefix}${item.id}`}>
      <div className="mdl-card-img-wrap">
        <img
          src={item.imagePath || "/Logo Canteen 375 (2).png"}
          alt={item.namaMenu}
          className="mdl-card-img"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png";
          }}
        />
        {hasOptions(item) && <span className="mdl-badge">Bisa Custom</span>}
      </div>
      <div className="mdl-card-body">
        <div className="mdl-card-header">
          <h3 className="mdl-card-name">{item.namaMenu}</h3>
          <span className="mdl-card-price">{formatPrice(item.harga)}</span>
        </div>
        {item.menuDescription && (
          <p className="mdl-card-desc">{item.menuDescription}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ── ALL STYLES GLOBAL so they apply to everything ── */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Inter:wght@400;500;600;700;800&display=swap');

        /* ── Page Shell ── */
        .mdl-page {
          min-height: 100vh;
          background: #faf7f2;
          padding: 2.5rem 2rem 3rem;
          max-width: 680px;
          margin: 0 auto;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* ── Header ── */
        .mdl-header {
          text-align: center;
          margin-bottom: 2.5rem;
          padding: 1rem 0;
        }
        .mdl-logo {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          object-fit: cover;
          margin: 0 auto 0.75rem;
          display: block;
          border: 3px solid #ece8e3;
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        .mdl-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.75rem;
          font-weight: 900;
          color: #2d241d;
          margin: 0 0 0.2rem;
          letter-spacing: -0.02em;
        }
        .mdl-subtitle {
          font-size: 0.8rem;
          color: #8d6e63;
          font-weight: 600;
          margin: 0;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        /* ── Section Labels ── */
        .mdl-section-label {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .mdl-section-label h2 {
          font-family: 'Playfair Display', serif;
          font-size: 1.3rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0;
          white-space: nowrap;
        }
        .mdl-section-line {
          flex: 1;
          height: 1.5px;
          background: linear-gradient(to right, #d4c8bb, transparent);
        }

        /* ── Card Grid ── */
        .mdl-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          margin-bottom: 2.5rem;
        }
        @media (max-width: 600px) {
          .mdl-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* ── Product Card ── */
        .mdl-card {
          background: transparent;
          border-radius: 16px;
          overflow: visible;
          border: none;
          box-shadow: none;
          display: flex;
          flex-direction: column;
        }

        /* ── Image Area ── */
        .mdl-card-img-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          background: #f5dcc3;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .mdl-card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* ── "Bisa Custom" Badge ── */
        .mdl-badge {
          position: absolute;
          top: 0.5rem;
          left: 0.5rem;
          background: rgba(45, 36, 29, 0.85);
          color: white;
          font-size: 0.6rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          backdrop-filter: blur(4px);
          letter-spacing: 0.03em;
        }

        /* ── Card Body ── */
        .mdl-card-body {
          padding: 0.75rem 0.25rem 0.85rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        /* ── Name & Price Row ── */
        .mdl-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.4rem;
        }
        .mdl-card-name {
          font-size: 0.85rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0;
          line-height: 1.3;
          flex: 1;
          font-style: italic;
          font-family: 'Playfair Display', serif;
        }
        .mdl-card-price {
          font-size: 0.8rem;
          font-weight: 800;
          color: #8d6e63;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Description ── */
        .mdl-card-desc {
          font-size: 0.7rem;
          color: #a0917e;
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* ── Divider ── */
        .mdl-divider {
          width: 50px;
          height: 3px;
          background: linear-gradient(to right, #C51720, #d4c8bb);
          border-radius: 3px;
          margin: 0 auto 2.5rem;
        }

        /* ── Footer ── */
        .mdl-footer {
          text-align: center;
          padding: 2rem 0 1rem;
          border-top: 1.5px solid #ece8e3;
          margin-top: 1rem;
        }
        .mdl-footer p {
          font-size: 0.75rem;
          color: #b0a89e;
          margin: 0;
          font-weight: 500;
        }
        .mdl-footer .heart { color: #C51720; }
      `}</style>

      <div className="mdl-page">
        {/* ── Header ── */}
        <header className="mdl-header">
          <img src="/Logo Canteen 375 (2).png" alt="Canteen 375" className="mdl-logo" />
          <h1 className="mdl-title">Canteen 375</h1>
          <p className="mdl-subtitle">Menu Kami</p>
        </header>

        {/* ── Recommended ── */}
        {recommended.length > 0 && (
          <>
            <div className="mdl-section-label">
              <h2>⭐ Rekomendasi</h2>
              <div className="mdl-section-line" />
            </div>
            <div className="mdl-grid">
              {recommended.map((item) => renderCard(item, "rec-"))}
            </div>
            <div className="mdl-divider" />
          </>
        )}

        {/* ── Categories ── */}
        {categorisedGroups.map((group) => (
          <div key={group.category}>
            <div className="mdl-section-label">
              <h2>{group.category}</h2>
              <div className="mdl-section-line" />
            </div>
            <div className="mdl-grid">
              {group.items.map((item) => renderCard(item))}
            </div>
          </div>
        ))}

        {/* ── Footer ── */}
        <footer className="mdl-footer">
          <p>Dibuat dengan <span className="heart">♥</span> oleh Canteen 375</p>
        </footer>
      </div>
    </>
  );
}
