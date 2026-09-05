import { Table } from '../types';
import { Plus, GitMerge } from 'lucide-react';

interface Props {
  tables: Table[];
  onSelectTable: (id: number) => void;
  onAddTable: () => void;
  onOpenMergeModal?: () => void;
}

export default function TableGrid({ tables, onSelectTable, onAddTable, onOpenMergeModal }: Props) {
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const availableCount = tables.filter(t => t.status !== 'occupied').length;

  const getTableMergedIds = (t: Table): number[] => {
    if (t.mergedTableIds && t.mergedTableIds.length > 0) return t.mergedTableIds;
    try {
      const saved = localStorage.getItem(`table_merged_meta_${t.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.mergedTableIds) && parsed.mergedTableIds.length > 0) {
          return parsed.mergedTableIds;
        }
      }
    } catch (_) {}
    return [];
  };

  return (
    <div className="h-full flex flex-col overflow-hidden pb-4 pr-2">
      {/* Top action / stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 px-1 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-black text-gray-800 dark:text-slate-100">
            Dine-In Tables
          </span>
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400 border border-orange-200/50 dark:border-orange-900/30">
              {occupiedCount} Occupied
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30">
              {availableCount} Available
            </span>
          </div>
        </div>

        {onOpenMergeModal && (
          <button
            type="button"
            onClick={onOpenMergeModal}
            title="Tables ko merge karein aur combined bill nikalein"
            className="px-3.5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/15 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <GitMerge size={14} />
            <span>Merge Tables</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-20 pr-1 scrollbar-hide">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {tables.map((table) => {
            const isOccupied = table.status === 'occupied';
            const totalAmount = table.orders.reduce((sum, item) => sum + (item.menuItem.price * item.quantity), 0);
            const mergedIds = getTableMergedIds(table);
            const isMerged = mergedIds.length > 0;

            return (
              <div 
                key={table.id} 
                onClick={() => onSelectTable(table.id)}
                className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col items-center justify-center min-h-[9rem] overflow-hidden relative group hover-lift
                  ${isOccupied 
                    ? 'glass-card-solid border-orange-200 hover:border-orange-400 shadow-md shadow-orange-100 dark:border-orange-800/50 dark:hover:border-orange-500/80 dark:shadow-orange-950/30' 
                    : 'glass-card-solid border-gray-100 hover:border-emerald-300 shadow-sm hover:shadow-lg hover:shadow-emerald-100 dark:border-slate-700/60 dark:hover:border-emerald-600/60 dark:hover:shadow-emerald-950/20'
                  }`}
              >
                {/* Status indicator dot */}
                <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full transition-colors ${
                  isOccupied 
                    ? 'bg-orange-500 shadow-sm shadow-orange-400 animate-pulse dark:bg-orange-400'
                    : 'bg-emerald-500 shadow-sm shadow-emerald-400 dark:bg-emerald-400'
                }`} />
                
                {table.tablePin && (
                  <div className="absolute top-3 left-3 text-[9px] font-black tracking-wider text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200/20 uppercase">
                    PIN: {table.tablePin}
                  </div>
                )}
                <div className={`text-xl font-black transition-colors w-full text-center truncate px-2 ${isOccupied ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 group-hover:text-emerald-600 dark:text-slate-200 dark:group-hover:text-emerald-400'}`}>
                  Table {table.id}
                </div>
                <div className={`text-xs font-bold mt-1.5 px-2.5 py-0.5 rounded-full transition-colors max-w-full truncate ${
                  isOccupied 
                    ? 'text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-950/50' 
                    : 'text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/50'
                }`}>
                  {isOccupied ? 'Occupied' : 'Available'}
                </div>
                {isOccupied && (
                  <div className="mt-2 text-xs font-black bg-white/80 backdrop-blur-sm px-3 py-1 rounded-lg text-orange-600 shadow-sm border border-orange-100 dark:bg-slate-800/80 dark:text-orange-400 dark:border-orange-900/40 max-w-full truncate">
                    ₹{totalAmount.toFixed(2)}
                  </div>
                )}
                {isMerged && (
                  <div className="mt-1.5 text-[10px] font-black text-amber-700 bg-amber-100/90 dark:text-amber-300 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50 flex items-center gap-1 shadow-sm max-w-full truncate">
                    <GitMerge size={10} className="shrink-0" />
                    <span>+{mergedIds.join(', +')}</span>
                  </div>
                )}
              </div>
            );
          })}
          
          <div 
            onClick={onAddTable}
            className="p-6 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-400 bg-gray-50/50 hover:bg-indigo-50 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center min-h-[9rem] overflow-hidden group dark:border-slate-700/60 dark:bg-slate-900/30 dark:hover:bg-indigo-950/20 dark:hover:border-indigo-500/60"
          >
            <div className="bg-white p-2.5 rounded-full shadow-sm text-gray-400 group-hover:text-indigo-600 group-hover:shadow-md transition-all mb-2 dark:bg-slate-800 dark:text-slate-500 dark:group-hover:text-indigo-400 dark:group-hover:shadow-indigo-950/30">
              <Plus size={24} />
            </div>
            <div className="text-sm font-bold text-gray-500 group-hover:text-indigo-600 transition-colors dark:text-slate-400 dark:group-hover:text-indigo-400">
              Add Table
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
