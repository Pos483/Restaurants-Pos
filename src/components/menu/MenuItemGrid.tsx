import { UtensilsCrossed, FileSpreadsheet, Plus, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { DBMenuItem, db } from '../../db';

interface MenuItemGridProps {
  filteredItems: DBMenuItem[];
  selectedCategory: string | null;
  onAddItemClick: () => void;
  onCsvImportClick: () => void;
  onEditItem: (item: DBMenuItem) => void;
  onDeleteItem: (id: string) => void;
}

export default function MenuItemGrid({
  filteredItems,
  selectedCategory,
  onAddItemClick,
  onCsvImportClick,
  onEditItem,
  onDeleteItem
}: MenuItemGridProps) {
  const toggleItemActive = async (item: DBMenuItem) => {
    await db.menuItems.update(item.id, { isActive: item.isActive !== false ? false : true });
  };

  return (
    <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden min-h-[300px] transition-colors duration-300">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800/80 bg-orange-50 dark:bg-slate-900/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2 rounded-xl text-white shadow-md">
            <UtensilsCrossed size={18} />
          </div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
            {selectedCategory ? selectedCategory : 'All Menu Items'}
          </h2>
          <span className="bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full text-xs font-bold">{filteredItems.length} items</span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onCsvImportClick}
            className="px-4 py-2 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 border border-transparent dark:border-emerald-800/30 shadow-sm"
          >
            <FileSpreadsheet size={16} /> Import from Excel / CSV
          </button>
          <button 
            onClick={onAddItemClick}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shadow-md shadow-orange-100 dark:shadow-none"
          >
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-2">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 font-bold border-b border-gray-100 dark:border-slate-800 text-sm">
              <th className="pb-2 pl-4">Item Name</th>
              <th className="pb-2">Category</th>
              <th className="pb-2">Price</th>
              <th className="pb-2 text-right pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className="border-b border-gray-50 dark:border-slate-800/40 hover:bg-gray-55 dark:hover:bg-slate-800/40 transition-colors group">
                <td className="py-2 pl-4 font-bold text-gray-800 dark:text-slate-200 text-sm max-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="truncate block">{item.name}</span>
                    {item.isActive === false && (
                      <span className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                        Inactive
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-gray-500 dark:text-slate-400 font-medium max-w-[150px]">
                  <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-xs truncate inline-block max-w-full" title={item.category}>{item.category}</span>
                  {item.printerTarget === 'bar' && (
                    <span className="ml-1 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-full text-xs font-bold">🍹 Bar</span>
                  )}
                </td>
                <td className="py-2 font-bold text-orange-600 dark:text-orange-400 text-sm">
                  {item.variants && item.variants.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.variants.map((v, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-xs font-black uppercase tracking-wider">
                          {v.name}: ₹{v.price}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="font-extrabold text-sm text-orange-600 dark:text-orange-400">₹{item.price}</span>
                  )}
                </td>
                <td className="py-2 text-right pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleItemActive(item);
                      }} 
                      className={`p-1.5 rounded-lg transition-colors ${
                        item.isActive !== false 
                          ? 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40' 
                          : 'text-gray-400 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800/60 dark:hover:bg-slate-700'
                      }`} 
                      title={item.isActive !== false ? "Active — Click to Deactivate" : "Inactive — Click to Activate"}
                    >
                      {item.isActive !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button onClick={() => onEditItem(item)} className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDeleteItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="text-center text-gray-400 dark:text-slate-500 font-medium mt-10">
            {selectedCategory ? `No items found in "${selectedCategory}".` : 'No items in menu.'}
          </div>
        )}
      </div>
    </div>
  );
}
