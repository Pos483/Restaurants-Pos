import { useState, useEffect } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { DBCategory, DBStockItem, db } from '../../db';

interface VariantInput {
  name: string;
  price: string;
  stockItemId?: string;
  stockQtyPerUnit?: string;
  isActive?: boolean;
}

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: DBCategory[];
  stockItems: DBStockItem[];
  defaultCategory: string | null;
  onQuickAddStockClick: (displayName: string, targetKey: string) => void;
  // External triggers to update stock items links from quick stock addition
  quickStockLinkedId: string | null;
  quickStockLinkedTarget: string | null;
}

export default function AddItemModal({
  isOpen,
  onClose,
  categories,
  stockItems,
  defaultCategory,
  onQuickAddStockClick,
  quickStockLinkedId,
  quickStockLinkedTarget
}: AddItemModalProps) {
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [hasVariants, setHasVariants] = useState(false);
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStockId, setNewItemStockId] = useState('');
  const [newItemStockQty, setNewItemStockQty] = useState('');
  const [newItemActive, setNewItemActive] = useState(true);
  const [newItemPrinterTarget, setNewItemPrinterTarget] = useState<'kitchen' | 'bar'>('kitchen');
  const [variants, setVariants] = useState<VariantInput[]>([
    { name: 'Half', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true },
    { name: 'Full', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true }
  ]);

  useEffect(() => {
    if (defaultCategory) {
      setNewItemCategory(defaultCategory);
    } else {
      setNewItemCategory('');
    }
  }, [defaultCategory, isOpen]);

  // Handle incoming quick stock links
  useEffect(() => {
    if (quickStockLinkedId && quickStockLinkedTarget) {
      if (quickStockLinkedTarget === 'parent-add') {
        setNewItemStockId(quickStockLinkedId);
      } else if (quickStockLinkedTarget.startsWith('variant-add-')) {
        const idx = parseInt(quickStockLinkedTarget.replace('variant-add-', ''));
        if (!isNaN(idx) && variants[idx]) {
          const newV = [...variants];
          newV[idx] = { ...newV[idx], stockItemId: quickStockLinkedId };
          setVariants(newV);
        }
      }
    }
  }, [quickStockLinkedId, quickStockLinkedTarget]);

  if (!isOpen) return null;

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemCategory) return;
    if (!hasVariants && !newItemPrice) return;
    
    const validVariants = variants.filter((v) => v.name.trim() && v.price);

    await db.menuItems.add({
      id: Date.now().toString(),
      name: newItemName.trim(),
      price: hasVariants ? (Number(validVariants[0]?.price) || 0) : Number(newItemPrice),
      category: newItemCategory,
      isActive: newItemActive,
      variants: hasVariants ? validVariants.map((v) => ({
        name: v.name.trim(),
        price: Number(v.price),
        stockItemId: v.stockItemId || undefined,
        stockQtyPerUnit: v.stockQtyPerUnit ? parseFloat(v.stockQtyPerUnit) : undefined,
        isActive: v.isActive !== false
      })) : [],
      stockItemId: newItemStockId || undefined,
      stockQtyPerUnit: parseFloat(newItemStockQty) || 0,
      printerTarget: newItemPrinterTarget,
    });
    
    // Reset state
    setNewItemName('');
    setNewItemPrice('');
    setNewItemCategory(defaultCategory || '');
    setHasVariants(false);
    setNewItemStockId('');
    setNewItemStockQty('');
    setNewItemActive(true);
    setNewItemPrinterTarget('kitchen');
    setVariants([
      { name: 'Half', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true },
      { name: 'Full', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true }
    ]);
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
              <Plus size={22} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">Menu Item Add करें</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
            <X size={22} className="text-white" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label htmlFor="newItemNameInput" className="block text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Item Name</label>
            <input 
              type="text" 
              id="newItemNameInput"
              placeholder="Item Name (e.g. Paneer Tikka)" 
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              title="Item Name"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800"
            />
          </div>

          <div>
            <label htmlFor="newItemCategorySelect" className="block text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Category</label>
            <select
              id="newItemCategorySelect"
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
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
              onClick={() => setNewItemActive(!newItemActive)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                newItemActive
                  ? 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600'
                  : 'bg-gray-150 border-gray-300 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {newItemActive ? "Active" : "Inactive"}
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-slate-900/40 p-4 rounded-xl border border-gray-200 dark:border-slate-800">
            <label className="flex items-center gap-3 font-bold text-gray-600 dark:text-slate-300 cursor-pointer mb-3">
              <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} className="w-5 h-5 accent-orange-500" />
              Has Variants (Half/Full)?
            </label>
            
            {!hasVariants ? (
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Regular Price</label>
                <input 
                  type="number" 
                  placeholder="Price (₹)" 
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500">Variants (e.g. 250ml, 750ml, 1lt, 2lt, Half, Full)</label>
                {variants.map((v, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-3 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-150 dark:border-slate-700/85">
                    <div className="flex gap-2 items-center w-full">
                      <input 
                        type="text" 
                        placeholder="Name (e.g. 250ml)" 
                        value={v.name} 
                        onChange={(e) => {
                          const newV = [...variants];
                          newV[idx] = { ...newV[idx], name: e.target.value };
                          setVariants(newV);
                        }} 
                        title="Variant Name"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-400 dark:bg-slate-850 dark:text-slate-100" 
                      />
                      <input 
                        type="number" 
                        placeholder="Price (₹)" 
                        value={v.price} 
                        onChange={(e) => {
                          const newV = [...variants];
                          newV[idx] = { ...newV[idx], price: e.target.value };
                          setVariants(newV);
                        }} 
                        title="Variant Price"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-400 dark:bg-slate-850 dark:text-slate-100" 
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newV = [...variants];
                          newV[idx] = { ...newV[idx], isActive: v.isActive === false ? true : false };
                          setVariants(newV);
                        }}
                        className={`px-2.5 py-2 rounded-lg text-xs font-black transition-all border shrink-0 ${
                          v.isActive !== false
                            ? 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600'
                            : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                        title={v.isActive !== false ? "Variant Active" : "Variant Inactive"}
                      >
                        {v.isActive !== false ? "Active" : "Inactive"}
                      </button>
                      {variants.length > 1 && (
                        <button 
                          type="button"
                          onClick={() => {
                            const newV = variants.filter((_, i) => i !== idx);
                            setVariants(newV);
                          }}
                          className="p-2 text-red-500 hover:bg-red-55 rounded-lg shrink-0 transition-colors"
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
                              const newV = [...variants];
                              newV[idx] = { ...newV[idx], stockItemId: e.target.value };
                              setVariants(newV);
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
                              const parentName = newItemName.trim();
                              const varName = variants[idx]?.name.trim();
                              const displayName = parentName && varName ? `${parentName} (${varName})` : varName || parentName;
                              onQuickAddStockClick(displayName, `variant-add-${idx}`);
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
                            const newV = [...variants];
                            newV[idx] = { ...newV[idx], stockQtyPerUnit: e.target.value };
                            setVariants(newV);
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
                  onClick={() => setVariants([...variants, { name: '', price: '', isActive: true }])}
                  className="mt-1 self-start px-3 py-1.5 bg-orange-50 hover:bg-orange-100 dark:bg-slate-805 dark:hover:bg-slate-700 text-orange-600 dark:text-orange-400 text-xs font-black rounded-lg transition-colors border border-orange-100 dark:border-slate-700 flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add Variant Option
                </button>
              </div>
            )}
          </div>

          {!hasVariants && (
            <div className="bg-gray-50 dark:bg-slate-900/40 p-4 rounded-xl border border-gray-200 dark:border-slate-800 flex gap-4">
              <div className="flex-1 min-w-0">
                <label htmlFor="newItemStockId" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Stock Item Link</label>
                <div className="flex gap-2">
                  <select id="newItemStockId" title="Link to Stock Item" value={newItemStockId} onChange={(e) => setNewItemStockId(e.target.value)} className="w-full px-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold bg-white dark:bg-slate-800 dark:text-slate-100">
                    <option value="">No Link</option>
                    {stockItems?.map((si) => (
                      <option key={si.id} value={si.id}>{si.name}</option>
                    ))}
                  </select>
                  <button 
                    type="button"
                    onClick={() => {
                      onQuickAddStockClick(newItemName.trim(), 'parent-add');
                    }}
                    className="px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-md transition-colors shrink-0 flex items-center justify-center"
                    title="Quick Add Stock Item"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <div className="w-24 shrink-0">
                <label htmlFor="newItemStockQty" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Qty</label>
                <input id="newItemStockQty" type="number" step="0.01" value={newItemStockQty} onChange={(e) => setNewItemStockQty(e.target.value)} placeholder="Deduct" title="Quantity" className="w-full px-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold dark:bg-slate-800 dark:text-slate-100" />
              </div>
            </div>
          )}

          <div className="bg-teal-50 dark:bg-teal-950/10 p-4 rounded-xl border border-teal-100 dark:border-teal-900/30">
            <label className="block text-xs font-bold text-teal-600 dark:text-teal-400 mb-2">🖨️ KOT Printer Target</label>
            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-teal-100 dark:border-teal-900/30">
              <button
                type="button"
                onClick={() => setNewItemPrinterTarget('kitchen')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  newItemPrinterTarget === 'kitchen'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-orange-500'
                }`}
              >
                🍽️ Kitchen Printer
              </button>
              <button
                type="button"
                onClick={() => setNewItemPrinterTarget('bar')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  newItemPrinterTarget === 'bar'
                    ? 'bg-teal-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-teal-500'
                }`}
              >
                🍹 Bar Printer
              </button>
            </div>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 opacity-70">Multiple Printer mode me is item ka KOT kahan jayega</p>
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
            onClick={handleAddItem}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-200 dark:shadow-none transition-all flex items-center gap-2"
          >
            <Plus size={18} /> Add Item
          </button>
        </div>
      </div>
    </div>
  );
}
