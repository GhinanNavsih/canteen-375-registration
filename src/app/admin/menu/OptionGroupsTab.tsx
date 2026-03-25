"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { OptionGroup, OptionItem, MenuItem } from "@/types/menu";

const OG_PATH = ["Canteens", "canteen375", "OptionGroups"] as const;
const MENU_PATH = ["Canteens", "canteen375", "MenuCollection"] as const;

const emptyGroup = (): Omit<OptionGroup, "id"> => ({
  name: "",
  options: [{ name: "", additionalPrice: 0 }],
  selectionRule: "required",
  ruleType: "exactly",
  ruleCount: 1,
  linkedItemIds: [],
});

export default function OptionGroupsTab({ showToast }: {
  showToast: (text: string, type: "success" | "error") => void;
}) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null>(null);
  const [form, setForm] = useState<Omit<OptionGroup, "id">>(emptyGroup());
  const [saving, setSaving] = useState(false);

  // Kebab
  const [ogMenuOpen, setOgMenuOpen] = useState(false);
  const ogMenuRef = useRef<HTMLDivElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OptionGroup | null>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ogMenuRef.current && !ogMenuRef.current.contains(e.target as Node)) setOgMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ogSnap, menuSnap] = await Promise.all([
        getDocs(collection(db, ...OG_PATH)),
        getDocs(collection(db, ...MENU_PATH)),
      ]);
      const fetchedGroups = ogSnap.docs.map(d => {
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
        });
      const fetchedMenuItems = menuSnap.docs.map(d => ({ ...d.data(), id: d.id } as MenuItem));
      setGroups(fetchedGroups);
      setMenuItems(fetchedMenuItems);
      if (fetchedGroups.length > 0 && !activeGroup) setActiveGroup(fetchedGroups[0].id);
    } catch (err) {
      console.error(err);
      showToast("Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditingGroup(null);
    setForm(emptyGroup());
    setDrawerOpen(true);
  };

  const openEdit = (group: OptionGroup) => {
    setEditingGroup(group);
    setForm({
      name: group.name,
      options: group.options.length > 0 ? [...group.options] : [{ name: "", additionalPrice: 0 }],
      selectionRule: group.selectionRule,
      ruleType: group.ruleType,
      ruleCount: group.ruleCount,
      linkedItemIds: [...group.linkedItemIds],
    });
    setDrawerOpen(true);
    setOgMenuOpen(false);
  };

  const addOption = () => setForm(f => ({ ...f, options: [...f.options, { name: "", additionalPrice: 0 }] }));

  const removeOption = (idx: number) => setForm(f => ({
    ...f, options: f.options.filter((_, i) => i !== idx)
  }));

  const updateOption = (idx: number, field: keyof OptionItem, value: string | number) => {
    setForm(f => {
      const updated = [...f.options];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...f, options: updated };
    });
  };

  const toggleLinkedItem = (id: string) => {
    setForm(f => ({
      ...f,
      linkedItemIds: f.linkedItemIds.includes(id)
        ? f.linkedItemIds.filter(x => x !== id)
        : [...f.linkedItemIds, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Nama Option Group wajib diisi!", "error"); return; }
    const validOptions = form.options.filter(o => o.name.trim() !== "");
    if (validOptions.length === 0) { showToast("Tambahkan minimal 1 option!", "error"); return; }
    setSaving(true);
    try {
      const payload = { ...form, options: validOptions };
      if (editingGroup) {
        await updateDoc(doc(db, ...OG_PATH, editingGroup.id), payload);
        showToast(`"${form.name}" diperbarui ✓`, "success");
      } else {
        const ref = await addDoc(collection(db, ...OG_PATH), payload);
        setActiveGroup(ref.id);
        showToast(`"${form.name}" ditambahkan ✓`, "success");
      }
      setDrawerOpen(false);
      fetchAll();
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan option group", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: OptionGroup) => {
    try {
      await deleteDoc(doc(db, ...OG_PATH, group.id));
      showToast(`"${group.name}" dihapus`, "success");
      setDeleteConfirm(null);
      setActiveGroup("");
      fetchAll();
    } catch {
      showToast("Gagal menghapus", "error");
    }
  };

  const formatPrice = (p: number) => {
    const val = p || 0;
    return val === 0 ? "Gratis" : `+Rp${val.toLocaleString("id-ID")}`;
  };

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedGroup = groups.find(g => g.id === activeGroup);

  if (loading) return <div className="og-loading">Memuat option groups...</div>;

  return (
    <div className="og-wrap">
      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">🗑️</div>
            <h3>Hapus Option Group?</h3>
            <p>Yakin ingin menghapus <strong>{deleteConfirm.name}</strong>? Ini tidak dapat dibatalkan.</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Batal</button>
              <button className="btn-delete" onClick={() => handleDelete(deleteConfirm)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer Overlay */}
      <div className={`drawer-overlay ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />

      {/* Create/Edit Drawer */}
      <div className={`drawer drawer-wide ${drawerOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <h2>{editingGroup ? "Edit Option Group" : "Create New Option Group"}</h2>
          <button className="close-drawer" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
        <div className="drawer-body">

          {/* Group Name */}
          <div className="og-section">
            <div className="og-section-label">OPTION GROUP NAME *</div>
            <input
              className="og-input"
              placeholder="Option group name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Options List */}
          <div className="og-section">
            <div className="og-section-header">
              <div className="og-section-label">OPTIONS</div>
              <button className="og-add-link" onClick={addOption}>+ Add new option</button>
            </div>
            <div className="og-options-list">
              {form.options.map((opt, idx) => (
                <div key={idx} className="og-option-row">
                  <div className="og-option-drag">☰</div>
                  <div className="og-option-fields">
                    <div className="og-option-label">OPTION NAME *</div>
                    <input
                      className="og-input"
                      placeholder="Option name"
                      value={opt.name}
                      onChange={e => updateOption(idx, "name", e.target.value)}
                    />
                    <div className="og-option-label" style={{ marginTop: "0.75rem" }}>ADDITIONAL PRICE</div>
                    <div className="og-price-row">
                      <span className="og-price-prefix">Rp</span>
                      <input
                        className="og-input og-price-input"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={opt.additionalPrice || ""}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, "");
                          updateOption(idx, "additionalPrice", val === "" ? 0 : Number(val));
                        }}
                      />
                    </div>
                  </div>
                  {form.options.length > 1 && (
                    <button className="og-remove-btn" onClick={() => removeOption(idx)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Selection Rules */}
          <div className="og-section og-section-gray">
            <div className="og-section-label">SELECTION RULES</div>
            <div className="og-rule-option">
              <input
                type="radio"
                id="rule-required"
                checked={form.selectionRule === "required"}
                onChange={() => setForm(f => ({ ...f, selectionRule: "required" }))}
              />
              <label htmlFor="rule-required">Your customer must select</label>
              {form.selectionRule === "required" && (
                <div className="og-rule-controls">
                  <select
                    className="og-select"
                    value={form.ruleType}
                    onChange={e => setForm(f => ({ ...f, ruleType: e.target.value as OptionGroup["ruleType"] }))}
                  >
                    <option value="exactly">Exactly</option>
                    <option value="at_least">At least</option>
                    <option value="at_most">At most</option>
                  </select>
                  <input
                    className="og-count-input"
                    type="number"
                    min={1}
                    value={form.ruleCount}
                    onChange={e => setForm(f => ({ ...f, ruleCount: Number(e.target.value) }))}
                  />
                </div>
              )}
            </div>
            <div className="og-rule-option" style={{ marginTop: "1rem" }}>
              <input
                type="radio"
                id="rule-optional"
                checked={form.selectionRule === "optional"}
                onChange={() => setForm(f => ({ ...f, selectionRule: "optional" }))}
              />
              <label htmlFor="rule-optional">Optional for your customer to select</label>
              {form.selectionRule === "optional" && (
                <div className="og-rule-controls">
                  <span style={{ fontSize: "0.85rem", color: "#666" }}>Maximum</span>
                  <input
                    className="og-count-input"
                    type="number"
                    min={1}
                    value={form.ruleCount || 1}
                    onChange={e => setForm(f => ({ ...f, ruleCount: Number(e.target.value) }))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Link Items */}
          <div className="og-section">
            <div className="og-section-label">LINK ITEMS</div>
            <p className="drawer-desc">Select which menu items this option group will apply to.</p>
            <div className="og-link-list">
              {menuItems.map(item => (
                <label key={item.id} className="og-link-item">
                  <input
                    type="checkbox"
                    checked={form.linkedItemIds.includes(item.id)}
                    onChange={() => toggleLinkedItem(item.id)}
                  />
                  <div className="og-link-item-info">
                    <span className="og-link-name">{item.namaMenu}</span>
                    <span className="og-link-cat">{item.category}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

        </div>
        <div className="drawer-footer">
          <button className="btn-cancel" onClick={() => setDrawerOpen(false)}>Batal</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      {/* Top Bar */}
      <div className="og-topbar">
        <button className="btn-create-og" onClick={openCreate}>
          <span>+</span> Create New Option Group
        </button>
        <input
          className="search-input"
          placeholder="🔍 Search by option group name"
          style={{ maxWidth: 320 }}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Two-column layout */}
      <div className="grab-layout">
        {/* LEFT */}
        <div className="grab-sidebar">
          <div className="grab-header">
            <span className="grab-header-title">OPTION GROUPS</span>
            <div className="kebab-wrap" ref={ogMenuRef}>
              <button className="kebab-btn" onClick={() => setOgMenuOpen(!ogMenuOpen)}>⋮</button>
              {ogMenuOpen && selectedGroup && (
                <div className="dropdown-menu">
                  <button onClick={() => openEdit(selectedGroup)}>Edit Group</button>
                  <button style={{ color: "#d32f2f" }} onClick={() => { setDeleteConfirm(selectedGroup); setOgMenuOpen(false); }}>Delete Group</button>
                </div>
              )}
            </div>
          </div>
          <div className="categories-list">
            {filteredGroups.length === 0 ? (
              <div className="empty-items" style={{ padding: "2rem" }}>Belum ada option group.</div>
            ) : (
              filteredGroups.map(g => (
                <div
                  key={g.id}
                  className={`cat-item ${activeGroup === g.id ? "active" : ""}`}
                  onClick={() => setActiveGroup(g.id)}
                >
                  <span className="cat-name">{g.name}</span>
                  <span className="cat-count">{g.options.length}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="grab-main">
          <div className="grab-header">
            <span className="grab-header-title">OPTIONS</span>
            <button className="kebab-btn" style={{ fontSize: "0.8rem", color: "#00b14f", fontWeight: 700 }} onClick={() => selectedGroup && openEdit(selectedGroup)}>
              Edit
            </button>
          </div>
          {!selectedGroup ? (
            <div className="empty-items">Pilih option group di sebelah kiri.</div>
          ) : (
            <div className="items-list">
              {/* Selection Rule Badge */}
              <div className="og-rule-badge">
                {selectedGroup.selectionRule === "required"
                  ? `Required — ${selectedGroup.ruleType === "exactly" ? "Exactly" : selectedGroup.ruleType === "at_least" ? "At least" : "At most"} ${selectedGroup.ruleCount}`
                  : "Optional"}
              </div>
              {/* Linked Items */}
              {(selectedGroup.linkedItemIds.length > 0 || (selectedGroup.linkedMenuItems || []).length > 0) && (
                <div className="og-linked-badge">
                  Linked to: {(() => {
                    // Resolve linked IDs to names where possible
                    const namesFromIds = selectedGroup.linkedItemIds.map(id => {
                      const item = menuItems.find(m => m.id === id);
                      return item?.namaMenu || id;
                    });
                    // Include linkedMenuItems that aren't already covered
                    const extraNames = (selectedGroup.linkedMenuItems || []).filter(
                      name => !namesFromIds.includes(name)
                    );
                    return [...namesFromIds, ...extraNames].filter(Boolean).join(", ");
                  })()}
                </div>
              )}
              {/* Options */}
              {selectedGroup.options.map((opt, i) => (
                <div key={i} className="menu-item-row">
                  <div className="item-text">
                    <span className="item-title">{opt.name}</span>
                    <span className="item-price">{formatPrice(opt.additionalPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .og-wrap { width: 100%; }
        .og-loading { padding: 3rem; text-align: center; color: #888; }
        .og-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
        .btn-create-og {
          display: flex; align-items: center; gap: 0.5rem;
          border: 2px solid #1a3c34; color: #1a3c34; background: white;
          padding: 0.7rem 1.4rem; border-radius: 24px; font-weight: 700; cursor: pointer; font-size: 0.9rem;
        }
        .btn-create-og:hover { background: #f0f9f4; }
        .og-rule-badge {
          margin: 1rem 1.5rem 0; padding: 0.5rem 1rem; background: #e8f5e9;
          color: #2e7d32; border-radius: 20px; font-size: 0.8rem; font-weight: 600; display: inline-block;
        }
        .og-linked-badge {
          margin: 0.5rem 1.5rem 0; padding: 0.4rem 1rem; background: #e3f2fd;
          color: #1565c0; border-radius: 20px; font-size: 0.8rem; font-weight: 500; display: inline-block;
        }
        /* Drawer wide */
        .drawer-wide { width: 520px; right: -540px; }
        .drawer-wide.open { right: 0; }
        /* OG Sections */
        .og-section { padding: 1.5rem; border-bottom: 1px solid #f0f0f0; }
        .og-section-gray { background: #fafafa; }
        .og-section-label { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.5px; color: #333; margin-bottom: 0.75rem; }
        .og-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .og-add-link { background: none; border: none; color: #1976d2; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
        .og-input { width: 100%; padding: 0.7rem; border: 1px solid #ddd; border-radius: 8px; font-family: inherit; font-size: 0.9rem; box-sizing: border-box; }
        .og-input:focus { outline: none; border-color: #00b14f; }
        .og-options-list { display: flex; flex-direction: column; gap: 1rem; }
        .og-option-row { display: flex; gap: 0.75rem; align-items: flex-start; padding: 1rem; border: 1px solid #e0e0e0; border-radius: 10px; background: white; }
        .og-option-drag { color: #bbb; cursor: grab; padding-top: 0.5rem; }
        .og-option-fields { flex: 1; }
        .og-option-label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.5px; color: #555; margin-bottom: 0.4rem; }
        .og-price-row { display: flex; align-items: center; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .og-price-prefix { padding: 0.7rem 0.8rem; background: #f5f5f5; font-weight: 700; color: #555; font-size: 0.85rem; border-right: 1px solid #ddd; }
        .og-price-input { border: none !important; flex: 1; padding: 0.7rem !important; }
        .og-price-input:focus { outline: none; }
        .og-remove-btn { background: #f5f5f5; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; color: #888; flex-shrink: 0; margin-top: 0.4rem; }
        /* Selection Rules */
        .og-rule-option { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
        .og-rule-option input[type="radio"] { accent-color: #00b14f; width: 18px; height: 18px; cursor: pointer; }
        .og-rule-option label { font-size: 0.9rem; color: #333; cursor: pointer; }
        .og-rule-controls { display: flex; gap: 0.5rem; margin-top: 0.75rem; margin-left: 2rem; width: 100%; }
        .og-select { padding: 0.5rem 0.8rem; border: 1px solid #ddd; border-radius: 8px; font-family: inherit; font-size: 0.9rem; }
        .og-count-input { width: 70px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px; text-align: center; font-size: 0.9rem; }
        /* Link Items */
        .og-link-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 250px; overflow-y: auto; }
        .og-link-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.8rem; border: 1px solid #eee; border-radius: 8px; cursor: pointer; }
        .og-link-item:hover { background: #f9f9f9; }
        .og-link-item input[type="checkbox"] { accent-color: #00b14f; width: 16px; height: 16px; flex-shrink: 0; }
        .og-link-item-info { display: flex; flex-direction: column; }
        .og-link-name { font-size: 0.9rem; font-weight: 500; color: #333; }
        .og-link-cat { font-size: 0.75rem; color: #888; }
      `}</style>
    </div>
  );
}
