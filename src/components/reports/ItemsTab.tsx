import { useMemo } from 'react';
import { Layers } from 'lucide-react';

interface ItemsTabProps {
  itemStats: Record<string, { qty: number; revenue: number; category: string }>;
}

export default function ItemsTab({ itemStats }: ItemsTabProps) {
  const topItems = useMemo(() => {
    return Object.entries(itemStats)
      .map(([name, data]: any) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);
  }, [itemStats]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg"><Layers size={14} className="text-emerald-600 dark:text-emerald-400" /></div>
          <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Item Performance</h2>
        </div>
        <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/20 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-400">
          {topItems.length} items sold
        </span>
      </div>
      <div className="flex-1 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left">
          <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
            <tr className="text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
              <th className="py-3 px-5 w-12">#</th>
              <th className="py-3 px-4">Item Name</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4 text-center">Qty Sold</th>
              <th className="py-3 px-5 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {topItems.map((item, index) => (
              <tr key={item.name} className={`border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors ${index < 3 ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                <td className="py-3 px-5">
                  {index < 3 ? (
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black text-white ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-gray-400' : 'bg-amber-700'}`}>
                      {index + 1}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{index + 1}</span>
                  )}
                </td>
                <td className="py-3 px-4 font-bold text-gray-800 dark:text-slate-200 text-xs">
                  <div className="truncate max-w-[200px]" title={item.name}>{item.name}</div>
                </td>
                <td className="py-3 px-4">
                  <span className="bg-gray-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md text-xs font-bold text-gray-500 dark:text-slate-400 truncate max-w-[120px] inline-block align-middle" title={item.category}>{item.category}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-md text-xs font-black">{item.qty}</span>
                </td>
                <td className="py-3 px-5 text-right font-black text-gray-800 dark:text-slate-200 text-xs">₹{item.revenue.toFixed(2)}</td>
              </tr>
            ))}
            {topItems.length === 0 && (
              <tr><td colSpan={5} className="p-12 text-center text-gray-400 font-semibold">No items sold in this date range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
