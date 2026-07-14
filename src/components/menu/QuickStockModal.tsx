import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface QuickStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  quickStockName: string;
  setQuickStockName: (val: string) => void;
  onCreateQuickStock: (name: string, unit: string, minThreshold: string) => void;
}

export default function QuickStockModal({
  isOpen,
  onClose,
  quickStockName,
  setQuickStockName,
  onCreateQuickStock
}: QuickStockModalProps) {
  const [quickStockUnit, setQuickStockUnit] = useState('pcs');
  const [quickStockMinThreshold, setQuickStockMinThreshold] = useState('5');

  useEffect(() => {
    if (isOpen) {
      setQuickStockUnit('pcs');
      setQuickStockMinThreshold('5');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = () => {
    onCreateQuickStock(quickStockName, quickStockUnit, quickStockMinThreshold);
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-[400px] mx-4 overflow-hidden border border-transparent dark:border-slate-800 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">नया stock item जोड़ें</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label htmlFor="quickStockNameInput" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Stock Item Name</label>
            <input
              type="text"
              id="quickStockNameInput"
              placeholder="e.g. Tomato, Coke Bottle"
              value={quickStockName}
              onChange={(e) => setQuickStockName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && quickStockName.trim() && handleCreate()}
              autoFocus
              title="Stock Item Name"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="quickStockUnitInput" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Unit</label>
              <select
                id="quickStockUnitInput"
                value={quickStockUnit}
                onChange={(e) => setQuickStockUnit(e.target.value)}
                title="Stock Item Unit"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800 text-sm"
              >
                <option value="pcs">Pieces (pcs)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="ltr">Liters (ltr)</option>
                <option value="gm">Grams (gm)</option>
                <option value="ml">Milliliters (ml)</option>
              </select>
            </div>
            <div className="w-32">
              <label htmlFor="quickStockMinThresholdInput" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Min Alert Qty</label>
              <input
                type="number"
                id="quickStockMinThresholdInput"
                placeholder="5"
                value={quickStockMinThreshold}
                onChange={(e) => setQuickStockMinThreshold(e.target.value)}
                title="Minimum Threshold"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2 bg-gray-50 dark:bg-slate-900/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!quickStockName.trim()}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-100 dark:shadow-none transition-all"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
