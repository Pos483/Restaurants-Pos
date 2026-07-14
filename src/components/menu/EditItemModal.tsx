import { useState, useEffect } from 'react';
import { Save, X, Trash2, Plus } from 'lucide-react';
import { DBCategory, DBStockItem, DBMenuItem, db } from '../../db';

interface VariantInput {
  name: string;
  price: string;
  stockItemId?: string;
  stockQtyPerUnit?: string;
  isActive?: boolean;
}

interface EditItemModalProps {
  editingItem: DBMenuItem | null;
  onClose: () => void;
  categories: DBCategory[];
  stockItems: DBStockItem[];
  onQuickAddStockClick: (displayName: string, targetKey: string) => void;
  // External triggers to update stock items links from quick stock addition
  quickStockLinkedId: string | null;
  quickStockLinkedTarget: string | null;
}

export default function EditItemModal({
  editingItem,
  onClose,
  categories,
  stockItems,
  onQuickAddStockClick,
  quickStockLinkedId,
  quickStockLinkedTarget
}: EditItemModalProps) {
  const [editItemName, setEditItemName] = useState('');
  const [editItemCategory, setEditItemCategory] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editHasVariants, setEditHasVariants] = useState(false);
  const [editItemActive, setEditItemActive] = useState(true);
  const [editVariants, setEditVariants] = useState<VariantInput[]>([
    { name: 'Half', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true },
    { name: 'Full', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true }
  ]);
  const [editItemStockId, setEditItemStockId] = useState('');
  const [editItemStockQty, setEditItemStockQty] = useState('');
  const [editItemPrinterTarget, setEditItemPrinterTarget] = useState<'kitchen' | 'bar'>('kitchen');

  useEffect(() => {
    if (editingItem) {
      setEditItemName(editingItem.name);
      setEditItemCategory(editingItem.category);
      setEditItemPrice(String(editingItem.price));
      setEditItemActive(editingItem.isActive !== false);
      if (editingItem.variants && editingItem.variants.length > 0) {
        setEditHasVariants(true);
        setEditVariants(editingItem.variants.map((v) => ({
          name: v.name,
          price: String(v.price),
          stockItemId: v.stockItemId || '',
          stockQtyPerUnit: v.stockQtyPerUnit !== undefined ? String(v.stockQtyPerUnit) : '',
          isActive: v.isActive !== false
        })));
      } else {
        setEditHasVariants(false);
        setEditVariants([
          { name: 'Half', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true },
          { name: 'Full', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true }
        ]);
      }
      setEditItemStockId(editingItem.stockItemId || '');
      setEditItemStockQty(editingItem.stockQtyPerUnit ? String(editingItem.stockQtyPerUnit) : '');
      setEditItemPrinterTarget(editingItem.printerTarget || 'kitchen');
    }
  }, [editingItem]);

  // Handle incoming quick stock links
  useEffect(() => {
    if (quickStockLinkedId && quickStockLinkedTarget) {
      if (quickStockLinkedTarget === 'parent-edit') {
        setEditItemStockId(quickStockLinkedId);
      } else if (quickStockLinkedTarget.startsWith('variant-edit-')) {
        const idx = parseInt(quickStockLinkedTarget.replace('variant-edit-', ''));
        if (!isNaN(idx) && editVariants[idx]) {
          const newV = [...editVariants];
          newV[idx] = { ...newV[idx], stockItemId: quickStockLinkedId };
          setEditVariants(newV);
        }
      }
    }
  }, [quickStockLinkedId, quickStockLinkedTarget]);

  if (!editingItem) return null;

  const handleSaveItem = async () => {
    if (!editItemName.trim() || !editItemCategory) return;
    
    const validVariants = editVariants.filter((v) => v.name.trim() && v.price);

    await db.menuItems.update(editingItem.id, {
      name: editItemName.trim(),
      category: editItemCategory,
      price: editHasVariants ? (Number(validVariants[0]?.price) || 0) : Number(editItemPrice),
      isActive: editItemActive,
      variants: editHasVariants ? validVariants.map((v) => ({
        name: v.name.trim(),
        price: Number(v.price),
        stockItemId: v.stockItemId || undefined,
        stockQtyPerUnit: v.stockQtyPerUnit ? parseFloat(v.stockQtyPerUnit) : undefined,
        isActive: v.isActive !== false
      })) : [],
      stockItemId: editItemStockId || undefined,
      stockQtyPerUnit: parseFloat(editItemStockQty) || 0,
      printerTarget: editItemPrinterTarget,
    });

    onClose();
  };

  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden border border-transparent dark:border-slate-800/80 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <Save size={22} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">Item Edit करें</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
            <X size={22} className="text-white" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label htmlFor="editItemNameInput" className="block text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Item Name</label>
            <input
              type="text"
              id="editItemNameInput"
              value={editItemName}
              onChange={(e) => setEditItemName(e.target.value)}
              placeholder="Item Name"
              title="Item Name"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-400 font-bold text-gray-800 dark:text-slate-100 text-lg dark:bg-slate-800"
            />
          </div>

          <div>
            <label htmlFor="editItemCategorySelect" className="block text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Category</label>
            <select
              id="editItemCategorySelect"
              value={editItemCategory}
              onChange={(e) => setEditItemCategory(e.target.value)}
              title="Select Category"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 bg-white dark:bg-slate-800"
            >
              <option value="" disabled>Select Category</option>
              {sortedCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/40 rounded-xl border border-gray-250 dark:border-slate-800">
            <span className="text-sm font-bold text-gray-700 dark:text-slate-300">Item Status (Active / Inactive)</span>
            <button
              type="button"
              onClick={() => setEditItemActive(!editItemActive)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                editItemActive
                  ? 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600'
                  : 'bg-gray-150 border-gray-300 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {editItemActive ? "Active" : "Inactive"}
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-slate-900/40 p-4 rounded-xl border border-gray-200 dark:border-slate-800">
            <label className="flex items-center gap-3 font-bold text-gray-600 dark:text-slate-300 cursor-pointer mb-3">
              <input 
                type="checkbox" 
                checked={editHasVariants} 
                onChange={(e) => setEditHasVariants(e.target.checked)} 
                className="w-5 h-5 accent-orange-500" 
              />
              Has Variants (Half/Full)?
            </label>

            {!editHasVariants ? (
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Regular Price</label>
                <input
                  type="number"
                  value={editItemPrice}
                  onChange={(e) => setEditItemPrice(e.target.value)}
                  placeholder="₹"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-400 font-bold text-gray-800 dark:text-slate-100 text-lg dark:bg-slate-800"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500">Variants (e.g. 250ml, 750ml, 1lt, 2lt, Half, Full)</label>
                {editVariants.map((v, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-3 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-150 dark:border-slate-700/85">
                    <div className="flex gap-2 items-center w-full">
                      <input 
                        type="text" 
                        placeholder="Name (e.g. 250ml)" 
                        value={v.name} 
                        onChange={(e) => {
                          const newV = [...editVariants];
                          newV[idx] = { ...newV[idx], name: e.target.value };
                          setEditVariants(newV);
                        }} 
                        title="Variant Name"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-450 dark:bg-slate-900 dark:text-slate-100" 
                      />
                      <input 
                        type="number" 
                        placeholder="Price (₹)" 
                        value={v.price} 
                        onChange={(e) => {
                          const newV = [...editVariants];
                          newV[idx] = { ...newV[idx], price: e.target.value };
                          setEditVariants(newV);
                        }} 
                        title="Variant Price"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-450 dark:bg-slate-900 dark:text-slate-100" 
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newV = [...editVariants];
                          newV[idx] = { ...newV[idx], isActive: v.isActive === false ? true : false };
                          setEditVariants(newV);
                        }}
                        className={`px-2.5 py-2 rounded-lg text-xs font-black transition-all border shrink-0 ${
                          v.isActive !== false
                            ? 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600'
                            : 'bg-gray-105 border-gray-200 text-gray-500 hover:bg-gray-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                        title={v.isActive !== false ? "Variant Active" : "Variant Inactive"}
                      >
                        {v.isActive !== false ? "Active" : "Inactive"}
                      </button>
                      {editVariants.length > 1 && (
                        <button 
                          type="button"
                          onClick={() => {
                            const newV = editVariants.filter((_, i) => i !== idx);
                            setEditVariants(newV);
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg shrink-0 transition-colors"
                          title="Remove Variant"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 items-center w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex gap-1.5">
                          <select 
                            title="Link Variant to Stock" 
                            value={v.stockItemId || ''} 
                            onChange={(e) => {
                              const newV = [...editVariants];
                              newV[idx] = { ...newV[idx], stockItemId: e.target.value };
                              setEditVariants(newV);
                            }} 
                            className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="">No Stock Link</option>
                            {stockItems?.map((si) => (
                              <option key={si.id} value={si.id}>{si.name}</option>
                            ))}
                          </select>
                          <button 
                            type="button"
                            onClick={() => {
                              const parentName = editItemName.trim();
                              const varName = editVariants[idx]?.name.trim();
                              const displayName = parentName && varName ? `${parentName} (${varName})` : varName || parentName;
                              onQuickAddStockClick(displayName, `variant-edit-${idx}`);
                            }}
                            className="px-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors shrink-0 flex items-center justify-center"
                            title="Quick Add Stock Item"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="w-24 shrink-0">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={v.stockQtyPerUnit || ''} 
                          onChange={(e) => {
                            const newV = [...editVariants];
                            newV[idx] = { ...newV[idx], stockQtyPerUnit: e.target.value };
                            setEditVariants(newV);
                          }} 
                          placeholder="Qty" 
                          title="Deduct Qty" 
                          className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold dark:bg-slate-900 dark:text-slate-100" 
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button 
                  type="button"
                  onClick={() => setEditVariants([...editVariants, { name: '', price: '', isActive: true }])}
                  className="mt-1 self-start px-3 py-1.5 bg-orange-50 hover:bg-orange-100 dark:bg-slate-805 dark:hover:bg-slate-700 text-orange-600 dark:text-orange-400 text-xs font-black rounded-lg transition-colors border border-orange-100 dark:border-slate-700 flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add Variant Option
                </button>
              </div>
            )}
          </div>

          {!editHasVariants && (
            <div className="bg-gray-50 dark:bg-slate-900/40 p-4 rounded-xl border border-gray-200 dark:border-slate-800 flex gap-4">
              <div className="flex-1 min-w-0">
                <label htmlFor="editItemStockIdSelect" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Stock Item Link</label>
                <div className="flex gap-2">
                  <select id="editItemStockIdSelect" title="Link to Stock Item" value={editItemStockId} onChange={(e) => setEditItemStockId(e.target.value)} className="w-full px-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold bg-white dark:bg-slate-800 dark:text-slate-100">
                    <option value="">No Link</option>
                    {stockItems?.map((si) => (
                      <option key={si.id} value={si.id}>{si.name}</option>
                    ))}
                  </select>
                  <button 
                    type="button"
                    onClick={() => {
                      onQuickAddStockClick(editItemName.trim(), 'parent-edit');
                    }}
                    className="px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-md transition-colors shrink-0 flex items-center justify-center"
                    title="Quick Add Stock Item"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <div className="w-24 shrink-0">
                <label htmlFor="editItemStockQtyInput" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Qty</label>
                <input id="editItemStockQtyInput" type="number" step="0.01" value={editItemStockQty} onChange={(e) => setEditItemStockQty(e.target.value)} placeholder="Deduct" title="Quantity" className="w-full px-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold dark:bg-slate-805 dark:text-slate-100" />
              </div>
            </div>
          )}

          <div className="bg-teal-50 dark:bg-teal-950/10 p-4 rounded-xl border border-teal-100 dark:border-teal-900/30">
            <label className="block text-xs font-bold text-teal-600 dark:text-teal-400 mb-2">🖨️ KOT Printer Target</label>
            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-teal-100 dark:border-teal-900/30">
              <button
                type="button"
                onClick={() => setEditItemPrinterTarget('kitchen')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  editItemPrinterTarget === 'kitchen'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-orange-500'
                }`}
              >
                🍽️ Kitchen Printer
              </button>
              <button
                type="button"
                onClick={() => setEditItemPrinterTarget('bar')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  editItemPrinterTarget === 'bar'
                    ? 'bg-teal-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-teal-500'
                }`}
              >
                🍹 Bar Printer
              </button>
            </div>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 opacity-70">In Multiple Printer mode, this item's KOT will be sent to the selected printer</p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-slate-800/80 flex justify-end gap-3 bg-gray-50 dark:bg-slate-900/30">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveItem}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-200 dark:shadow-none transition-all flex items-center gap-2"
          >
            <Save size={18} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
