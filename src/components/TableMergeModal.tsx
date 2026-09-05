import { useState, useMemo, useEffect } from 'react';
import { Table, OrderItem } from '../types';
import { GitMerge, X, AlertCircle, Check, ArrowRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  tables: Table[];
  initialTargetTableId?: number | null;
  onClose: () => void;
  onMerge: (targetTableId: number, sourceTableIds: number[]) => Promise<void>;
}

export default function TableMergeModal({
  isOpen,
  tables,
  initialTargetTableId,
  onClose,
  onMerge,
}: Props) {
  const occupiedTables = useMemo(() => {
    return tables.filter(t => (t.orders && t.orders.length > 0) || t.status === 'occupied');
  }, [tables]);

  const [targetTableId, setTargetTableId] = useState<number>(() => {
    if (initialTargetTableId) return initialTargetTableId;
    return occupiedTables[0]?.id || tables[0]?.id || 1;
  });

  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync target table if initialTargetTableId changes or modal re-opens
  useEffect(() => {
    if (isOpen) {
      if (initialTargetTableId) {
        setTargetTableId(initialTargetTableId);
      } else if (occupiedTables.length > 0) {
        setTargetTableId(occupiedTables[0].id);
      }
      setSelectedSourceIds([]);
      setIsSubmitting(false);
    }
  }, [isOpen, initialTargetTableId, occupiedTables]);

  if (!isOpen) return null;

  const targetTable = tables.find(t => t.id === targetTableId);

  // Candidate source tables: all tables that have orders or are occupied, excluding current target table
  const availableSourceTables = tables.filter(
    t => t.id !== targetTableId && ((t.orders && t.orders.length > 0) || t.status === 'occupied')
  );

  const toggleSourceTable = (id: number) => {
    setSelectedSourceIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getTableSubtotal = (orders: OrderItem[] = []) => {
    return orders.reduce(
      (sum, o) => sum + (o.menuItem?.price || o.price || 0) * (o.quantity || 0),
      0
    );
  };

  const targetSubtotal = getTableSubtotal(targetTable?.orders);
  const targetItemCount = targetTable?.orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

  const selectedSources = tables.filter(t => selectedSourceIds.includes(t.id));
  const sourceSubtotal = selectedSources.reduce(
    (sum, t) => sum + getTableSubtotal(t.orders),
    0
  );
  const sourceItemCount = selectedSources.reduce(
    (sum, t) => sum + t.orders.reduce((s, o) => s + (o.quantity || 0), 0),
    0
  );

  const combinedTotal = targetSubtotal + sourceSubtotal;
  const combinedItemCount = targetItemCount + sourceItemCount;

  const handleSubmit = async () => {
    if (selectedSourceIds.length === 0 || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onMerge(targetTableId, selectedSourceIds);
      onClose();
    } catch (err) {
      console.error('Merge tables failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#0f172a] border border-gray-100 dark:border-slate-800 rounded-3xl p-6 w-full max-w-xl shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center border border-orange-200 dark:border-orange-900/50 shadow-sm">
              <GitMerge size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-800 dark:text-slate-100">
                Merge Tables / टेबल मर्ज
              </h2>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-400">
                Multiple tables ka bill ek saath banane ke liye tables ko merge karein
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Target Table Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-gray-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span>1. Main Table (Jisme sabhi orders jodna hai)</span>
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {tables
              .filter(t => (t.orders && t.orders.length > 0) || t.status === 'occupied' || t.id === targetTableId)
              .map(t => {
                const isSelected = t.id === targetTableId;
                const tot = getTableSubtotal(t.orders);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTargetTableId(t.id);
                      setSelectedSourceIds(prev => prev.filter(id => id !== t.id));
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/80 dark:bg-orange-950/40 text-orange-900 dark:text-orange-300 shadow-sm'
                        : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300 text-gray-700 dark:text-slate-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 bg-orange-500 text-white rounded-full flex items-center justify-center">
                        <Check size={11} strokeWidth={3} />
                      </div>
                    )}
                    <span className="font-black text-sm">Table {t.id}</span>
                    <span className="text-[11px] font-bold text-gray-400 dark:text-slate-400 mt-1">
                      ₹{tot.toFixed(2)}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Source Tables Multi-select */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-gray-600 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>2. Merge hone wali Tables (Select karein)</span>
            <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 normal-case">
              {selectedSourceIds.length} Selected
            </span>
          </label>

          {availableSourceTables.length === 0 ? (
            <div className="p-5 text-center bg-gray-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 text-gray-400 dark:text-slate-500 text-xs font-semibold">
              Koi doosri occupied table available nahi hai jise merge kiya ja sake.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {availableSourceTables.map(t => {
                const isSelected = selectedSourceIds.includes(t.id);
                const tot = getTableSubtotal(t.orders);
                const qty = t.orders.reduce((sum, o) => sum + (o.quantity || 0), 0);
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleSourceTable(t.id)}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10 dark:border-orange-500/60 dark:bg-orange-950/30'
                        : 'border-gray-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 hover:bg-gray-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-800 dark:text-slate-100 flex items-center gap-2">
                          <span>Table {t.id}</span>
                          {t.customerName && (
                            <span className="text-xs font-semibold text-gray-400 dark:text-slate-400">
                              ({t.customerName})
                            </span>
                          )}
                          {t.mergedTableIds && t.mergedTableIds.length > 0 && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md">
                              +{t.mergedTableIds.join(', +')}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-gray-400 dark:text-slate-500">
                          {qty} {qty === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-sm text-gray-800 dark:text-slate-200">
                        ₹{tot.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Combined Summary Live Preview */}
        {selectedSourceIds.length > 0 && (
          <div className="bg-gradient-to-br from-orange-50/70 to-amber-50/70 dark:from-orange-950/20 dark:to-amber-950/20 border border-orange-200/80 dark:border-orange-900/40 rounded-2xl p-4 flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-black text-orange-900 dark:text-orange-300 uppercase tracking-wider">
              <span>Combined Bill Preview</span>
              <span>Table {targetTableId} + {selectedSourceIds.map(id => `Table ${id}`).join(', ')}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-300 font-semibold border-b border-orange-200/40 dark:border-orange-900/30 pb-2">
              <div className="flex items-center gap-1.5">
                <span>Table {targetTableId} (₹{targetSubtotal.toFixed(2)})</span>
                <ArrowRight size={12} className="text-orange-500" />
                <span>Merged Tables (₹{sourceSubtotal.toFixed(2)})</span>
              </div>
              <span className="font-bold">{combinedItemCount} Total Items</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-gray-800 dark:text-slate-100">
                New Total Amount:
              </span>
              <span className="text-xl font-black text-orange-600 dark:text-orange-400">
                ₹{combinedTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex items-start gap-2 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-xl border border-orange-100 dark:border-orange-900/30 text-[11px] text-gray-600 dark:text-slate-400 font-medium">
              <AlertCircle size={15} className="text-orange-500 shrink-0 mt-0.5" />
              <span>
                <strong>Table {selectedSourceIds.join(', ')}</strong> ke sabhi orders <strong>Table {targetTableId}</strong> me merge ho jayenge aur Table {selectedSourceIds.join(', ')} khali ho jayegi.
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-2xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedSourceIds.length === 0 || isSubmitting}
            onClick={handleSubmit}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <GitMerge size={16} />
            {isSubmitting ? 'Merging...' : `Merge into Table ${targetTableId}`}
          </button>
        </div>

      </div>
    </div>
  );
}
