"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { MenuItem, OptionGroup } from "@/types/menu";
import { motion, AnimatePresence } from "framer-motion";

export default function MenuDisplayPage() {
  const { member, isAdmin, loading: sessionLoading } = useMember();
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [recommendedOrder, setRecommendedOrder] = useState<string[]>([]);
  const [recommendedLimit, setRecommendedLimit] = useState<number>(6);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; prefix: string } | null>(null);

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
        const [menuSnap, ogSnap, configSnap] = await Promise.all([
          getDocs(collection(db, "Canteens", "canteen375", "MenuCollection")),
          getDocs(collection(db, "Canteens", "canteen375", "OptionGroups")),
          getDoc(doc(db, "Canteens", "canteen375", "Metadata", "MenuConfig"))
        ]);

        const items = menuSnap.docs.map((d) => {
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

        const groups = ogSnap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            options: (data.options || []).map((opt: any) => ({
              ...opt,
              additionalPrice: opt.additionalPrice ?? opt.priceAdjustment ?? 0,
            })),
            linkedItemIds: data.linkedItemIds || [],
            linkedMenuItems: data.linkedMenuItems || [],
          } as OptionGroup;
        });

        let sortedCats: string[] = [];
        const distinctCats = Array.from(new Set(items.map((i) => i.category)));
        if (configSnap.exists()) {
          const configData = configSnap.data();
          const stored = configData.categoryOrder || [];
          sortedCats = stored.filter((c: string) => distinctCats.includes(c));
          const missing = distinctCats.filter((c) => !sortedCats.includes(c));
          sortedCats = [...sortedCats, ...missing];
          setRecommendedOrder(configData.recommendedOrder || []);
          setRecommendedLimit(configData.recommendedLimit ?? 6);
        } else {
          sortedCats = distinctCats.sort();
        }

        const visibleItems = items.filter((i) => i.showMenu !== false);
        setMenuItems(
          visibleItems.sort((a, b) => {
            const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            return orderDiff !== 0 ? orderDiff : a.namaMenu.localeCompare(b.namaMenu);
          })
        );
        setOptionGroups(groups);
        setCategoryOrder(sortedCats);
      } catch (err) {
        console.error("Error fetching menu:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [member, isAdmin, sessionLoading]);

  const recommended = useMemo(() => {
    const manual = menuItems.filter((i) => i.isRecommended).sort((a, b) => {
      const idxA = recommendedOrder.indexOf(a.id);
      const idxB = recommendedOrder.indexOf(b.id);
      return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
    });
    const others = menuItems.filter((i) => !i.isRecommended);
    const food = others.filter((i) => i.isMakanan);
    const drink = others.filter((i) => !i.isMakanan);
    return [...manual, ...food, ...drink].slice(0, recommendedLimit);
  }, [menuItems, recommendedOrder, recommendedLimit]);

  const categorisedGroups = useMemo(() => {
    const groups: { category: string; items: MenuItem[] }[] = [];
    categoryOrder.forEach((cat) => {
      const items = menuItems.filter((i) => i.category === cat);
      if (items.length > 0) groups.push({ category: cat, items });
    });
    return groups;
  }, [menuItems, categoryOrder]);

  const formatPrice = (price: number) => `Rp${(price || 0).toLocaleString("id-ID")}`;
  const formatOptionPrice = (p: number) => `+Rp${(p || 0).toLocaleString("id-ID")}`;

  const selectedItem = useMemo(() => {
    return menuItems.find((i) => i.id === selected?.id) || null;
  }, [selected, menuItems]);

  const linkedGroups = useMemo(() => {
    if (!selected || !selectedItem) return [];
    return optionGroups
      .filter((og) => 
        og.show !== false && (
          og.linkedItemIds?.includes(selected.id) || 
          (selectedItem.namaMenu && og.linkedMenuItems?.includes(selectedItem.namaMenu))
        )
      )
      .sort((a, b) => {
        // 1. Sort by Required status first
        if (a.selectionRule === "required" && b.selectionRule !== "required") return -1;
        if (a.selectionRule !== "required" && b.selectionRule === "required") return 1;
        // 2. Then sort alphabetically by name
        return a.name.localeCompare(b.name);
      });
  }, [selected, selectedItem, optionGroups]);

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
  const renderCard = (item: MenuItem, keyPrefix: string = "") => {
    const uniqueId = `${keyPrefix}${item.id}`;
    return (
      <motion.div
        className="mdl-card"
        key={uniqueId}
        layoutId={uniqueId}
        onClick={() => setSelected({ id: item.id, prefix: keyPrefix })}
        style={{ cursor: "pointer" }}
        whileHover={{ y: -5, transition: { duration: 0.2 } }}
      >
        <motion.div
          className="mdl-card-img-wrap"
          style={{ aspectRatio: item.imageAspectRatio === "3:4" ? "3/4" : "1" }}
          layoutId={`${keyPrefix}img-${item.id}`}
        >
          <img
            src={item.imagePath || "/Logo Canteen 375 (2).png"}
            alt={item.namaMenu}
            className="mdl-card-img"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png";
            }}
          />
        </motion.div>
        <div className="mdl-card-body">
          <div className="mdl-card-header">
            <motion.h3 className="mdl-card-name" layoutId={`${keyPrefix}name-${item.id}`}>{item.namaMenu}</motion.h3>
            <motion.span className="mdl-card-price" layoutId={`${keyPrefix}price-${item.id}`}>{formatPrice(item.harga)}</motion.span>
          </div>
          {item.menuDescription && (
            <motion.p className="mdl-card-desc" layoutId={`${keyPrefix}desc-${item.id}`}>{item.menuDescription}</motion.p>
          )}
        </div>
      </motion.div>
    );
  };

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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          margin-bottom: 2.5rem;
          padding: 1rem 0;
        }
        .mdl-logo {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          border: 3px solid #ece8e3;
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        .mdl-header-text {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          align-items: center;
        }
        .mdl-title {
          font-family: 'Playfair Display', serif;
          font-size: 2rem;
          font-weight: 900;
          color: #2d241d;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .mdl-subtitle {
          font-size: 1rem;
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
          background: #f5dcc3;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          box-shadow: 0 8px 12px rgba(0, 0, 0, 0.1);
        }
        .mdl-card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
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
          font-style: regular;
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
          font-style: italic;
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

        /* ── Expanded View ── */
        .mdl-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .mdl-expanded-card {
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          background: white;
          border-radius: 24px;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
          position: relative;
        }
        .mdl-expanded-card::-webkit-scrollbar {
          width: 6px;
        }
        .mdl-expanded-card::-webkit-scrollbar-thumb {
          background: #ece8e3;
          border-radius: 10px;
        }
        .mdl-close-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 36px;
          height: 36px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 1100;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          color: #2d241d;
          font-size: 1.2rem;
          transition: transform 0.2s;
        }
        .mdl-close-btn:hover {
          transform: scale(1.1);
        }
        .mdl-expanded-img-wrap {
          width: 100%;
          background: #f5dcc3;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .mdl-expanded-body {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .mdl-expanded-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .mdl-expanded-name {
          font-family: 'Playfair Display', serif;
          font-size: 1.75rem;
          font-weight: 900;
          color: #2d241d;
          margin: 0;
        }
        .mdl-expanded-price {
          font-size: 1.25rem;
          font-weight: 800;
          color: #C51720;
          background: #fdf2f2;
          padding: 0.4rem 1rem;
          border-radius: 12px;
        }
        .mdl-expanded-desc {
          font-size: 1rem;
          color: #5d4037;
          line-height: 1.6;
          margin: 0;
          font-style: italic;
        }
        .mdl-expanded-meta {
          display: flex;
          gap: 1.5rem;
          margin-top: 0.5rem;
          padding: 1.5rem 0;
          border-top: 1px solid #f0ede9;
          border-bottom: 1px solid #f0ede9;
        }
        .mdl-meta-item {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .mdl-meta-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #b0a89e;
          font-weight: 700;
        }
        .mdl-meta-value {
          font-size: 0.9rem;
          color: #2d241d;
          font-weight: 600;
        }

        /* ── Options List ── */
        .mdl-options-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .mdl-options-title {
          font-size: 0.85rem;
          font-weight: 800;
          color: #2d241d;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .mdl-options-title::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #f0ede9;
        }
        .mdl-option-group {
          background: #faf9f7;
          border-radius: 16px;
          padding: 1.25rem;
          border: 1px solid #f0ede9;
        }
        .mdl-og-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .mdl-og-name {
          font-weight: 700;
          color: #2d241d;
          font-size: 0.95rem;
        }
        .mdl-og-badge {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.25rem 0.6rem;
          border-radius: 20px;
          text-transform: uppercase;
        }
        .mdl-og-badge.required { background: #fee2e2; color: #b91c1c; }
        .mdl-og-badge.optional { background: #f0fdf4; color: #15803d; }
        
        .mdl-options-grid {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .mdl-option-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px dashed #e8e4df;
        }
        .mdl-option-item:last-child { border-bottom: none; }
        .mdl-opt-name {
          font-size: 0.85rem;
          color: #5d4037;
        }
        .mdl-opt-price {
          font-size: 0.8rem;
          font-weight: 700;
          color: #8d6e63;
        }
      `}</style>

      <div className="mdl-page">
        {/* ── Header ── */}
        <header className="mdl-header">
          <img src="/Logo Canteen 375 (2).png" alt="Canteen 375" className="mdl-logo" />
          <div className="mdl-header-text">
            <h1 className="mdl-title">Canteen 375</h1>
            <p className="mdl-subtitle">Menu Kami</p>
          </div>
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

      {/* ── Expanded Detail View ── */}
      <AnimatePresence>
        {selected && selectedItem && (
          <motion.div
            className="mdl-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="mdl-expanded-card"
              layoutId={`${selected.prefix}${selected.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="mdl-close-btn" onClick={() => setSelected(null)}>×</button>
              
              <motion.div
                className="mdl-expanded-img-wrap"
                layoutId={`${selected.prefix}img-${selected.id}`}
                style={{ aspectRatio: selectedItem.imageAspectRatio === "3:4" ? "3/4" : "1" }}
              >
                <img
                  src={selectedItem.imagePath || "/Logo Canteen 375 (2).png"}
                  alt={selectedItem.namaMenu}
                  className="mdl-card-img"
                />
              </motion.div>

              <div className="mdl-expanded-body">
                <div className="mdl-expanded-header">
                  <motion.h3 className="mdl-expanded-name" layoutId={`${selected.prefix}name-${selected.id}`}>
                    {selectedItem.namaMenu}
                  </motion.h3>
                  <motion.span className="mdl-expanded-price" layoutId={`${selected.prefix}price-${selected.id}`}>
                    {formatPrice(selectedItem.harga)}
                  </motion.span>
                </div>

                {selectedItem.menuDescription && (
                  <motion.p className="mdl-expanded-desc" layoutId={`${selected.prefix}desc-${selected.id}`}>
                    {selectedItem.menuDescription}
                  </motion.p>
                )}

                <motion.div 
                  className="mdl-expanded-meta"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="mdl-meta-item">
                    <span className="mdl-meta-label">Kategori</span>
                    <span className="mdl-meta-value">{selectedItem.category}</span>
                  </div>
                  <div className="mdl-meta-item">
                    <span className="mdl-meta-label">Tipe</span>
                    <span className="mdl-meta-value">{selectedItem.isMakanan ? "Makanan" : "Minuman"}</span>
                  </div>
                  {selectedItem.stok !== undefined && (
                    <div className="mdl-meta-item">
                      <span className="mdl-meta-label">Stok</span>
                      <span className="mdl-meta-value">{selectedItem.stok} porsi</span>
                    </div>
                  )}
                </motion.div>

                {linkedGroups.length > 0 && (
                  <motion.div 
                    className="mdl-options-section"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h4 className="mdl-options-title">Pilihan Tambahan</h4>
                    <div className="mdl-options-list">
                      {linkedGroups.map((og) => (
                        <div key={og.id} className="mdl-option-group">
                          <div className="mdl-og-header">
                            <span className="mdl-og-name">{og.name}</span>
                            <span className={`mdl-og-badge ${og.selectionRule}`}>
                              {og.selectionRule === "required" ? "Wajib" : "Opsional"}
                            </span>
                          </div>
                          <div className="mdl-options-grid">
                            {og.options.filter(opt => opt.show !== false).map((opt, idx) => (
                              <div key={idx} className="mdl-option-item">
                                <span className="mdl-opt-name">{opt.name}</span>
                                <span className="mdl-opt-price">
                                  {formatOptionPrice(opt.additionalPrice || 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
