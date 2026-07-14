import { useState } from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { DBCategory, db } from '../../db';

interface CategoryListProps {
  categories: DBCategory[];
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  getCatCount: (catName: string) => number;
  menuItemsLength: number;
  onDeleteCategory: (id: string, name: string) => void;
}

export default function CategoryList({
  categories,
  selectedCategory,
  setSelectedCategory,
  getCatCount,
  menuItemsLength,
  onDeleteCategory
}: CategoryListProps) {
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await db.categories.add({
      id: Date.now().toString(),
      name: newCatName.trim()
    });
    setNewCatName('');
  };

  const startEditCategory = (cat: DBCategory) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
  };

  const handleSaveCategory = async () => {
    if (!editingCatId || !editCatName.trim()) return;
    const oldCat = await db.categories.get(editingCatId);
    const oldName = oldCat?.name;

    await db.categories.update(editingCatId, { name: editCatName.trim() });

    if (oldName && oldName !== editCatName.trim()) {
      const allItems = await db.menuItems.toArray();
      const itemsInCat = allItems.filter((item) => item.category === oldName);
      for (const item of itemsInCat) {
        await db.menuItems.update(item.id, { category: editCatName.trim() });
      }
      if (selectedCategory === oldName) {
        setSelectedCategory(editCatName.trim());
      }
    }

    setEditingCatId(null);
    setEditCatName('');
  };

  const cancelEditCategory = () => {
    setEditingCatId(null);
    setEditCatName('');
  };

  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full md:w-80 bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden shrink-0 transition-colors duration-300">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800/80 bg-orange-50 dark:bg-slate-900/30 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2 rounded-xl text-white shadow-md">
            <Tag size={20} />
          </div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">Categories</h2>
          <span className="bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full text-xs font-bold ml-auto">{categories.length}</span>
        </div>
        <div className="flex gap-2 items-center w-full">
          <input 
            type="text" 
            placeholder="New Category" 
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            id="newCategoryInput"
            title="New Category Name"
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-500 font-medium text-sm flex-1 min-w-0 dark:bg-slate-800 dark:text-slate-100"
          />
          <button 
            onClick={handleAddCategory}
            className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-md transition-colors shrink-0"
            title="Add Category"
            aria-label="Add Category"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 overflow-y-auto">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`w-full px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-between gap-2 min-w-0 ${
            selectedCategory === null
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 dark:shadow-none'
              : 'bg-gray-100 dark:bg-slate-800/40 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800/80'
          }`}
        >
          <span className="truncate text-left flex-1">All</span>
          <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${
            selectedCategory === null ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-900 text-gray-500 dark:text-slate-400'
          }`}>{menuItemsLength}</span>
        </button>

        {sortedCategories.map((cat) => (
          <div key={cat.id} className="relative group w-full flex">
            {editingCatId === cat.id ? (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border-2 border-orange-400 rounded-xl px-2 py-1 w-full">
                <input
                  type="text"
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCategory();
                    if (e.key === 'Escape') cancelEditCategory();
                  }}
                  autoFocus
                  placeholder="Category Name"
                  title="Edit Category Name"
                  className="px-2 py-1 rounded-lg font-bold text-sm text-gray-700 dark:text-slate-100 focus:outline-none flex-1 min-w-0 bg-transparent"
                />
                <button onClick={handleSaveCategory} className="p-1 text-green-600 dark:text-green-455 hover:bg-green-50 dark:hover:bg-green-950/20 rounded-lg shrink-0" title="Save">
                  <Check size={16} />
                </button>
                <button onClick={cancelEditCategory} className="p-1 text-gray-400 hover:bg-gray-200 rounded-lg shrink-0" title="Cancel">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                className={`w-full px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-between gap-2 min-w-0 ${
                  selectedCategory === cat.name
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 dark:shadow-none'
                    : 'bg-gray-100 dark:bg-slate-800/40 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800/80'
                }`}
                title={cat.name}
              >
                <span className="truncate text-left flex-1">{cat.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${
                  selectedCategory === cat.name ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-900 text-gray-500 dark:text-slate-400'
                }`}>{getCatCount(cat.name)}</span>
              </button>
            )}

            {editingCatId !== cat.id && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm p-1 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm">
                <button 
                  onClick={(e) => { e.stopPropagation(); startEditCategory(cat); }}
                  className="p-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-sm"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteCategory(cat.id, cat.name); }}
                  className="p-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 shadow-sm"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
