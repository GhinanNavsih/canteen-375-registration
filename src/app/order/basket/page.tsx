"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, setDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import { useBasket } from "@/context/BasketContext";
import Navbar from "@/components/Navbar";
import { MenuItem, OptionGroup, SelectedOption, BasketItem } from "@/types/menu";

export default function BasketPage() {
  const { member } = useMember();
  const { basket, totalPrice, totalItems, addToBasket, editBasketItem, updateQuantity, removeFromBasket, clearBasket } = useBasket();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ shortCode: string } | null>(null);

  // Cross-selling state
  const [crossSellItems, setCrossSellItems] = useState<MenuItem[]>([]);
  const [addedCrossItems, setAddedCrossItems] = useState<Set<string>>(new Set());

  // Edit Drawer State
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [editingItem, setEditingItem] = useState<BasketItem | null>(null);
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, SelectedOption[]>>({});

  // Take-away Fee Logic
  // Every 4 slots occupied = Rp 1.000 (1-3 free, 4 adds Rp1k)
  const totalTakeAwaySlots = basket.reduce((total, b) => {
    if (b.takeAwayQuantity === 0) return total;
    const unitsPerPackage = b.menuItem.unitsPerPackage || 1;
    const slots = Math.ceil(b.takeAwayQuantity / unitsPerPackage);
    return total + slots;
  }, 0);

  const takeAwayFee = Math.floor(totalTakeAwaySlots / 4) * 1000;

  const formatPrice = (price: number) => `Rp${(price || 0).toLocaleString("id-ID")}`;

  useEffect(() => {
    // 1. Fetch recommended items for "People also ordered"
    const fetchCrossSellAndOG = async () => {
      try {
        const [menuSnap, ogSnap] = await Promise.all([
          getDocs(collection(db, "Canteens", "canteen375", "MenuCollection")),
          getDocs(collection(db, "Canteens", "canteen375", "OptionGroups"))
        ]);

        const items = menuSnap.docs.map(d => ({ ...d.data(), id: d.id } as MenuItem));
        const inBasketIds = new Set(basket.map(b => b.menuItem.id));
        const suggestions = items.filter(i => i.isRecommended && !inBasketIds.has(i.id)).slice(0, 5);
        setCrossSellItems(suggestions);

        // 2. Fetch option groups and normalize
        setOptionGroups(ogSnap.docs.map(d => {
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
            selectionRule: data.selectionRule || (data.isRequired ? 'required' : 'optional'),
            ruleType: data.ruleType || 'exactly',
            ruleCount: data.ruleCount || 1,
          } as OptionGroup;
        }));
      } catch (err) {
        console.error("Error fetching data", err);
      }
    };
    fetchCrossSellAndOG();
  }, [basket]);

  const generateShortCode = () => {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `#${num}`;
  };

  const handleOrder = async () => {
    if (!member || totalItems === 0) return;
    setSubmitting(true);

    try {
      const shortCode = generateShortCode();
      const orderItems = basket
        .filter(b => (b.dineInQuantity + b.takeAwayQuantity) > 0)
        .map((b) => ({
          namaPesanan: b.menuItem.namaMenu,
          harga: b.menuItem.harga + b.selectedOptions.reduce((acc, o) => acc + o.priceAdjustment, 0),
          dineInQuantity: b.dineInQuantity,
          takeAwayQuantity: b.takeAwayQuantity,
          selectedOptions: b.selectedOptions,
        }));

      const orderId = `SO_${shortCode.replace("#", "")}`;
      await setDoc(doc(db, "Canteens", "canteen375", "SelfOrders", orderId), {
        userId: member.uid || member.id,
        memberName: member.fullName,
        orderItems,
        subtotal: totalPrice,
        takeAwayFee,
        total: totalPrice + takeAwayFee,
        status: "Unpaid",
        shortCode,
        timestamp: serverTimestamp(),
      });

      clearBasket();
      setOrderSuccess({ shortCode });
    } catch (err) {
      console.error("Error placing order:", err);
    } finally {
      setSubmitting(false);
    }
  };
  // -- Edit Logic --
  const activeItemGroups = useMemo(() => {
    if (!editingItem) return [];
    const item = editingItem.menuItem;
    return optionGroups.filter(g =>
      g.linkedItemIds.includes(item.id) ||
      (g.linkedMenuItems || []).includes(item.namaMenu)
    );
  }, [editingItem, optionGroups]);

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
        next[group.id] = [newSelection];
      } else {
        if (exists) {
          next[group.id] = currentSelections.filter(o => o.optionName !== opt.name);
        } else {
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
    if (!editingItem) return 0;
    let base = editingItem.menuItem.harga;
    Object.values(selectedOptionsMap).flat().forEach(opt => {
      base += opt.priceAdjustment;
    });
    return base;
  }, [editingItem, selectedOptionsMap]);

  const handleEditOpen = (item: BasketItem) => {
    setEditingItem(item);
    // Initialize chosen options map
    const map: Record<string, SelectedOption[]> = {};
    item.selectedOptions.forEach(opt => {
      if (!map[opt.groupId]) map[opt.groupId] = [];
      map[opt.groupId].push(opt);
    });
    setSelectedOptionsMap(map);
  };

  const confirmModalEdit = () => {
    if (!editingItem || !isModalValid) return;
    const compiledOptions = Object.values(selectedOptionsMap).flat();
    editBasketItem(editingItem.cartItemId, compiledOptions);
    setEditingItem(null);
  };

  // ── Order placed success screen ──
  if (orderSuccess) {
    return (
      <div className="basket-page">
        <Navbar />
        <div className="success-screen">
          <div className="success-card">
            <div className="success-icon">✅</div>
            <h2>Pesanan Masuk!</h2>
            <p>Tunjukkan kode ini ke kasir:</p>
            <div className="short-code">{orderSuccess.shortCode}</div>
            <p className="success-sub">Kasir akan menyiapkan pesananmu segera.</p>
            <button className="btn-back" onClick={() => router.push("/order")}>
              Pesan Lagi
            </button>
            <button className="btn-dashboard" onClick={() => router.push("/dashboard")}>
              Kembali ke Dashboard
            </button>
          </div>
        </div>
        <SuccessStyles />
      </div>
    );
  }

  // ── Empty basket ──
  if (basket.length === 0) {
    return (
      <div className="basket-page">
        <Navbar />
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <h2>Keranjangmu Kosong</h2>
          <p>Yuk, pilih menu dulu!</p>
          <button className="btn-back" onClick={() => router.push("/order")}>
            Lihat Menu
          </button>
        </div>
        <EmptyStyles />
      </div>
    );
  }

  return (
    <div className="basket-page">
      <Navbar />

      {/* ── Header ── */}
      <div className="basket-header">
        <button className="back-btn" onClick={() => router.push("/order")}>
          ← Kembali
        </button>
        <h1>Keranjang Pesanan</h1>
        <span className="item-count">{totalItems} item</span>
      </div>

      <div className="basket-content">
        {/* ── Order items list ── */}
        <div className="items-list">
          {basket.map(({ cartItemId, menuItem, dineInQuantity, takeAwayQuantity, selectedOptions }) => {
            const optionsPrice = selectedOptions.reduce((sum, opt) => sum + opt.priceAdjustment, 0);
            const itemBasePrice = menuItem.harga + optionsPrice;

            return (
              <div key={cartItemId} className="basket-item">
                <div 
                  className="basket-item-flex"
                  onClick={() => handleEditOpen({ cartItemId, menuItem, dineInQuantity, takeAwayQuantity, selectedOptions })}
                >
                  {/* Left: Image */}
                  <img
                    src={menuItem.imagePath || "/Logo Canteen 375 (2).png"}
                    alt={menuItem.namaMenu}
                    className="item-img"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
                  />

                  {/* Mid-Left: Basic Info */}
                  <div className="item-info">
                    <p className="item-name">{menuItem.namaMenu}</p>
                    {selectedOptions.length > 0 && (
                      <div className="item-options-list">
                        {selectedOptions.map((opt, i) => (
                          <span key={i} className="item-option-text">
                            {opt.optionName}{i < selectedOptions.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="item-price-tag">{formatPrice(itemBasePrice * (dineInQuantity + takeAwayQuantity))}</span>
                  </div>

                  {/* Mid-Right: Stacked Qty Controls */}
                  <div className="item-qty-stack" onClick={e => e.stopPropagation()}>
                    <div className="qty-pill-row">
                      <span className="qty-icon-mini">🍽️</span>
                      <div className="qty-toggle-pills">
                        <button className="pill-btn" onClick={() => updateQuantity(cartItemId, "dineIn", -1)}>−</button>
                        <span className="pill-val">{dineInQuantity}</span>
                        <button className="pill-btn" onClick={() => updateQuantity(cartItemId, "dineIn", 1)}>+</button>
                      </div>
                    </div>
                    <div className="qty-pill-row">
                      <span className="qty-icon-mini">🥡</span>
                      <div className="qty-toggle-pills">
                        <button className="pill-btn" onClick={() => updateQuantity(cartItemId, "takeAway", -1)}>−</button>
                        <span className="pill-val">{takeAwayQuantity}</span>
                        <button className="pill-btn" onClick={() => updateQuantity(cartItemId, "takeAway", 1)}>+</button>
                      </div>
                    </div>
                    
                    {(dineInQuantity + takeAwayQuantity === 0) && (
                      <button 
                        className="btn-delete-item" 
                        onClick={(e) => { e.stopPropagation(); removeFromBasket(cartItemId); }}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── People also ordered / Cross-selling ── */}
        {crossSellItems.length > 0 && (
          <div className="cross-sell-section">
            <h3 className="cross-sell-title">Pelanggan lain juga memesan</h3>
            <div className="cross-sell-scroll">
              {crossSellItems.map(item => {
                const added = addedCrossItems.has(item.id);
                return (
                  <div key={item.id} className="cross-sell-card">
                    <div className="cs-image-wrap">
                      <img src={item.imagePath || "/Logo Canteen 375 (2).png"} alt={item.namaMenu} className="cs-image" onError={e => e.currentTarget.src = "/Logo Canteen 375 (2).png"} />
                      <button
                        className={`cs-add-btn ${added ? 'added' : ''}`}
                        onClick={() => {
                          addToBasket(item);
                          setAddedCrossItems(prev => new Set(prev).add(item.id));
                          setTimeout(() => {
                            setAddedCrossItems(prev => {
                              const next = new Set(prev);
                              next.delete(item.id);
                              return next;
                            });
                          }, 800);
                        }}
                      >
                        {added ? "✓" : "+"}
                      </button>
                    </div>
                    <div className="cs-info">
                      <p className="cs-name">{item.namaMenu}</p>
                      <p className="cs-price">{formatPrice(item.harga)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Order summary ── */}
        <div className="summary-card">
          <h3>Ringkasan Pesanan</h3>
          {basket.map(({ cartItemId, menuItem, dineInQuantity, takeAwayQuantity, selectedOptions }) => {
            const optionsPrice = selectedOptions.reduce((sum, opt) => sum + opt.priceAdjustment, 0);
            const itemBasePrice = menuItem.harga + optionsPrice;
            return (
              <div key={cartItemId} className="summary-row">
                <div className="summary-item-info">
                  <span className="summary-item-name">{menuItem.namaMenu} <span className="text-muted">x{dineInQuantity + takeAwayQuantity}</span></span>
                  {selectedOptions.length > 0 && (
                    <div className="summary-item-options">
                      {selectedOptions.map((o, i) => (
                        <span key={i} className="text-muted block">{o.optionName}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span>{formatPrice(itemBasePrice * (dineInQuantity + takeAwayQuantity))}</span>
              </div>
            );
          })}
          <div className="summary-divider" />

          <div className="summary-row fee-row">
            <span>Subtotal</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          {takeAwayFee > 0 && (
            <div className="summary-row fee-row">
              <span>Biaya Bungkus (Take-away)</span>
              <span>{formatPrice(takeAwayFee)}</span>
            </div>
          )}
          <div className="summary-divider" />
          <div className="summary-total">
            <span>Total</span>
            <span className="total-amount">{formatPrice(totalPrice + takeAwayFee)}</span>
          </div>

          <div className="order-note">
            <span className="note-icon">ℹ️</span>
            <p>Setelah memesan, tunjukkan <strong>kode pendek</strong> ke kasir. Kasir akan memproses dan meminta pembayaran.</p>
          </div>

          <button
            className="btn-order"
            disabled={submitting || totalItems === 0}
            onClick={handleOrder}
          >
            {submitting ? "Memproses..." : `Place Order`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .basket-page { min-height: 100vh; background: #fff; }
        .basket-header {
          background: white;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          border-bottom: 1.5px solid #ece8e3;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .back-btn {
          background: none;
          border: none;
          font-size: 1rem;
          font-weight: 700;
          color: #C51720;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
        }
        .basket-header h1 {
          flex: 1;
          font-size: 1.2rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0;
        }
        .item-count {
          font-size: 0.85rem;
          font-weight: 600;
          color: #8d6e63;
          background: #faf7f2;
          padding: 0.3rem 0.75rem;
          border-radius: 20px;
        }

        .basket-content {
          max-width: 700px;
          margin: 0 auto;
          padding: 1.5rem 1rem 6rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .items-list { display: flex; flex-direction: column; gap: 1rem; }

        .basket-item {
          background: white;
          border-radius: 16px;
          padding: 1rem;
          display: flex;
          gap: 1rem;
          border: 1.5px solid #ece8e3;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          position: relative;
        }
        .item-img {
          width: 80px; height: 80px;
          border-radius: 12px;
          object-fit: cover;
          flex-shrink: 0;
          background: #f5f0eb;
        }
        .item-details { flex: 1; min-width: 0; }
        .item-name {
          font-size: 1rem;
          font-weight: 700;
          color: #2d241d;
          margin: 0 0 0.1rem;
        }
        .item-options-list { margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.15rem; }
        .item-option-text { font-size: 0.8rem; color: #8d6e63; margin: 0; line-height: 1.2; }
        .item-price {
          font-size: 0.9rem;
          color: #C51720;
          font-weight: 700;
          margin: 0 0 0.75rem;
        }

        .basket-item {
          background: white;
          border-radius: 18px;
          border: 1.5px solid #ece8e3;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          margin-bottom: 0.85rem;
          overflow: hidden;
          transition: 0.2s;
        }
        .basket-item:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }

        .basket-item-flex {
          display: flex;
          align-items: center;
          padding: 0.85rem 1.25rem;
          gap: 1.5rem;
          cursor: pointer;
          width: 100%;
        }

        .item-img {
          width: 70px; height: 70px;
          border-radius: 14px;
          object-fit: cover;
          flex-shrink: 0;
          background: #faf7f2;
        }

        .item-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .item-name {
          font-size: 1rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .item-options-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0;
          margin: 0.1rem 0;
        }
        .item-option-text {
          font-size: 0.8rem;
          color: #8d6e63;
          font-weight: 500;
          white-space: nowrap;
        }
        .item-price-tag {
          font-size: 0.9rem;
          color: #C51720;
          font-weight: 800;
        }

        .item-qty-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          padding-left: 1.25rem;
          border-left: 1.5px solid #faf7f2;
          min-width: 130px;
          margin-left: auto;
        }
        .qty-pill-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          width: 100%;
          gap: 0.5rem;
        }
        .qty-icon-mini { font-size: 0.9rem; opacity: 0.8; }
        .qty-toggle-pills {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #faf7f2;
          padding: 0.2rem 0.4rem;
          border-radius: 20px;
          border: 1px solid #efeae4;
        }
        .pill-btn {
          width: 24px; height: 24px;
          border-radius: 50%;
          border: none;
          background: #C51720;
          color: white;
          font-size: 1rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .pill-val {
          font-size: 0.95rem;
          font-weight: 800;
          color: #2d241d;
          min-width: 18px;
          text-align: center;
        }

        .btn-delete-item {
          width: 100%;
          background: #fef2f2;
          border: 1px solid #fee2e2;
          color: #C51720;
          font-size: 0.75rem;
          font-weight: 800;
          padding: 0.35rem 0.6rem;
          border-radius: 6px;
          cursor: pointer;
          transition: 0.2s;
          margin-top: 0.25rem;
          text-align: center;
        }
        .btn-delete-item:hover { background: #fee2e2; }

        /* ── Summary Card ── */
        .summary-card {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          border: 1.5px solid #ece8e3;
          box-shadow: 0 4px 16px rgba(0,0,0,0.07);
        }
        .summary-card h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: #2d241d;
          margin: 0 0 1rem;
        }
        .summary-card p {
          font-size: 0.95rem;
          color: #555;
          margin: 0 0 1rem;
        }

        /* Cross Selling */
        .cross-sell-section { margin-top: 0.5rem; }
        .cross-sell-title { font-size: 1.15rem; font-weight: 800; color: #2d241d; margin: 0 0 1rem; }
        .cross-sell-scroll { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: none; }
        .cross-sell-scroll::-webkit-scrollbar { display: none; }
        .cross-sell-card { min-width: 130px; width: 130px; display: flex; flex-direction: column; gap: 0.5rem; }
        .cs-image-wrap { position: relative; width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #f5f0eb; border: 1.5px solid #ece8e3; }
        .cs-image { width: 100%; height: 100%; object-fit: cover; }
        .cs-add-btn { position: absolute; bottom: 8px; right: 8px; width: 32px; height: 32px; border-radius: 50%; background: #C51720; color: white; border: none; font-size: 1.2rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(197,23,32,0.3); transition: 0.2s; }
        .cs-add-btn.added { background: #8b0000; }
        .cs-add-btn:hover { transform: scale(1.1); }
        .cs-info { padding: 0 0.25rem; }
        .cs-name { font-size: 0.85rem; color: #2d241d; font-weight: 600; margin: 0 0 0.2rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .cs-price { font-size: 0.9rem; font-weight: 800; color: #2d241d; margin: 0; }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
          color: #2d241d;
          font-weight: 500;
        }
        .fee-row { color: #555; }
        .fee-label { display: flex; align-items: center; gap: 0.3rem; }
        .fee-info { font-size: 0.8rem; color: #aaa; cursor: help; }
        .summary-item-info { display: flex; flex-direction: column; gap: 0.2rem; }
        .summary-item-name { font-weight: 600; }
        .summary-item-options { display: flex; flex-direction: column; gap: 0.1rem; padding-left: 0.5rem; border-left: 2px solid #ece8e3; margin-top: 0.2rem; }
        .text-muted { color: #8d6e63; font-size: 0.8rem; }
        .block { display: block; }
        .summary-divider {
          width: 100%;
          border-top: 1.5px dashed #ece8e3;
          margin: 1rem 0;
        }
        .summary-total {
          display: flex;
          justify-content: space-between;
          font-weight: 800;
          font-size: 1.1rem;
          margin-bottom: 1.25rem;
        }
        .total-amount { color: #C51720; }

        .order-note {
          display: flex;
          gap: 0.75rem;
          background: #fef3f3;
          border: 1.5px solid #fca5a5;
          border-radius: 12px;
          padding: 0.85rem;
          margin-bottom: 1.25rem;
        }
        .note-icon { font-size: 1.1rem; flex-shrink: 0; }
        .order-note p { font-size: 0.82rem; color: #5d4037; line-height: 1.5; margin: 0; }

        .btn-order {
          width: 100%;
          padding: 1rem;
          border-radius: 16px;
          border: none;
          background: #C51720;
          color: white;
          font-size: 1.05rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-order:hover:not(:disabled) {
          background: #C51720;
        }
        .btn-order:disabled {
          background: #ddd;
          cursor: not-allowed;
          color: #888;
        }

        /* ── MODAL / DRAWER SYSTEM ── */
        .drawer-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: #fff;
          z-index: 2000;
          display: flex;
          animation: fadeIn 0.3s ease;
        }
        .drawer-content {
          width: 100%;
          height: 100vh;
          background: white;
          display: flex;
          flex-direction: column;
          animation: slideInSide 0.35s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInSide { from { transform: translateX(100%); } to { transform: translateX(0); } }

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

      {/* ── CUSTOMIZATION DRAWER ── */}
      {editingItem && (
        <div className="drawer-overlay">
          <div className="drawer-content">
            <div className="drawer-image-section">
              <img 
                src={editingItem.menuItem.imagePath || "/Logo Canteen 375 (2).png"} 
                alt={editingItem.menuItem.namaMenu} 
                className="drawer-hero-img"
                onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
              />
              <div className="drawer-image-overlay" />
              <button className="btn-close-drawer-floating" onClick={() => setEditingItem(null)}>✕</button>
              <div className="drawer-header-content">
                <h2>{editingItem.menuItem.namaMenu}</h2>
                <p>Ubah pilihan sesuai seleramu</p>
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
                onClick={confirmModalEdit}
                disabled={!isModalValid}
              >
                Konfirmasi Perubahan • {formatPrice(modalTotalPrice)}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function SuccessStyles() {
  return (
    <style jsx global>{`
      .success-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 80vh;
        padding: 1.5rem;
      }
      .success-card {
        background: white;
        border-radius: 24px;
        padding: 2.5rem;
        text-align: center;
        max-width: 360px;
        width: 100%;
        border: 1.5px solid #ece8e3;
        box-shadow: 0 20px 50px rgba(0,0,0,0.1);
        animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes popIn {
        from { opacity: 0; transform: scale(0.85); }
        to { opacity: 1; transform: scale(1); }
      }
      .success-icon { font-size: 4rem; margin-bottom: 1rem; }
      .success-card h2 {
        font-size: 1.6rem;
        font-weight: 800;
        color: #2d241d;
        margin: 0 0 0.5rem;
      }
      .success-card > p {
        color: #5d4037;
        font-size: 0.95rem;
        margin: 0 0 1rem;
      }
      .short-code {
        font-size: 3.5rem;
        font-weight: 900;
        color: #C51720;
        letter-spacing: 0.05em;
        background: #fef3f3;
        border: 3px dashed #C51720;
        border-radius: 16px;
        padding: 0.75rem 1.5rem;
        margin: 0 0 1rem;
        display: inline-block;
      }
      .success-sub {
        font-size: 0.85rem;
        color: #8d6e63;
        margin: 0 0 1.5rem;
      }
      .btn-back, .btn-dashboard {
        display: block;
        width: 100%;
        padding: 0.85rem;
        border-radius: 12px;
        font-family: inherit;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 0.75rem;
      }
      .btn-back {
        background: #C51720;
        color: white;
        border: none;
        box-shadow: 0 4px 12px rgba(197,23,32,0.3);
      }
      .btn-back:hover { background: #8b0000; }
      .btn-dashboard {
        background: white;
        color: #C51720;
        border: 2px solid #C51720;
      }
      .btn-dashboard:hover { background: #fef3f3; }
    `}</style>
  );
}

function EmptyStyles() {
  return (
    <style jsx global>{`
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 70vh;
        gap: 0.75rem;
        text-align: center;
        padding: 2rem;
      }
      .empty-icon { font-size: 5rem; margin-bottom: 0.5rem; }
      .empty-state h2 { font-size: 1.5rem; font-weight: 800; color: #2d241d; }
      .empty-state p { color: #8d6e63; }
      .btn-back {
        margin-top: 1rem;
        padding: 0.85rem 2rem;
        background: #C51720;
        color: white;
        border: none;
        border-radius: 12px;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
      }
    `}</style>
  );
}
