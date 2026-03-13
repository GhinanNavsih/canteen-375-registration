"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { useBasket } from "@/context/BasketContext";
import Navbar from "@/components/Navbar";
import { MenuItem } from "@/types/menu";

export default function OrderPage() {
  const { member, loading: sessionLoading } = useMember();
  const { basket, totalItems, addToBasket } = useBasket();
  const router = useRouter();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  // Fetch menu from Firestore
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const snap = await getDocs(collection(db, "Canteens", "canteen375", "MenuCollection"));
        const items: MenuItem[] = snap.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        } as MenuItem));
        setMenuItems(items);
      } catch (err) {
        console.error("Error fetching menu:", err);
      } finally {
        setLoadingMenu(false);
      }
    };
    fetchMenu();
  }, []);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!sessionLoading && !member) router.push("/login");
  }, [member, sessionLoading, router]);

  // Recommended logic:
  // 1. Prioritise items where isRecommended is true
  // 2. Fallback to prioritising food items
  const recommended = useMemo(() => {
    const manualRecommended = menuItems.filter((i) => i.isRecommended);
    const others = menuItems.filter((i) => !i.isRecommended);

    // Sort others by food first
    const food = others.filter((i) => i.isMakanan);
    const drink = others.filter((i) => !i.isMakanan);

    return [...manualRecommended, ...food, ...drink].slice(0, 6);
  }, [menuItems]);

  // Group remaining items by category
  const categorised = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    menuItems.forEach((item) => {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    });
    return map;
  }, [menuItems]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleAdd = (item: MenuItem) => {
    addToBasket(item);
    setAddedItems((prev) => new Set(prev).add(item.id));
    setTimeout(() => {
      setAddedItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 800);
  };

  const formatPrice = (price: number) =>
    `Rp${price.toLocaleString("id-ID")}`;

  const basketCount = basket.find((b) => b.menuItem.id)
    ? totalItems
    : 0;

  if (sessionLoading || loadingMenu) {
    return (
      <div className="order-page">
        <Navbar />
        <div className="order-loading">
          <div className="loading-spinner" />
          <p>Memuat menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="order-page">
      <Navbar />

      <main className="order-main">
        {/* ── Hero header ── */}
        <div className="order-header">
          <div className="order-header-text">
            <h1>Menu Hari Ini</h1>
            <p>Pesan langsung, ambil tanpa antri!</p>
          </div>
        </div>

        <div className="order-content">
          {/* ── Recommended Section ── */}
          <section className="menu-section">
            <div className="section-title-row">
              <h2 className="section-title">🌟 Rekomendasi Untuk Kamu</h2>
            </div>
            <div className="recommended-grid">
              {recommended.map((item) => (
                <MenuCard
                  key={`rec-${item.id}`}
                  item={item}
                  onAdd={() => handleAdd(item)}
                  added={addedItems.has(item.id)}
                  formatPrice={formatPrice}
                  compact
                />
              ))}
            </div>
          </section>

          {/* ── Categorised Sections ── */}
          {Array.from(categorised.entries()).map(([category, items]) => {
            const isExpanded = expandedCategories.has(category);
            const displayed = isExpanded ? items : items.slice(0, 3);
            const hasMore = items.length > 3;

            return (
              <section key={`cat-${category}`} className="menu-section">
                <div className="section-title-row">
                  <h2 className="section-title">
                    {category}
                  </h2>
                  {hasMore && (
                    <button
                      className="see-all-btn"
                      onClick={() => toggleCategory(category)}
                    >
                      {isExpanded ? "Sembunyikan ▲" : "Lihat selengkapnya ▼"}
                    </button>
                  )}
                </div>

                <div className="category-list">
                  {displayed.map((item) => (
                    <MenuListItem
                      key={`list-${item.id}`}
                      item={item}
                      onAdd={() => handleAdd(item)}
                      added={addedItems.has(item.id)}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {/* ── Floating Basket Button ── */}
      {totalItems > 0 && (
        <button
          className="basket-fab"
          onClick={() => router.push("/order/basket")}
        >
          <span className="basket-fab-icon">🛒</span>
          <span className="basket-fab-label">Lihat Pesanan</span>
          <span className="basket-fab-count">{totalItems}</span>
        </button>
      )}

      <style jsx>{`
        .order-page {
          min-height: 100vh;
          background: #f9f5f0;
        }
        .order-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          gap: 1rem;
          color: #5d4037;
          font-weight: 600;
        }
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #d4a373;
          border-top-color: #C51720;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .order-main {
          padding-bottom: 120px;
        }
        .order-header {
          background: linear-gradient(135deg, #C51720 0%, #8b0000 100%);
          padding: 2rem 1.5rem 3rem;
          position: relative;
          overflow: hidden;
        }
        .order-header::after {
          content: '';
          position: absolute;
          bottom: -20px;
          left: 0; right: 0;
          height: 40px;
          background: #f9f5f0;
          border-radius: 40px 40px 0 0;
        }
        .order-header-text h1 {
          font-size: 1.8rem;
          font-weight: 800;
          color: white;
          margin: 0 0 0.25rem;
        }
        .order-header-text p {
          font-size: 0.95rem;
          color: rgba(255,255,255,0.8);
          margin: 0;
        }

        .order-content {
          padding: 0.5rem 1rem;
          max-width: 700px;
          margin: 0 auto;
        }

        .menu-section {
          margin-bottom: 2rem;
        }
        .section-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .section-title {
          font-size: 1.15rem;
          font-weight: 800;
          color: #2d241d;
        }
        .see-all-btn {
          background: none;
          border: 1.5px solid #C51720;
          color: #C51720;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.3rem 0.75rem;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .see-all-btn:hover {
          background: #C51720;
          color: white;
        }

        /* Recommended Grid — 2 columns */
        .recommended-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.85rem;
        }

        /* Category list — full-width rows */
        .category-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        /* ── Floating Basket ── */
        .basket-fab {
          position: fixed;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #C51720, #8b0000);
          color: white;
          border: none;
          border-radius: 50px;
          padding: 0.9rem 2rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-family: inherit;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(197,23,32,0.45);
          animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 200;
          white-space: nowrap;
        }
        .basket-fab:hover {
          transform: translateX(-50%) translateY(-3px);
          box-shadow: 0 12px 30px rgba(197,23,32,0.5);
        }
        .basket-fab-icon { font-size: 1.2rem; }
        .basket-fab-count {
          background: white;
          color: #C51720;
          border-radius: 50%;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 800;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(30px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ── Compact card for Recommended grid ── */
function MenuCard({
  item, onAdd, added, formatPrice, compact,
}: {
  item: MenuItem;
  onAdd: () => void;
  added: boolean;
  formatPrice: (p: number) => string;
  compact?: boolean;
}) {
  return (
    <div className="menu-card">
      <div className="card-image-wrap">
        <img
          src={item.imagePath || "/placeholder-food.png"}
          alt={item.namaMenu}
          className="card-image"
          onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
        />
        <span className="card-badge">{item.isMakanan ? "🍽️ Makanan" : "🥤 Minuman"}</span>
      </div>
      <div className="card-body">
        <p className="card-name">{item.namaMenu}</p>
        {item.menuDescription && (
          <p className="card-desc">{item.menuDescription}</p>
        )}
        <div className="card-footer">
          <span className="card-price">{formatPrice(item.harga)}</span>
          <button
            className={`add-btn ${added ? "added" : ""}`}
            onClick={onAdd}
          >
            {added ? "✓" : "+"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .menu-card {
          background: white;
          border-radius: 16px;
          overflow: hidden;
          border: 1.5px solid #ece8e3;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .menu-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        .card-image-wrap {
          position: relative;
          width: 100%;
          padding-top: 70%;
          overflow: hidden;
          background: #f5f0eb;
        }
        .card-image {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          transition: transform 0.3s;
        }
        .menu-card:hover .card-image { transform: scale(1.05); }
        .card-badge {
          position: absolute;
          top: 0.5rem; left: 0.5rem;
          background: rgba(0,0,0,0.55);
          color: white;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 20px;
          backdrop-filter: blur(4px);
        }
        .card-body {
          padding: 0.75rem;
        }
        .card-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: #2d241d;
          margin: 0 0 0.2rem;
          line-height: 1.3;
        }
        .card-desc {
          font-size: 0.75rem;
          color: #8d6e63;
          margin: 0 0 0.5rem;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .card-price {
          font-weight: 800;
          font-size: 0.9rem;
          color: #C51720;
        }
        .add-btn {
          width: 30px; height: 30px;
          border-radius: 50%;
          border: none;
          font-size: 1.2rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          background: #C51720;
          color: white;
        }
        .add-btn.added { background: #2e7d32; }
        .add-btn:hover { transform: scale(1.1); }
      `}</style>
    </div>
  );
}

/* ── Full-width list item for category sections ── */
function MenuListItem({
  item, onAdd, added, formatPrice,
}: {
  item: MenuItem;
  onAdd: () => void;
  added: boolean;
  formatPrice: (p: number) => string;
}) {
  return (
    <div className="list-item">
      <img
        src={item.imagePath || "/placeholder-food.png"}
        alt={item.namaMenu}
        className="list-image"
        onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
      />
      <div className="list-body">
        <p className="list-name">{item.namaMenu}</p>
        {item.menuDescription && (
          <p className="list-desc">{item.menuDescription}</p>
        )}
        <span className="list-price">{formatPrice(item.harga)}</span>
      </div>
      <button
        className={`add-btn-lg ${added ? "added" : ""}`}
        onClick={onAdd}
      >
        {added ? "✓" : "+"}
      </button>

      <style jsx>{`
        .list-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: white;
          border-radius: 16px;
          padding: 0.85rem;
          border: 1.5px solid #ece8e3;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          transition: box-shadow 0.2s;
        }
        .list-item:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
        .list-image {
          width: 80px; height: 80px;
          border-radius: 12px;
          object-fit: cover;
          flex-shrink: 0;
          background: #f5f0eb;
        }
        .list-body {
          flex: 1;
          min-width: 0;
        }
        .list-name {
          font-size: 0.95rem;
          font-weight: 700;
          color: #2d241d;
          margin: 0 0 0.25rem;
        }
        .list-desc {
          font-size: 0.8rem;
          color: #8d6e63;
          margin: 0 0 0.4rem;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .list-price {
          font-weight: 800;
          font-size: 0.95rem;
          color: #C51720;
        }
        .add-btn-lg {
          width: 38px; height: 38px;
          border-radius: 50%;
          border: none;
          font-size: 1.4rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
          background: #C51720;
          color: white;
          box-shadow: 0 4px 10px rgba(197,23,32,0.3);
        }
        .add-btn-lg.added { background: #2e7d32; }
        .add-btn-lg:hover { transform: scale(1.1); }
      `}</style>
    </div>
  );
}
