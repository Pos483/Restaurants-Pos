import { Table } from '../types';

interface Props {
  tables: Table[];
  onSelectTable: (id: number) => void;
  onAddTable: () => void;
}

import { Plus } from 'lucide-react';

export default function TableGrid({ tables, onSelectTable, onAddTable }: Props) {
  return (
    <div className="h-full overflow-y-auto pb-20 pr-2 scrollbar-hide">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {tables.map((table) => {
        const isOccupied = table.status === 'occupied';
        const totalAmount = table.orders.reduce((sum, item) => sum + (item.menuItem.price * item.quantity), 0);

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
              <div className="mt-2.5 text-xs font-black bg-white/80 backdrop-blur-sm px-3 py-1 rounded-lg text-orange-600 shadow-sm border border-orange-100 dark:bg-slate-800/80 dark:text-orange-400 dark:border-orange-900/40 max-w-full truncate">
                ₹{totalAmount.toFixed(2)}
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
  );
}
