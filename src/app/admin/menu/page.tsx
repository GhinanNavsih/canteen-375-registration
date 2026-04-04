"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import ImageCropModal from "@/components/ImageCropModal";
import { MenuItem } from "@/types/menu";
import OptionGroupsTab from "./OptionGroupsTab";

const MENU_COLLECTION_PATH = ["Canteens", "canteen375", "MenuCollection"];
const CONFIG_DOC_PATH = ["Canteens", "canteen375", "Metadata", "MenuConfig"];

const emptyForm = (nextOrder: number, defaultCategory: string): Omit<MenuItem, "id"> => {
  // Auto-detect isMakanan based on category name
  const isMakanan = !defaultCategory.toLowerCase().includes("minuman");

  return {
    namaMenu: "",
    harga: 0,
    category: defaultCategory || "",
    imagePath: "",
    imageAspectRatio: "1:1",
    isMakanan,
    isRecommended: false,
    menuDescription: "",
    sortOrder: nextOrder,
    unitsPerPackage: 1,
  };
};

export default function AdminMenuPage() {
  const { isAdmin, loading: sessionLoading } = useMember();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'menu' | 'options'>('menu');

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // UI State
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [itemsMenuOpen, setItemsMenuOpen] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rearrangeMode, setRearrangeMode] = useState<'categories' | 'items' | 'recommended' | null>(null);
  const [tempCategoryOrder, setTempCategoryOrder] = useState<string[]>([]);
  const [tempItemsOrder, setTempItemsOrder] = useState<MenuItem[]>([]);
  const [recommendedOrder, setRecommendedOrder] = useState<string[]>([]);
  const [recommendedLimit, setRecommendedLimit] = useState<number>(6);
  const [tempRecommendedOrder, setTempRecommendedOrder] = useState<MenuItem[]>([]);
  const [tempRecommendedLimit, setTempRecommendedLimit] = useState<number>(6);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<Omit<MenuItem, "id">>(emptyForm(0, ""));
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<MenuItem | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);

  // Click outside listener for dropdowns
  const catMenuRef = useRef<HTMLDivElement>(null);
  const itemsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (catMenuRef.current && !catMenuRef.current.contains(event.target as Node)) {
        setCatMenuOpen(false);
      }
      if (itemsMenuRef.current && !itemsMenuRef.current.contains(event.target as Node)) {
        setItemsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Guard
  useEffect(() => {
    if (!sessionLoading && !isAdmin) router.push("/login");
  }, [isAdmin, sessionLoading, router]);

  const fetchData = async () => {
    setLoadingMenu(true);
    try {
      const itemsSnap = await getDocs(collection(db, ...MENU_COLLECTION_PATH as [string, string, string]));
      const items = itemsSnap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          category: (data.category && typeof data.category === 'string' && data.category.trim() !== '')
            ? data.category
            : "Lainnya"
        } as MenuItem;
      });

      const configSnap = await getDoc(doc(db, ...CONFIG_DOC_PATH as [string, string, string, string]));
      let sortedCategories: string[] = [];

      const distinctCats = Array.from(new Set(items.map(i => i.category)))
        .filter((c): c is string => typeof c === 'string' && c.trim() !== '');

      if (configSnap.exists()) {
        const configData = configSnap.data();
        const storedOrder = configData.categoryOrder || [];
        sortedCategories = storedOrder.filter((c: string) => distinctCats.includes(c));
        const newCats = distinctCats.filter(c => !sortedCategories.includes(c));
        sortedCategories = [...sortedCategories, ...newCats];
        setRecommendedOrder(configData.recommendedOrder || []);
        setRecommendedLimit(configData.recommendedLimit ?? 6);
      } else {
        sortedCategories = distinctCats.sort();
      }

      setMenuItems(items.sort((a, b) => {
        const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        return diff !== 0 ? diff : a.namaMenu.localeCompare(b.namaMenu);
      }));

      // Auto-add "Lainnya" if items exist but it's not in the list
      const hasLainnya = items.some(i => i.category === "Lainnya");
      if (hasLainnya && !sortedCategories.includes("Lainnya")) {
        sortedCategories.push("Lainnya");
      }

      setCategoryOrder(sortedCategories);
      if (sortedCategories.length > 0 && !activeCategory) {
        setActiveCategory(sortedCategories[0]);
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal memuat data", "error");
    } finally {
      setLoadingMenu(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchData(); }, [isAdmin]);

  const showToast = (text: string, type: "success" | "error") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const openCreate = () => {
    setEditingItem(null);
    const catItems = menuItems.filter(i => i.category === activeCategory);
    const maxOrder = catItems.length > 0 ? Math.max(...catItems.map(i => i.sortOrder ?? 0)) : 0;
    setForm(emptyForm(maxOrder + 1, activeCategory));
    setItemsMenuOpen(false);
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({
      namaMenu: item.namaMenu,
      harga: item.harga,
      category: item.category,
      imagePath: item.imagePath,
      imageAspectRatio: item.imageAspectRatio ?? "1:1",
      isMakanan: item.isMakanan,
      isRecommended: item.isRecommended ?? false,
      menuDescription: item.menuDescription ?? "",
      sortOrder: item.sortOrder ?? 0,
      unitsPerPackage: item.unitsPerPackage ?? 1,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.namaMenu.trim() || !form.category.trim() || form.harga <= 0) {
      showToast("Nama menu, kategori, dan harga wajib diisi!", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        await updateDoc(doc(db, ...MENU_COLLECTION_PATH as [string, string, string], editingItem.id), form);
        showToast(`"${form.namaMenu}" diperbarui ✓`, "success");
      } else {
        // Use menu name as documentId for better identification
        const docId = form.namaMenu.trim();
        const docRef = doc(db, ...MENU_COLLECTION_PATH as [string, string, string], docId);

        // Check for duplicates
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          showToast(`Menu "${docId}" sudah ada! Silakan gunakan nama lain.`, "error");
          setSaving(false);
          return;
        }

        await setDoc(docRef, form);
        showToast(`"${form.namaMenu}" ditambahkan ✓`, "success");

        // Ensure new category is added to order if it's new
        if (!categoryOrder.includes(form.category)) {
          const newOrder = [...categoryOrder, form.category];
          setCategoryOrder(newOrder);
          const configRef = doc(db, ...CONFIG_DOC_PATH as [string, string, string, string]);
          await setDoc(configRef, { categoryOrder: newOrder }, { merge: true });
        }
      }
      setModalOpen(false);
      fetchData();
    } catch {
      showToast("Gagal menyimpan item", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    try {
      await deleteDoc(doc(db, ...MENU_COLLECTION_PATH as [string, string, string], item.id));
      showToast(`"${item.namaMenu}" dihapus`, "success");
      setDeleteConfirm(null);
      fetchData();
    } catch {
      showToast("Gagal menghapus item", "error");
    }
  };

  // ── REORDERING LOGIC ──

  const openRearrangeDrawer = (mode: 'categories' | 'items' | 'recommended') => {
    if (mode === 'categories') {
      setTempCategoryOrder([...categoryOrder]);
    } else if (mode === 'recommended') {
      const recItems = menuItems
        .filter(i => i.isRecommended)
        .sort((a, b) => {
          const idxA = recommendedOrder.indexOf(a.id);
          const idxB = recommendedOrder.indexOf(b.id);
          return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
        });
      setTempRecommendedOrder([...recItems]);
      setTempRecommendedLimit(recommendedLimit);
    } else {
      const currentItems = menuItems
        .filter(i => i.category === activeCategory)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setTempItemsOrder([...currentItems]);
    }
    setRearrangeMode(mode);
    setDrawerOpen(true);
    setCatMenuOpen(false);
    setItemsMenuOpen(false);
  };

  const moveTemp = (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;

    if (rearrangeMode === 'categories') {
      const newOrder = [...tempCategoryOrder];
      if (swapIndex < 0 || swapIndex >= newOrder.length) return;
      [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
      setTempCategoryOrder(newOrder);
    } else if (rearrangeMode === 'recommended') {
      const newItems = [...tempRecommendedOrder];
      if (swapIndex < 0 || swapIndex >= newItems.length) return;
      [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
      setTempRecommendedOrder(newItems);
    } else if (rearrangeMode === 'items') {
      const newItems = [...tempItemsOrder];
      if (swapIndex < 0 || swapIndex >= newItems.length) return;
      [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
      setTempItemsOrder(newItems);
    }
  };

  const handleSaveRearrange = async () => {
    setSaving(true);
    try {
      if (rearrangeMode === 'categories') {
        const cleanOrder = tempCategoryOrder.filter(c => typeof c === 'string' && c.trim() !== '');
        setCategoryOrder(cleanOrder);
        const configRef = doc(db, ...CONFIG_DOC_PATH as [string, string, string, string]);
        await setDoc(configRef, { categoryOrder: cleanOrder }, { merge: true });
        showToast("Urutan kategori berhasil disimpan", "success");
      } else if (rearrangeMode === 'recommended') {
        const newOrder = tempRecommendedOrder.map(item => item.id);
        setRecommendedOrder(newOrder);
        setRecommendedLimit(tempRecommendedLimit);
        const configRef = doc(db, ...CONFIG_DOC_PATH as [string, string, string, string]);
        await setDoc(configRef, { recommendedOrder: newOrder, recommendedLimit: tempRecommendedLimit }, { merge: true });
        showToast("Urutan rekomendasi berhasil disimpan", "success");
      } else {
        // Save Items Order
        const updates = tempItemsOrder.map((item, idx) => {
          return updateDoc(doc(db, ...MENU_COLLECTION_PATH as [string, string, string], item.id), {
            sortOrder: idx + 1
          });
        });
        await Promise.all(updates);
        showToast("Urutan item berhasil disimpan", "success");
        fetchData();
      }
      setDrawerOpen(false);
    } catch (err) {
      console.error("Save Order Error:", err);
      showToast("Gagal menyimpan perubahan", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── DATA PREP ──

  const groupedItems = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    menuItems.forEach(item => {
      const search = searchQuery.toLowerCase();
      if (search && !item.namaMenu.toLowerCase().includes(search)) return;
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    });
    return map;
  }, [menuItems, searchQuery]);

  const activeItems = groupedItems.get(activeCategory) || [];
  const formatPrice = (p: number) => `Rp${(p || 0).toLocaleString("id-ID")}`;

  const hasOrderChanged = useMemo(() => {
    if (rearrangeMode === 'categories') {
      return JSON.stringify(tempCategoryOrder) !== JSON.stringify(categoryOrder);
    } else if (rearrangeMode === 'recommended') {
      const currentIds = menuItems
        .filter(i => i.isRecommended)
        .sort((a, b) => {
          const idxA = recommendedOrder.indexOf(a.id);
          const idxB = recommendedOrder.indexOf(b.id);
          return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
        })
        .map(i => i.id);
      const tempIds = tempRecommendedOrder.map(i => i.id);
      return JSON.stringify(currentIds) !== JSON.stringify(tempIds) || tempRecommendedLimit !== recommendedLimit;
    } else if (rearrangeMode === 'items') {
      const currentIds = menuItems
        .filter(i => i.category === activeCategory)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(i => i.id);
      const tempIds = tempItemsOrder.map(i => i.id);
      return JSON.stringify(currentIds) !== JSON.stringify(tempIds);
    }
    return false;
  }, [rearrangeMode, tempCategoryOrder, categoryOrder, tempItemsOrder, tempRecommendedOrder, recommendedOrder, tempRecommendedLimit, recommendedLimit, menuItems, activeCategory]);

  if (sessionLoading || loadingMenu) {
    return (
      <div className="admin-page">
        <Navbar />
        <div className="admin-loading">
          <div className="spinner" />
          <p>Memuat data...</p>
        </div>
        <AdminStyles />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Navbar />
      {toastMsg && <div className={`toast ${toastMsg.type}`}>{toastMsg.text}</div>}

      {/* Tab Navigation */}
      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'menu' ? 'active' : ''}`} onClick={() => setActiveTab('menu')}>MENU OVERVIEW</button>
        <button className={`admin-tab ${activeTab === 'options' ? 'active' : ''}`} onClick={() => setActiveTab('options')}>OPTION GROUPS</button>
      </div>

      {/* Option Groups Tab */}
      {activeTab === 'options' && (
        <div className="admin-content-wrap">
          <OptionGroupsTab showToast={showToast} />
        </div>
      )}

      {activeTab === 'menu' && <>

        {/* Drawer Overlay */}
        <div className={`drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

        {/* Universal Rearrange Drawer */}
        <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
          <div className="drawer-header">
            <h2>{rearrangeMode === 'categories' ? 'Atur Urutan Kategori' : rearrangeMode === 'recommended' ? 'Atur Urutan Rekomendasi' : `Atur Urutan: ${activeCategory}`}</h2>
            <button className="close-drawer" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <div className="drawer-body">
            <p className="drawer-desc">
              {rearrangeMode === 'categories'
                ? 'Geser naik atau turun untuk mengubah urutan kategori yang akan ditampilkan ke pelanggan.'
                : rearrangeMode === 'recommended'
                ? 'Atur urutan item rekomendasi yang ditampilkan ke pelanggan.'
                : 'Atur urutan item dalam kategori ini agar mempermudah pelanggan dalam memilih.'}
            </p>
            {rearrangeMode === 'recommended' && (
              <div className="rec-limit-row">
                <label>Jumlah ditampilkan:</label>
                <input
                  type="number"
                  min="1"
                  max={tempRecommendedOrder.length || 20}
                  value={tempRecommendedLimit}
                  onChange={e => setTempRecommendedLimit(Math.max(1, Number(e.target.value)))}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className="rec-limit-input"
                />
              </div>
            )}
            <div className="drawer-list">
              {rearrangeMode === 'categories' ? (
                tempCategoryOrder.map((cat, idx) => (
                  <div key={cat} className="drawer-item">
                    <div className="drawer-item-title">
                      <span className="drag-icon">☰</span>
                      {cat}
                    </div>
                    <div className="drawer-item-actions">
                      <button onClick={() => moveTemp(idx, 'up')} disabled={idx === 0}>▲</button>
                      <button onClick={() => moveTemp(idx, 'down')} disabled={idx === tempCategoryOrder.length - 1}>▼</button>
                    </div>
                  </div>
                ))
              ) : rearrangeMode === 'recommended' ? (
                tempRecommendedOrder.map((item, idx) => (
                  <div key={item.id} className={`drawer-item ${idx >= tempRecommendedLimit ? 'dimmed' : ''}`}>
                    <div className="drawer-item-title">
                      <span className="drag-icon">☰</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{item.namaMenu}</span>
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>{formatPrice(item.harga)} · {item.category}</span>
                      </div>
                    </div>
                    <div className="drawer-item-actions">
                      <button onClick={() => moveTemp(idx, 'up')} disabled={idx === 0}>▲</button>
                      <button onClick={() => moveTemp(idx, 'down')} disabled={idx === tempRecommendedOrder.length - 1}>▼</button>
                    </div>
                  </div>
                ))
              ) : (
                tempItemsOrder.map((item, idx) => (
                  <div key={item.id} className="drawer-item">
                    <div className="drawer-item-title">
                      <span className="drag-icon">☰</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{item.namaMenu}</span>
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>{formatPrice(item.harga)}</span>
                      </div>
                    </div>
                    <div className="drawer-item-actions">
                      <button onClick={() => moveTemp(idx, 'up')} disabled={idx === 0}>▲</button>
                      <button onClick={() => moveTemp(idx, 'down')} disabled={idx === tempItemsOrder.length - 1}>▼</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="drawer-footer">
            <button className="btn-cancel" onClick={() => setDrawerOpen(false)}>Batal</button>
            <button
              className="btn-save"
              onClick={handleSaveRearrange}
              disabled={!hasOrderChanged || saving}
            >
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>

        {/* Modals */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="confirm-card" onClick={e => e.stopPropagation()}>
              <div className="confirm-icon">🗑️</div>
              <h3>Hapus Item?</h3>
              <p>Yakin ingin menghapus <strong>{deleteConfirm.namaMenu}</strong>?</p>
              <div className="confirm-actions">
                <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Batal</button>
                <button className="btn-delete" onClick={() => handleDelete(deleteConfirm)}>Hapus</button>
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="modal-overlay" onClick={() => setModalOpen(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingItem ? "Edit Menu" : "Tambah Item Baru"}</h2>
                <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="field"><label>Nama Menu *</label><input value={form.namaMenu} onChange={e => setForm(f => ({ ...f, namaMenu: e.target.value }))} /></div>
                <div className="field-row">
                  <div className="field"><label>Harga *</label><input type="number" onWheel={e => (e.target as HTMLInputElement).blur()} value={form.harga} onChange={e => setForm(f => ({ ...f, harga: Number(e.target.value) }))} /></div>
                  <div className="field">
                    <label>Kategori *</label>
                    <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} list="cat-suggestions" />
                    <datalist id="cat-suggestions">
                      {categoryOrder.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>
                <div className="field">
                  <label>Gambar Menu</label>
                  <div className="img-upload-row">
                    <div className="img-upload-preview" style={{ "--img-ratio": form.imageAspectRatio === "3:4" ? "3/4" : "1" } as React.CSSProperties}>
                      <img
                        src={form.imagePath || "/Logo Canteen 375 (2).png"}
                        alt="Preview"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
                      />
                    </div>
                    <div className="img-upload-actions">
                      <button type="button" className="img-upload-btn" onClick={() => setCropModalOpen(true)}>
                        📷 {form.imagePath ? "Ganti Gambar" : "Upload Gambar"}
                      </button>
                      {form.imagePath && (
                        <button type="button" className="img-remove-btn" onClick={() => setForm(f => ({ ...f, imagePath: "" }))}>
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="field"><label>Isi/Pack (Take-away)</label><input type="number" onWheel={e => (e.target as HTMLInputElement).blur()} min="1" value={form.unitsPerPackage} onChange={e => setForm(f => ({ ...f, unitsPerPackage: Math.max(1, Number(e.target.value)) }))} /></div>
                <div className="field"><label>Deskripsi</label><textarea value={form.menuDescription} onChange={e => setForm(f => ({ ...f, menuDescription: e.target.value }))} rows={2} /></div>
                <div className="toggle-row">
                  <div className="toggle-pill">
                    <button className={`pill-opt ${form.isMakanan ? "active" : ""}`} onClick={() => setForm(f => ({ ...f, isMakanan: true }))}>🍽️ Makanan</button>
                    <button className={`pill-opt ${!form.isMakanan ? "active" : ""}`} onClick={() => setForm(f => ({ ...f, isMakanan: false }))}>🥤 Minuman</button>
                  </div>
                  <button className={`star-btn ${form.isRecommended ? "starred" : ""}`} onClick={() => setForm(f => ({ ...f, isRecommended: !f.isRecommended }))}>
                    {form.isRecommended ? "⭐ Rekomendasi" : "☆ Biasa"}
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setModalOpen(false)}>Batal</button>
                <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? "Wait..." : "Simpan"}</button>
              </div>
            </div>
          </div>
        )}

        {cropModalOpen && (
          <ImageCropModal
            menuName={form.namaMenu}
            onClose={() => setCropModalOpen(false)}
            onSaved={(url, ratio) => {
              setForm(f => ({ ...f, imagePath: url, imageAspectRatio: ratio }));
              setCropModalOpen(false);
            }}
          />
        )}

        {/* Main Content Area */}
        <div className="admin-content-wrap">
          <div className="search-bar-wrap">
            <input className="search-input" placeholder="🔍 Cari nama menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>

          <div className="grab-layout">
            {/* LEFT: Categories */}
            <div className="grab-sidebar">
              <div className="grab-header">
                <span className="grab-header-title">CATEGORIES</span>
                <div className="kebab-wrap" ref={catMenuRef}>
                  <button className="kebab-btn" onClick={() => setCatMenuOpen(!catMenuOpen)}>⋮</button>
                  {catMenuOpen && (
                    <div className="dropdown-menu">
                      <button onClick={() => openRearrangeDrawer('categories')}>Rearrange Categories</button>
                      <button onClick={() => openRearrangeDrawer('recommended')}>Rearrange Recommended</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="categories-list">
                {Array.from(new Set(categoryOrder)).map(cat => {
                  const count = (groupedItems.get(cat) || []).length;
                  return (
                    <div
                      key={`cat-${cat}`}
                      className={`cat-item ${activeCategory === cat ? 'active' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      <span className="cat-name">{cat}</span>
                      <span className="cat-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Items */}
            <div className="grab-main">
              <div className="grab-header">
                <span className="grab-header-title">ITEMS</span>
                <div className="kebab-wrap" ref={itemsMenuRef}>
                  <button className="kebab-btn" onClick={() => setItemsMenuOpen(!itemsMenuOpen)}>⋮</button>
                  {itemsMenuOpen && (
                    <div className="dropdown-menu right">
                      <button onClick={openCreate}>Add New Item</button>
                      <button onClick={() => openRearrangeDrawer('items')}>Rearrange Items</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="items-list">
                {activeItems.length === 0 ? (
                  <div className="empty-items">Belum ada item di kategori ini.</div>
                ) : (
                  activeItems.map((item, idx) => (
                    <div key={item.id} className="menu-item-row">
                      <div className="item-details">
                        <img src={item.imagePath || "/Logo Canteen 375 (2).png"} alt={item.namaMenu} className="item-image" style={{ aspectRatio: item.imageAspectRatio === "3:4" ? "3/4" : "1" }} onError={e => e.currentTarget.src = "/Logo Canteen 375 (2).png"} />
                        <div className="item-text">
                          <span className="item-title">{item.namaMenu} {item.isRecommended && "⭐"}</span>
                          <span className="item-price">{formatPrice(item.harga)}</span>
                          {item.menuDescription && <span className="item-desc">{item.menuDescription}</span>}
                        </div>
                      </div>
                      <div className="item-actions">
                        <button className="act-edit" onClick={() => openEdit(item)}>Edit</button>
                        <button className="act-del" onClick={() => setDeleteConfirm(item)}>✕</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </>}

      <AdminStyles />
    </div>
  );
}

function AdminStyles() {
  return (
    <style jsx global>{`
      .admin-page { min-height: 100vh; background: #f5f7fa; padding-bottom: 3rem; }
      
      .admin-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; }
      .spinner { width: 40px; height: 40px; border: 4px solid #ddd; border-top-color: #00b14f; border-radius: 50%; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .toast { position: fixed; top: 80px; left: 50%; transform: translateX(-50%); padding: 0.7rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .toast.success { background: #00b14f; color: white; }
      .toast.error { background: #d32f2f; color: white; }

      .admin-content-wrap { padding: 2rem; max-width: 1200px; margin: 0 auto; }
      .search-bar-wrap { margin-bottom: 1.5rem; }
      .search-input { width: 100%; max-width: 400px; padding: 0.7rem 1.2rem; border-radius: 8px; border: 1px solid #ddd; font-family: inherit; font-size: 0.95rem; }
      .search-input:focus { outline: none; border-color: #00b14f; }

      /* Grab UI Layout */
      .grab-layout {
        display: flex; background: white; border-radius: 8px; border: 1px solid #e0e0e0;
        min-height: 600px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      }
      .grab-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1rem 1.5rem; border-bottom: 1px solid #e0e0e0; background: #fafafa;
      }
      .grab-header-title { font-weight: 700; font-size: 0.8rem; letter-spacing: 0.5px; color: #333; }

      .admin-tabs { display: flex; border-bottom: 2px solid #e0e0e0; padding: 0 2rem; background: white; }
      .admin-tab { background: none; border: none; padding: 1.1rem 1.5rem; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.5px; cursor: pointer; color: #888; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: 0.2s; }
      .admin-tab.active { color: #1a3c34; border-bottom-color: #1a3c34; }
      .admin-tab:hover:not(.active) { color: #333; }
      
      .kebab-wrap { position: relative; }
      .kebab-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #555; padding: 0 5px; }
      .dropdown-menu {
        position: absolute; top: 100%; left: 0; background: white;
        border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        padding: 0.5rem 0; min-width: 180px; z-index: 10;
      }
      .dropdown-menu.right { left: auto; right: 0; }
      .dropdown-menu button {
        width: 100%; text-align: left; padding: 0.7rem 1.2rem; background: none; border: none;
        cursor: pointer; font-family: inherit; font-size: 0.9rem; color: #333; display: block;
      }
      .dropdown-menu button:hover { background: #f0f0f0; }

      /* Left Sidebar */
      .grab-sidebar { width: 320px; border-right: 1px solid #e0e0e0; display: flex; flex-direction: column; background: white; }
      .categories-list { flex: 1; overflow-y: auto; }
      .cat-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1.2rem 1.5rem; border-bottom: 1px solid #f0f0f0; cursor: pointer;
        transition: background 0.2s;
      }
      .cat-item:hover { background: #f9f9f9; }
      .cat-item.active { background: #f4f6f8; position: relative; }
      .cat-item.active::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #00b14f;
      }
      .cat-name { font-size: 0.95rem; color: #333; font-weight: 500; }
      .cat-item.active .cat-name { font-weight: 700; }
      .cat-count { font-size: 0.85rem; color: #888; }

      /* Right Main */
      .grab-main { flex: 1; display: flex; flex-direction: column; background: white; }
      .items-list { flex: 1; overflow-y: auto; }
      .empty-items { padding: 3rem; text-align: center; color: #888; }
      
      .menu-item-row {
        display: flex; justify-content: space-between; align-items: flex-start;
        padding: 1.5rem; border-bottom: 1px solid #f0f0f0;
      }
      .menu-item-row:hover { background: #fafafa; }
      
      .item-details { display: flex; gap: 1.2rem; flex: 1; }
      .item-image { width: 80px; border-radius: 8px; object-fit: cover; background: #eee; border: 1px solid #eaeaea; }
      .item-text { display: flex; flex-direction: column; gap: 0.3rem; }
      .item-title { font-weight: 600; font-size: 0.95rem; color: #333; }
      .item-price { font-size: 0.9rem; color: #666; }
      .item-desc { font-size: 0.8rem; color: #888; margin-top: 0.2rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

      .item-actions { display: flex; align-items: center; gap: 1rem; }
      
      .mini-order-btns { display: flex; flex-direction: column; gap: 2px; }
      .mini-order-btns button { 
        background: #f5f5f5; border: 1px solid #e0e0e0; font-size: 0.6rem; 
        padding: 3px 8px; cursor: pointer; border-radius: 4px; color: #666; 
      }
      .mini-order-btns button:disabled { opacity: 0.3; cursor: not-allowed; }
      .mini-order-btns button:hover:not(:disabled) { background: #e0e0e0; }

      .act-edit { background: none; border: 1px solid #00b14f; color: #00b14f; padding: 0.4rem 1rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
      .act-edit:hover { background: #e8f5e9; }
      .act-del { background: none; border: none; color: #d32f2f; font-size: 1.2rem; cursor: pointer; padding: 0.2rem; }
      .act-del:hover { background: #ffebee; border-radius: 4px; }


      /* Drawer UI */
      .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: 0.3s; z-index: 1000; }
      .drawer-overlay.open { opacity: 1; pointer-events: auto; }
      
      .drawer {
        position: fixed; top: 0; right: -400px; width: 400px; height: 100vh;
        background: white; box-shadow: -4px 0 24px rgba(0,0,0,0.1);
        z-index: 1001; transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex; flex-direction: column;
      }
      .drawer.open { right: 0; }
      
      .drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid #eee; }
      .drawer-header h2 { font-size: 1.2rem; margin: 0; color: #333; }
      .close-drawer { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #666; }
      
      .drawer-body { padding: 1.5rem; flex: 1; overflow-y: auto; }
      .drawer-desc { font-size: 0.9rem; color: #666; margin-bottom: 1.5rem; line-height: 1.5; }
      
      .drawer-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .drawer-item { 
        display: flex; justify-content: space-between; align-items: center; 
        padding: 1rem; background: #fff; border: 1px solid #ddd; borderRadius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      .drawer-item-title { display: flex; align-items: center; gap: 0.8rem; font-weight: 500; font-size: 0.95rem; }
      .drag-icon { color: #aaa; cursor: grab; font-size: 1.2rem; }
      .drawer-item-actions { display: flex; gap: 0.3rem; }
      .drawer-item-actions button {
        background: #f0f0f0; border: none; padding: 0.4rem 0.6rem; border-radius: 4px; cursor: pointer; color: #555;
      }
      .drawer-item-actions button:disabled { opacity: 0.3; cursor: not-allowed; }
      .drawer-item-actions button:hover:not(:disabled) { background: #e0e0e0; }

      .drawer-footer { padding: 1.5rem; border-top: 1px solid #eee; display: flex; gap: 1rem; background: #fafafa; }
      .drawer-footer .btn-cancel { flex: 1; background: white; border: 1px solid #ccc; padding: 0.8rem; border-radius: 8px; font-weight: 600; cursor: pointer; color: #333; }
      .drawer-footer .btn-save { flex: 2; background: #00b14f; color: white; border: none; padding: 0.8rem; border-radius: 8px; font-weight: 600; cursor: pointer; }
      .drawer-footer .btn-save:disabled { background: #a5d6a7; cursor: not-allowed; }

      .rec-limit-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; padding: 0.75rem; background: #f9f9f9; border-radius: 8px; border: 1px solid #e0e0e0; }
      .rec-limit-row label { font-size: 0.9rem; font-weight: 600; color: #333; white-space: nowrap; }
      .rec-limit-input { width: 60px; padding: 0.4rem 0.5rem; border: 1px solid #ddd; border-radius: 6px; font-family: inherit; font-size: 0.9rem; text-align: center; -moz-appearance: textfield; appearance: textfield; }
      .rec-limit-input::-webkit-outer-spin-button, .rec-limit-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .rec-limit-input:focus { border-color: #00b14f; outline: none; }
      .drawer-item.dimmed { opacity: 0.4; }


      /* Modals */
      .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px); padding: 1rem; }
      .modal-card { background: white; border-radius: 12px; width: 100%; max-width: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); animation: pop 0.2s; }
      @keyframes pop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; }}
      .modal-header { display: flex; justify-content: space-between; padding: 1.5rem; border-bottom: 1px solid #eee; }
      .modal-header h2 { margin: 0; font-size: 1.2rem; font-weight: 700; color: #333; }
      .close-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #888; }
      
      .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
      .field { display: flex; flex-direction: column; gap: 0.4rem; }
      .field label { font-size: 0.85rem; font-weight: 600; color: #555; }
      .field input, .field textarea { padding: 0.7rem; border: 1px solid #ddd; border-radius: 6px; font-family: inherit; }
      .field input[type=number] { -moz-appearance: textfield; appearance: textfield; }
      .field input[type=number]::-webkit-outer-spin-button,
      .field input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .field input:focus, .field textarea:focus { border-color: #00b14f; outline: none; }
      .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

      .img-upload-row { display: flex; align-items: center; gap: 1rem; }
      .img-upload-preview { width: 72px; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; background: #f5f5f5; flex-shrink: 0; }
      .img-upload-preview img { width: 100%; display: block; aspect-ratio: var(--img-ratio, 1); object-fit: cover; }
      .img-upload-actions { display: flex; flex-direction: column; gap: 0.4rem; }
      .img-upload-btn { background: #f0faf4; border: 1px solid #00b14f; color: #00b14f; padding: 0.45rem 1rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
      .img-upload-btn:hover { background: #e0f5e8; }
      .img-remove-btn { background: none; border: none; color: #d32f2f; font-size: 0.75rem; font-weight: 600; cursor: pointer; padding: 0; text-align: left; }
      .img-remove-btn:hover { text-decoration: underline; }

      .toggle-row { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; }
      .toggle-pill { display: flex; background: #f0f0f0; padding: 3px; border-radius: 8px; }
      .pill-opt { border: none; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 600; color: #666; background: transparent; }
      .pill-opt.active { background: white; color: #00b14f; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      
      .star-btn { padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #ddd; background: white; font-weight: 600; font-size: 0.8rem; cursor: pointer; color: #555; }
      .star-btn.starred { border-color: #fbc02d; color: #f57f17; background: #fffde7; }
      
      .modal-footer { padding: 1.25rem 1.5rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 0.75rem; background: #fafafa; border-radius: 0 0 12px 12px; }
      .modal-footer .btn-cancel { background: white; border: 1px solid #ddd; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
      .modal-footer .btn-save { background: #00b14f; color: white; border: none; padding: 0.6rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; }

      .confirm-card { background: white; padding: 2rem; border-radius: 12px; text-align: center; max-width: 320px; }
      .confirm-icon { font-size: 3rem; margin-bottom: 0.5rem; }
      .confirm-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
      .confirm-actions .btn-cancel { flex: 1; padding: 0.7rem; border-radius: 6px; background: #f0f0f0; border: none; font-weight: 600; cursor: pointer; }
      .confirm-actions .btn-delete { flex: 1; padding: 0.7rem; border-radius: 6px; background: #d32f2f; color: white; border: none; font-weight: 600; cursor: pointer; }

      @media (max-width: 768px) {
        .grab-layout { flex-direction: column; }
        .grab-sidebar { width: 100%; border-right: none; border-bottom: 1px solid #e0e0e0; max-height: 250px; }
        .drawer { width: 100%; right: -100%; }
      }
    `}</style>
  );
}