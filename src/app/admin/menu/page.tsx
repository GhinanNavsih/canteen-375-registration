"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMember } from "@/context/MemberContext";
import Navbar from "@/components/Navbar";
import { MenuItem } from "@/types/menu";

const MENU_COLLECTION = ["Canteens", "canteen375", "MenuCollection"];

const emptyForm = (): Omit<MenuItem, "id"> => ({
  namaMenu: "",
  harga: 0,
  category: "",
  imagePath: "",
  isMakanan: true,
  isRecommended: false,
  menuDescription: "",
});

export default function AdminMenuPage() {
  const { isAdmin, loading } = useMember();
  const router = useRouter();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<Omit<MenuItem, "id">>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<MenuItem | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Guard: only admins
  useEffect(() => {
    if (!loading && !isAdmin) router.push("/login");
  }, [isAdmin, loading, router]);

  const fetchMenu = async () => {
    setLoadingMenu(true);
    try {
      const snap = await getDocs(collection(db, ...MENU_COLLECTION as [string, string, string]));
      setMenuItems(snap.docs.map((d) => ({ ...d.data(), id: d.id } as MenuItem)));
    } catch {
      showToast("Gagal memuat menu", "error");
    } finally {
      setLoadingMenu(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchMenu(); }, [isAdmin]);

  const showToast = (text: string, type: "success" | "error") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({
      namaMenu: item.namaMenu,
      harga: item.harga,
      category: item.category,
      imagePath: item.imagePath,
      isMakanan: item.isMakanan,
      isRecommended: item.isRecommended ?? false,
      menuDescription: item.menuDescription ?? "",
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
      const data = { ...form };
      if (editingItem) {
        await updateDoc(doc(db, ...MENU_COLLECTION as [string, string, string], editingItem.id), data);
        showToast(`"${form.namaMenu}" berhasil diperbarui ✓`, "success");
      } else {
        await addDoc(collection(db, ...MENU_COLLECTION as [string, string, string]), data);
        showToast(`"${form.namaMenu}" berhasil ditambahkan ✓`, "success");
      }
      setModalOpen(false);
      fetchMenu();
    } catch {
      showToast("Gagal menyimpan item", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    try {
      await deleteDoc(doc(db, ...MENU_COLLECTION as [string, string, string], item.id));
      showToast(`"${item.namaMenu}" dihapus`, "success");
      setDeleteConfirm(null);
      fetchMenu();
    } catch {
      showToast("Gagal menghapus item", "error");
    }
  };

  const toggleRecommended = async (item: MenuItem) => {
    try {
      await updateDoc(doc(db, ...MENU_COLLECTION as [string, string, string], item.id), {
        isRecommended: !item.isRecommended,
      });
      fetchMenu();
    } catch {
      showToast("Gagal memperbarui rekomendasi", "error");
    }
  };

  // Derived
  const categories = ["all", ...Array.from(new Set(menuItems.map((i) => i.category))).sort()];
  const filtered = menuItems.filter((item) => {
    const matchSearch = item.namaMenu.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = filterCategory === "all" || item.category === filterCategory;
    return matchSearch && matchCat;
  });

  const formatPrice = (p: number) => `Rp${p.toLocaleString("id-ID")}`;

  if (loading || loadingMenu) {
    return (
      <div className="admin-page">
        <Navbar />
        <div className="admin-loading">
          <div className="spinner" />
          <p>Memuat data menu...</p>
        </div>
        <AdminStyles />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Navbar />

      {/* ── Toast ── */}
      {toastMsg && (
        <div className={`toast ${toastMsg.type}`}>{toastMsg.text}</div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">🗑️</div>
            <h3>Hapus Menu Item?</h3>
            <p>
              Kamu yakin ingin menghapus <strong>{deleteConfirm.namaMenu}</strong>? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Batal</button>
              <button className="btn-delete" onClick={() => handleDelete(deleteConfirm)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingItem ? "Edit Menu Item" : "Tambah Menu Baru"}</h2>
              <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="field">
                <label>Nama Menu *</label>
                <input
                  value={form.namaMenu}
                  onChange={(e) => setForm((f) => ({ ...f, namaMenu: e.target.value }))}
                  placeholder="cth. Nasi Goreng Spesial"
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Harga (Rp) *</label>
                  <input
                    type="number"
                    min={0}
                    value={form.harga}
                    onChange={(e) => setForm((f) => ({ ...f, harga: Number(e.target.value) }))}
                    placeholder="cth. 15000"
                  />
                </div>
                <div className="field">
                  <label>Kategori *</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="cth. Makanan Berat"
                  />
                </div>
              </div>

              <div className="field">
                <label>URL Gambar</label>
                <input
                  value={form.imagePath}
                  onChange={(e) => setForm((f) => ({ ...f, imagePath: e.target.value }))}
                  placeholder="https://... atau path relatif"
                />
                {form.imagePath && (
                  <img
                    src={form.imagePath}
                    alt="preview"
                    className="img-preview"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>

              <div className="field">
                <label>Deskripsi Menu</label>
                <textarea
                  value={form.menuDescription}
                  onChange={(e) => setForm((f) => ({ ...f, menuDescription: e.target.value }))}
                  placeholder="Deskripsi singkat yang menggugah selera..."
                  rows={3}
                />
              </div>

              <div className="toggle-row">
                <div className="toggle-group">
                  <span className="toggle-label">Jenis</span>
                  <div className="toggle-pill">
                    <button
                      className={`pill-opt ${form.isMakanan ? "active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, isMakanan: true }))}
                    >
                      🍽️ Makanan
                    </button>
                    <button
                      className={`pill-opt ${!form.isMakanan ? "active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, isMakanan: false }))}
                    >
                      🥤 Minuman
                    </button>
                  </div>
                </div>

                <div className="toggle-group">
                  <span className="toggle-label">Rekomendasi</span>
                  <button
                    className={`star-btn ${form.isRecommended ? "starred" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, isRecommended: !f.isRecommended }))}
                  >
                    {form.isRecommended ? "⭐ Ya" : "☆ Tidak"}
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalOpen(false)}>Batal</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? "Menyimpan..." : editingItem ? "Simpan Perubahan" : "Tambah Menu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Content ── */}
      <div className="admin-header">
        <div>
          <h1>🍽️ Menu Manager</h1>
          <p>{menuItems.length} item menu terdaftar</p>
        </div>
        <button className="btn-add" onClick={openCreate}>+ Tambah Menu</button>
      </div>

      <div className="admin-content">
        {/* Filters */}
        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="🔍 Cari nama menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="cat-filter"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === "all" ? "Semua Kategori" : c}</option>
            ))}
          </select>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-pill">
            <span>Total</span><strong>{menuItems.length}</strong>
          </div>
          <div className="stat-pill">
            <span>Makanan</span><strong>{menuItems.filter((i) => i.isMakanan).length}</strong>
          </div>
          <div className="stat-pill">
            <span>Minuman</span><strong>{menuItems.filter((i) => !i.isMakanan).length}</strong>
          </div>
          <div className="stat-pill">
            <span>⭐ Rekomendasi</span><strong>{menuItems.filter((i) => i.isRecommended).length}/6</strong>
          </div>
        </div>

        {/* Menu Table */}
        <div className="menu-table-wrap">
          <table className="menu-table">
            <thead>
              <tr>
                <th>Menu</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Jenis</th>
                <th>⭐</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-row">Tidak ada item yang cocok.</td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="item-cell">
                        <img
                          src={item.imagePath || "/Logo Canteen 375 (2).png"}
                          alt={item.namaMenu}
                          className="table-img"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/Logo Canteen 375 (2).png"; }}
                        />
                        <div>
                          <p className="item-name">{item.namaMenu}</p>
                          {item.menuDescription && (
                            <p className="item-desc">{item.menuDescription}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span className="cat-badge">{item.category}</span></td>
                    <td className="price-cell">{formatPrice(item.harga)}</td>
                    <td>
                      <span className={`type-badge ${item.isMakanan ? "food" : "drink"}`}>
                        {item.isMakanan ? "🍽️" : "🥤"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`star-toggle ${item.isRecommended ? "on" : "off"}`}
                        onClick={() => toggleRecommended(item)}
                        title={item.isRecommended ? "Hapus dari rekomendasi" : "Jadikan rekomendasi"}
                      >
                        {item.isRecommended ? "⭐" : "☆"}
                      </button>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-edit" onClick={() => openEdit(item)}>Edit</button>
                        <button className="btn-del" onClick={() => setDeleteConfirm(item)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminStyles />
    </div>
  );
}

function AdminStyles() {
  return (
    <style jsx global>{`
      .admin-page { min-height: 100vh; background: #f5f7fa; }

      .admin-loading {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; height: 60vh; gap: 1rem;
        color: #5d4037; font-weight: 600;
      }
      .spinner {
        width: 40px; height: 40px;
        border: 4px solid #d4a373; border-top-color: #C51720;
        border-radius: 50%; animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Toast */
      .toast {
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700;
        font-size: 0.9rem; z-index: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        animation: slideDown 0.3s ease;
      }
      .toast.success { background: #2e7d32; color: white; }
      .toast.error { background: #C51720; color: white; }
      @keyframes slideDown {
        from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      /* Overlay */
      .overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        z-index: 300; padding: 1rem;
        backdrop-filter: blur(4px);
      }

      /* Create/Edit Modal */
      .modal-card {
        background: white; border-radius: 20px; width: 100%; max-width: 560px;
        max-height: 92vh; overflow-y: auto;
        box-shadow: 0 25px 60px rgba(0,0,0,0.25);
        animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes popIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      .modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1.5rem 1.5rem 1rem;
        border-bottom: 1.5px solid #ece8e3;
      }
      .modal-header h2 { font-size: 1.2rem; font-weight: 800; color: #2d241d; margin: 0; }
      .close-btn {
        background: #f5f7fa; border: none; border-radius: 50%;
        width: 32px; height: 32px; cursor: pointer; font-size: 1rem;
        display: flex; align-items: center; justify-content: center;
      }
      .close-btn:hover { background: #ece8e3; }

      .modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1.1rem; }
      .field { display: flex; flex-direction: column; gap: 0.4rem; }
      .field label { font-size: 0.85rem; font-weight: 700; color: #5d4037; }
      .field input, .field textarea, .field select {
        padding: 0.7rem 0.9rem; border-radius: 10px;
        border: 1.5px solid #d4c5bc; font-family: inherit; font-size: 0.95rem;
        color: #2d241d; background: #faf7f2; transition: border-color 0.2s;
      }
      .field input:focus, .field textarea:focus { outline: none; border-color: #C51720; }
      .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .img-preview {
        width: 100%; height: 140px; object-fit: cover;
        border-radius: 10px; margin-top: 0.5rem; border: 1.5px solid #ece8e3;
      }

      .toggle-row {
        display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center;
      }
      .toggle-group { display: flex; flex-direction: column; gap: 0.4rem; }
      .toggle-label { font-size: 0.85rem; font-weight: 700; color: #5d4037; }
      .toggle-pill {
        display: flex; background: #f0ebe5; border-radius: 20px; padding: 3px; gap: 3px;
      }
      .pill-opt {
        padding: 0.4rem 1rem; border-radius: 18px; border: none; cursor: pointer;
        font-family: inherit; font-size: 0.85rem; font-weight: 700;
        color: #5d4037; background: transparent; transition: all 0.2s;
      }
      .pill-opt.active { background: white; color: #C51720; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }

      .star-btn {
        padding: 0.4rem 1rem; border-radius: 20px; border: 1.5px solid #d4a373;
        background: white; cursor: pointer; font-family: inherit; font-size: 0.85rem;
        font-weight: 700; color: #5d4037; transition: all 0.2s;
      }
      .star-btn.starred { background: #fff8e1; border-color: #f59e0b; color: #a16207; }

      .modal-footer {
        display: flex; gap: 0.75rem; justify-content: flex-end;
        padding: 1rem 1.5rem; border-top: 1.5px solid #ece8e3;
      }

      /* Confirm modal */
      .confirm-card {
        background: white; border-radius: 20px; padding: 2rem; max-width: 360px;
        width: 100%; text-align: center;
        box-shadow: 0 25px 60px rgba(0,0,0,0.2);
        animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .confirm-icon { font-size: 3rem; margin-bottom: 0.75rem; }
      .confirm-card h3 { font-size: 1.2rem; font-weight: 800; color: #2d241d; margin: 0 0 0.5rem; }
      .confirm-card p { font-size: 0.9rem; color: #5d4037; line-height: 1.5; margin: 0 0 1.5rem; }
      .confirm-actions { display: flex; gap: 0.75rem; }

      /* Buttons */
      .btn-cancel, .btn-save, .btn-delete, .btn-edit, .btn-del, .btn-add {
        padding: 0.65rem 1.25rem; border-radius: 10px; font-family: inherit;
        font-size: 0.9rem; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s;
      }
      .btn-cancel { background: #f0ebe5; color: #5d4037; flex: 1; }
      .btn-cancel:hover { background: #ece8e3; }
      .btn-save { background: #C51720; color: white; flex: 1; }
      .btn-save:hover:not(:disabled) { background: #8b0000; }
      .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
      .btn-delete { background: #C51720; color: white; flex: 1; }
      .btn-delete:hover { background: #8b0000; }
      .btn-add {
        background: linear-gradient(135deg, #C51720, #8b0000);
        color: white; padding: 0.75rem 1.5rem; font-size: 1rem;
        box-shadow: 0 4px 14px rgba(197,23,32,0.35);
      }
      .btn-add:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(197,23,32,0.4); }
      .btn-edit { background: #e8f4fd; color: #1565c0; padding: 0.4rem 0.9rem; font-size: 0.82rem; }
      .btn-edit:hover { background: #bbdefb; }
      .btn-del { background: #fdecea; color: #C51720; padding: 0.4rem 0.9rem; font-size: 0.82rem; }
      .btn-del:hover { background: #f9b8b4; }

      /* Page layout */
      .admin-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1.5rem 2rem;
        background: white; border-bottom: 1.5px solid #ece8e3;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }
      .admin-header h1 { font-size: 1.4rem; font-weight: 800; color: #2d241d; margin: 0 0 0.2rem; }
      .admin-header p { font-size: 0.85rem; color: #8d6e63; margin: 0; }

      .admin-content { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }

      .filter-bar {
        display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;
      }
      .search-input {
        flex: 1; min-width: 200px; padding: 0.65rem 1rem;
        border: 1.5px solid #d4c5bc; border-radius: 10px;
        font-family: inherit; font-size: 0.95rem; background: white;
      }
      .search-input:focus { outline: none; border-color: #C51720; }
      .cat-filter {
        padding: 0.65rem 1rem; border: 1.5px solid #d4c5bc; border-radius: 10px;
        font-family: inherit; font-size: 0.95rem; background: white; cursor: pointer;
      }

      .stats-bar {
        display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap;
      }
      .stat-pill {
        background: white; border: 1.5px solid #ece8e3; border-radius: 10px;
        padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.5rem;
        font-size: 0.85rem; color: #5d4037;
      }
      .stat-pill strong { font-size: 1rem; color: #C51720; }

      /* Table */
      .menu-table-wrap {
        background: white; border-radius: 16px;
        border: 1.5px solid #ece8e3; overflow: hidden;
        box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      }
      .menu-table { width: 100%; border-collapse: collapse; }
      .menu-table thead { background: #faf7f2; }
      .menu-table th {
        padding: 0.85rem 1rem; text-align: left;
        font-size: 0.8rem; font-weight: 700; color: #8d6e63;
        border-bottom: 1.5px solid #ece8e3; white-space: nowrap;
      }
      .menu-table td { padding: 0.85rem 1rem; border-bottom: 1px solid #f5f0eb; vertical-align: middle; }
      .menu-table tr:last-child td { border-bottom: none; }
      .menu-table tbody tr:hover { background: #fdf9f7; }

      .item-cell { display: flex; align-items: center; gap: 0.75rem; }
      .table-img { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; flex-shrink: 0; background: #f5f0eb; }
      .item-name { font-weight: 700; font-size: 0.9rem; color: #2d241d; margin: 0 0 0.15rem; }
      .item-desc { font-size: 0.75rem; color: #8d6e63; margin: 0; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .cat-badge { background: #faf7f2; border: 1px solid #d4a373; color: #5d4037; font-size: 0.78rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 20px; white-space: nowrap; }
      .price-cell { font-weight: 800; color: #C51720; white-space: nowrap; }
      .type-badge { font-size: 1.1rem; }

      .star-toggle {
        background: none; border: none; font-size: 1.3rem; cursor: pointer;
        transition: transform 0.2s; line-height: 1;
      }
      .star-toggle.on { transform: scale(1.2); }
      .star-toggle:hover { transform: scale(1.3); }

      .action-btns { display: flex; gap: 0.5rem; }

      .empty-row { text-align: center; color: #8d6e63; padding: 2rem !important; }

      @media (max-width: 700px) {
        .admin-header { padding: 1rem; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
        .admin-content { padding: 1rem; }
        .field-row { grid-template-columns: 1fr; }
        .menu-table-wrap { overflow-x: auto; }
        .menu-table { min-width: 600px; }
      }
    `}</style>
  );
}
