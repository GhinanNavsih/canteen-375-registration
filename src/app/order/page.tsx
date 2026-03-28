"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { useBasket } from "@/context/BasketContext";
import Navbar from "@/components/Navbar";
import { MenuItem, OptionGroup, SelectedOption, BasketItem } from "@/types/menu";

export default function OrderPage() {
  const { member, loading: sessionLoading } = useMember();
  const { basket, totalItems, totalPrice, addToBasket } = useBasket();
  const router = useRouter();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  // Drawer State
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, SelectedOption[]>>({});

  // Fetch menu and config from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch items
        const snap = await getDocs(collection(db, "Canteens", "canteen375", "MenuCollection"));
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            category: (data.category && typeof data.category === 'string' && data.category.trim() !== '')
              ? data.category
              : "Lainnya"
          } as MenuItem;
        });

        // 2. Fetch category order
        const configSnap = await getDoc(doc(db, "Canteens", "canteen375", "Metadata", "MenuConfig"));
        let sortedCats: string[] = [];
        const distinctCats = Array.from(new Set(items.map(i => i.category)));

        if (configSnap.exists()) {
          const stored = configSnap.data().categoryOrder || [];
          sortedCats = stored.filter((c: string) => distinctCats.includes(c));
          const missing = distinctCats.filter(c => !sortedCats.includes(c));
          sortedCats = [...sortedCats, ...missing];
        } else {
          sortedCats = distinctCats.sort();
        }

        // Consistent sorting: Order first, then Name
        setMenuItems(items.sort((a, b) => {
          const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          return orderDiff !== 0 ? orderDiff : a.namaMenu.localeCompare(b.namaMenu);
        }));
        setCategoryOrder(sortedCats);

        // 3. Fetch option groups and normalize field names
        const ogSnap = await getDocs(collection(db, "Canteens", "canteen375", "OptionGroups"));
        setOptionGroups(ogSnap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            // Normalize options: support both additionalPrice and priceAdjustment
            options: (data.options || []).map((opt: any) => ({
              ...opt,
              additionalPrice: opt.additionalPrice ?? opt.priceAdjustment ?? 0,
            })),
            linkedItemIds: data.linkedItemIds || [],
            linkedMenuItems: data.linkedMenuItems || [],
            selectionRule: data.selectionRule || (data.isRequired ? 'required' : 'optional'),
            ruleType: data.ruleType || 'exactly',
            ruleCount: data.ruleCount || 1,
          } as OptionGroup;
        }));

      } catch (err) {
        console.error("Error fetching menu:", err);
      } finally {
        setLoadingMenu(false);
      }
    };
    fetchData();
  }, []);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!sessionLoading && !member) router.push("/login");
  }, [member, sessionLoading, router]);

  // Recommended logic: Respects manual recommended field first
  const recommended = useMemo(() => {
    const manual = menuItems.filter((i) => i.isRecommended);
    const others = menuItems.filter((i) => !i.isRecommended);
    const food = others.filter((i) => i.isMakanan);
    const drink = others.filter((i) => !i.isMakanan);
    return [...manual, ...food, ...drink].slice(0, 6);
  }, [menuItems]);

  // Group remaining items by manual category order
  const categorisedGroups = useMemo(() => {
    const groups: { category: string; items: MenuItem[] }[] = [];

    categoryOrder.forEach(cat => {
      const items = menuItems.filter(i => i.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    });

    return groups;
  }, [menuItems, categoryOrder]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleItemClick = (item: MenuItem) => {
    const itemGroups = optionGroups.filter(g =>
      g.linkedItemIds.includes(item.id) ||
      (g.linkedMenuItems || []).includes(item.namaMenu)
    );
    if (itemGroups.length > 0) {
      // Open customization drawer
      setSelectedItem(item);
      setSelectedOptionsMap({}); // Reset options
    } else {
      // Direct add
      handleAdd(item);
    }
  };

  const handleAdd = (item: MenuItem, options: SelectedOption[] = []) => {
    addToBasket(item, options);
    setAddedItems((prev) => new Set(prev).add(item.id));
    setTimeout(() => {
      setAddedItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 800);
  };

  // -- Modal Logic Validation --
  const activeItemGroups = useMemo(() => {
    if (!selectedItem) return [];
    return optionGroups.filter(g =>
      g.linkedItemIds.includes(selectedItem.id) ||
      (g.linkedMenuItems || []).includes(selectedItem.namaMenu)
    );
  }, [selectedItem, optionGroups]);

  const toggleOption = (group: OptionGroup, opt: { id?: string; name: string; additionalPrice: number }) => {
    setSelectedOptionsMap(prev => {
      const next = { ...prev };
      const currentSelections = next[group.id] || [];
      const exists = currentSelections.find(o => o.optionName === opt.name);

      const newSelection: SelectedOption = {
        groupId: group.id,
        groupName: group.name,
        optionId: opt.id || '',
        optionName: opt.name,
        priceAdjustment: opt.additionalPrice,
      };

      if (group.selectionRule === "required" && group.ruleType === "exactly" && group.ruleCount === 1) {
        // Radio button behavior
        next[group.id] = [newSelection];
      } else {
        // Checkbox behavior
        if (exists) {
          next[group.id] = currentSelections.filter(o => o.optionName !== opt.name);
        } else {
          // Check limits
          const maxAllowed = group.selectionRule === "required" && (group.ruleType === "exactly" || group.ruleType === "at_most")
            ? group.ruleCount
            : (group.selectionRule === "optional" && group.ruleCount ? group.ruleCount : Infinity);
          if (currentSelections.length < maxAllowed) {
            next[group.id] = [...currentSelections, newSelection];
          }
        }
      }
      return next;
    });
  };

  const isModalValid = useMemo(() => {
    for (const g of activeItemGroups) {
      const selectedCount = (selectedOptionsMap[g.id] || []).length;
      if (g.selectionRule === "required") {
        if (g.ruleType === "exactly" && selectedCount !== g.ruleCount) return false;
        if (g.ruleType === "at_least" && selectedCount < g.ruleCount) return false;
        if (g.ruleType === "at_most" && (selectedCount === 0 || selectedCount > g.ruleCount)) return false;
      }
    }
    return true;
  }, [activeItemGroups, selectedOptionsMap]);

  const modalTotalPrice = useMemo(() => {
    if (!selectedItem) return 0;
    let base = selectedItem.harga;
    Object.values(selectedOptionsMap).flat().forEach(opt => {
      base += opt.priceAdjustment;
    });
    return base;
  }, [selectedItem, selectedOptionsMap]);

  const confirmModalAdd = () => {
    if (!selectedItem || !isModalValid) return;
    const compiledOptions = Object.values(selectedOptionsMap).flat();
    handleAdd(selectedItem, compiledOptions);
    setSelectedItem(null);
  };

  const formatPrice = (price: number) => `Rp${(price || 0).toLocaleString("id-ID")}`;

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


        <div className="order-content">
          {/* ── Recommended Section ── */}
          <section className="menu-section">
            <div className="section-title-row">
              <h2 className="section-title">🌟 Rekomendasi Menu Best Seller</h2>
            </div>
            <div className="recommended-grid">
              {recommended.map((item) => {
                const basketInstances = basket.filter(b => b.menuItem.id === item.id);
                const quantity = basketInstances.reduce((sum, b) => sum + b.dineInQuantity + b.takeAwayQuantity, 0);

                return (
                  <div key={`rec-${item.id}`} onClick={() => handleItemClick(item)} style={{ cursor: 'pointer' }}>
                    <MenuCard
                      item={item}
                      onAdd={(e) => { e.stopPropagation(); handleItemClick(item); }}
                      quantity={quantity}
                      formatPrice={formatPrice}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Categorised Sections ── */}
          {categorisedGroups.map(({ category, items }) => {
            const isExpanded = expandedCategories.has(category);
            const displayed = isExpanded ? items : items.slice(0, 3);
            const hasMore = items.length > 3;

            return (
              <section key={`cat-${category}`} className="menu-section">
                <div className="section-title-row">
                  <h2 className="section-title">{category}</h2>
                  {hasMore && (
                    <button className="see-all-btn" onClick={() => toggleCategory(category)}>
                      {isExpanded ? "Sembunyikan ▲" : "Lihat selengkapnya ▼"}
                    </button>
                  )}
                </div>

                <div className="category-list">
                  {displayed.map((item) => {
                    const basketInstances = basket.filter(b => b.menuItem.id === item.id);
                    const quantity = basketInstances.reduce((sum, b) => sum + b.dineInQuantity + b.takeAwayQuantity, 0);
                    
                    return (
                      <div key={`list-${item.id}`} onClick={() => handleItemClick(item)} style={{ cursor: 'pointer' }}>
                        <MenuListItem
                          item={item}
                          onAdd={(e) => { e.stopPropagation(); handleItemClick(item); }}
                          quantity={quantity}
                          formatPrice={formatPrice}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {totalItems > 0 && (
        <button className="basket-fab" onClick={() => router.push("/order/basket")}>
          <div className="basket-fab-left">
            <span>Basket</span>
            <span className="basket-dot">•</span>
            <span>{totalItems} Item{totalItems > 1 ? 's' : ''}</span>
          </div>
          <div className="basket-fab-right">
            <span>{formatPrice(totalPrice)}</span>
          </div>
        </button>
      )}

      {/* ── MODAL CUSTOMIZATION DRAWER ── */}
      <div className={`drawer-overlay ${selectedItem ? 'open' : ''}`}>
        <div className="drawer-content">
          {selectedItem && (
            <>
              <div className="drawer-image-section">
                <img 
                  src={selectedItem.imagePath || "/Logo Canteen 375 (2).png"} 
                  alt={selectedItem.namaMenu} 
                  className="drawer-hero-img"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
                />
                <div className="drawer-image-overlay" />
                <button className="btn-close-drawer-floating" onClick={() => setSelectedItem(null)}>✕</button>
                <div className="drawer-header-content">
                  <h2>{selectedItem.namaMenu}</h2>
                  <p>Sesuaikan pesananmu</p>
                </div>
              </div>

              <div className="drawer-scroll-area">
                {activeItemGroups.map(group => {
                  const currentSelections = selectedOptionsMap[group.id] || [];
                  const isSatisfied = group.selectionRule === "optional" ||
                    (group.ruleType === "exactly" && currentSelections.length === group.ruleCount) ||
                    (group.ruleType === "at_least" && currentSelections.length >= group.ruleCount) ||
                    (group.ruleType === "at_most" && currentSelections.length > 0 && currentSelections.length <= group.ruleCount);

                  const isSingleRadio = group.selectionRule === "required" && group.ruleType === "exactly" && group.ruleCount === 1;

                  return (
                    <div key={group.id} className="option-group-section">
                      <div className="og-header">
                        <h3>{group.name}</h3>
                        {isSatisfied ? (
                          <span className="og-badge completed">Completed</span>
                        ) : (
                          <span className="og-badge pending">
                            {group.selectionRule === "required"
                              ? `Pilih ${group.ruleType === 'exactly' ? 'tepat' : group.ruleType === 'at_least' ? 'minimal' : 'maksimal'} ${group.ruleCount}`
                              : `Optional${group.ruleCount ? `, max ${group.ruleCount}` : ''}`}
                          </span>
                        )}
                      </div>

                      <div className="og-options">
                        {group.options.map(opt => {
                          const isSelected = currentSelections.some(o => o.optionName === opt.name);
                          return (
                            <label key={opt.name} className="og-option-row">
                              <div className="og-option-input-wrap">
                                <div className="og-control-container">
                                  <input
                                    type={isSingleRadio ? "radio" : "checkbox"}
                                    name={`group-${group.id}`}
                                    checked={isSelected}
                                    onChange={() => toggleOption(group, opt)}
                                  />
                                </div>
                                <span className="og-option-name">{opt.name}</span>
                              </div>
                              {opt.additionalPrice > 0 && (
                                <span className="og-option-price">+{formatPrice(opt.additionalPrice)}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="drawer-footer-sticky">
                <button
                  className="btn-add-to-basket"
                  onClick={confirmModalAdd}
                  disabled={!isModalValid}
                >
                  Tambah Ke Keranjang • {formatPrice(modalTotalPrice)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .order-page { min-height: 100vh; background: #fff; }
        .order-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; gap: 1rem; color: #5d4037; font-weight: 600; }
        .loading-spinner { width: 40px; height: 40px; border: 4px solid #d4a373; border-top-color: #C51720; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .order-main { padding-bottom: 120px; }

        .order-content { padding: 0.5rem 1rem; max-width: 700px; margin: 0 auto; }
        .menu-section { margin-bottom: 2rem; }
        .section-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .section-title { font-size: 1.15rem; font-weight: 800; color: #2d241d; text-transform: capitalize; }
        .see-all-btn { background: none; border: none; color: #C51720; font-size: 0.9rem; font-weight: 700; padding: 0; cursor: pointer; font-family: inherit; }
        .see-all-btn:hover { text-decoration: underline; }
        .recommended-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
        .category-list { display: flex; flex-direction: column; }
        
        .basket-fab { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); width: calc(100% - 2rem); max-width: 600px; background: #C51720; color: white; border: none; border-radius: 50px; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; font-family: inherit; font-weight: 700; font-size: 1.05rem; cursor: pointer; box-shadow: 0 4px 15px rgba(0,177,79,0.3); z-index: 200; animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .basket-fab-left { display: flex; align-items: center; gap: 0.5rem; }
        .basket-dot { font-size: 0.8rem; opacity: 0.8; }
        .basket-fab-right { font-weight: 700; display: flex; align-items: center; }
        @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(30px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

        /* ── MODAL / DRAWER SYSTEM ── */
        .drawer-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: #fff;
          z-index: 2000;
          display: flex;
          opacity: 0;
          pointer-events: none;
          transition: 0.3s;
        }
        .drawer-overlay.open { opacity: 1; pointer-events: auto; }

        .drawer-content {
          width: 100%;
          height: 100vh;
          background: white;
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .drawer-overlay.open .drawer-content { transform: translateX(0); }

        .drawer-image-section {
          position: relative;
          width: 100%;
          height: 250px;
          background: #faf7f2;
        }
        .drawer-hero-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .drawer-image-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.8) 100%);
        }
        .btn-close-drawer-floating {
          position: absolute;
          top: 1.25rem;
          left: 1.25rem;
          background: white;
          border: none;
          width: 40px; height: 40px;
          border-radius: 50%;
          font-size: 1.25rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2d241d;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10;
          transition: 0.2s;
        }
        .btn-close-drawer-floating:hover { transform: scale(1.1); }

        .drawer-header-content {
          position: absolute;
          bottom: 1.5rem;
          left: 1.5rem;
          right: 1.5rem;
          color: white;
        }
        .drawer-header-content h2 { font-size: 1.8rem; font-weight: 800; margin: 0 0 0.25rem; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
        .drawer-header-content p { font-size: 1rem; color: rgba(255,255,255,0.9); margin: 0; font-weight: 600; }

        .drawer-scroll-area { 
          flex: 1; 
          overflow-y: auto; 
          padding: 1.5rem;
          scrollbar-width: none;
          background: white;
        }
        .drawer-scroll-area::-webkit-scrollbar { display: none; }

        .option-group-section { margin-bottom: 2rem; }
        .og-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .og-header h3 { font-size: 1.05rem; font-weight: 800; color: #2d241d; margin: 0; }
        .og-badge { font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 6px; }
        .og-badge.pending { background: #fffcf0; color: #b45309; border: 1px solid #fde68a; }
        .og-badge.completed { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

        .og-options { display: flex; flex-direction: column; gap: 0.5rem; }
        .og-option-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          background: #faf7f2;
          border-radius: 14px;
          cursor: pointer;
          transition: background 0.2s;
          border: 1.5px solid transparent;
        }
        .og-option-row:has(input:checked) { background: #fff; border-color: #C51720; box-shadow: 0 4px 12px rgba(197,23,32,0.08); }
        .og-option-input-wrap { display: flex; align-items: center; gap: 0.85rem; }
        .og-option-name { font-size: 0.95rem; font-weight: 600; color: #2d241d; }
        .og-option-price { font-size: 0.9rem; font-weight: 700; color: #C51720; }

        .drawer-footer-sticky {
          padding: 1.5rem;
          background: white;
          border-top: 1.5px solid #faf7f2;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .btn-add-to-basket {
          width: 100%;
          padding: 1.1rem;
          border-radius: 18px;
          border: none;
          background: #C51720;
          color: white;
          font-size: 1.1rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 8px 20px rgba(197,23,32,0.25);
        }
        .btn-add-to-basket:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(197,23,32,0.3); }
        .btn-add-to-basket:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; box-shadow: none; }
      `}</style>
    </div>
  );
}

function MenuCard({ item, onAdd, quantity, formatPrice }: { item: MenuItem; onAdd: (e: React.MouseEvent) => void; quantity: number; formatPrice: (p: number) => string; }) {
  return (
    <div className="menu-card">
      <div className="card-image-wrap" style={{ aspectRatio: item.imageAspectRatio === "3:4" ? "3/4" : "1" }}>
        <img src={item.imagePath || "/Logo Canteen 375 (2).png"} alt={item.namaMenu} className="card-image" onError={e => e.currentTarget.src = "/Logo Canteen 375 (2).png"} />
      </div>
      <div className="card-body">
        <p className="card-name">{item.namaMenu}</p>
        {item.menuDescription && <p className="card-desc">{item.menuDescription}</p>}
        <div className="card-footer">
          <span className="card-price">{formatPrice(item.harga)}</span>
          {quantity > 0 ? (
            <div className="qty-badge">
              <span className="qty-num">{quantity}</span>
            </div>
          ) : (
            <button className="add-btn" onClick={onAdd}>+</button>
          )}
        </div>
      </div>
      <style jsx>{`
        .menu-card { background: white; border-radius: 16px; overflow: hidden; border: 1.5px solid #ece8e3; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.06); height: 100%; display: flex; flex-direction: column; }
        .menu-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
        .card-image-wrap { position: relative; width: 100%; overflow: hidden; background: #f5f0eb; }
        .card-image { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
        .menu-card:hover .card-image { transform: scale(1.05); }
        .card-body { padding: 0.75rem; flex: 1; display: flex; flex-direction: column; }
        .card-name { font-size: 0.9rem; font-weight: 700; color: #2d241d; margin: 0 0 0.2rem; line-height: 1.3; }
        .card-desc { font-size: 0.75rem; color: #8d6e63; margin: 0 0 0.5rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
        .card-price { font-weight: 600; font-size: 0.95rem; color: #333; }
        
        .add-btn { width: 28px; height: 28px; border-radius: 50%; border: none; font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #C51720; color: white; transition: 0.2s; box-shadow: 0 2px 5px rgba(197,23,32,0.3); }
        .add-btn:hover { transform: scale(1.05); }

        .qty-badge { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: white; color: #C51720; border: 1.5px solid #C51720; font-weight: 800; font-size: 0.9rem; }
      `}</style>
    </div>
  );
}

function MenuListItem({ item, onAdd, quantity, formatPrice }: { item: MenuItem; onAdd: (e: React.MouseEvent) => void; quantity: number; formatPrice: (p: number) => string; }) {
  return (
    <div className="list-item">
      <img src={item.imagePath || "/Logo Canteen 375 (2).png"} alt={item.namaMenu} className="list-image" style={{ aspectRatio: item.imageAspectRatio === "3:4" ? "3/4" : "1" }} onError={e => e.currentTarget.src = "/Logo Canteen 375 (2).png"} />
      <div className="list-body">
        <p className="list-name">{item.namaMenu}</p>
        {item.menuDescription && <p className="list-desc">{item.menuDescription}</p>}
        <div className="list-footer">
          <span className="list-price">{formatPrice(item.harga)}</span>
          {quantity > 0 ? (
            <div className="qty-badge-lg">
              <span className="qty-num-lg">{quantity}</span>
            </div>
          ) : (
            <button className="add-btn-lg" onClick={onAdd}>+</button>
          )}
        </div>
      </div>
      <style jsx>{`
        .list-item { display: flex; align-items: flex-start; gap: 1rem; background: transparent; padding: 1.25rem 0; border-bottom: 1px solid #eee; }
        .list-image { width: 110px; border-radius: 12px; object-fit: cover; flex-shrink: 0; background: #f5f0eb; border: 1px solid #eaeaea; }
        .list-body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; min-height: 110px; }
        .list-name { font-size: 1rem; font-weight: 600; color: #2d241d; margin: 0 0 0.2rem; font-family: inherit; }
        .list-desc { font-size: 0.85rem; color: #777; margin: 0 0 0.5rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .list-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
        .list-price { font-weight: 600; font-size: 0.95rem; color: #222; }
        
        .add-btn-lg { width: 32px; height: 32px; border-radius: 50%; border: none; font-size: 1.4rem; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #C51720; color: white; transition: 0.2s; box-shadow: 0 3px 6px rgba(197,23,32,0.3); }
        .add-btn-lg:hover { transform: scale(1.05); }

        .qty-badge-lg { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: white; color: #C51720; border: 1.5px solid #C51720; font-weight: 800; font-size: 1rem; }
      `}</style>
    </div>
  );
}
