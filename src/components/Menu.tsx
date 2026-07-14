import { useState, useEffect } from 'react';
import { useLiveQuery, db, DBMenuItem } from '../db';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';

import CategoryList from './menu/CategoryList';
import MenuItemGrid from './menu/MenuItemGrid';
import AddItemModal from './menu/AddItemModal';
import EditItemModal from './menu/EditItemModal';
import CsvImportModal from './menu/CsvImportModal';
import QuickStockModal from './menu/QuickStockModal';

export default function Menu() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], 'categories');
  const menuItems = useLiveQuery(() => db.menuItems.toArray(), [], 'menu_items');
  const stockItems = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items');

  const { showToast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [deletingCat, setDeletingCat] = useState<{ id: string, name: string } | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<DBMenuItem | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Quick Stock state
  const [showQuickAddStock, setShowQuickAddStock] = useState(false);
  const [quickStockName, setQuickStockName] = useState('');
  const [quickStockTarget, setQuickStockTarget] = useState<string | null>(null);
  const [quickStockLinkedId, setQuickStockLinkedId] = useState<string | null>(null);
  const [quickStockLinkedTarget, setQuickStockLinkedTarget] = useState<string | null>(null);

  // Clear linked triggers
  useEffect(() => {
    if (!showQuickAddStock) {
      setQuickStockLinkedId(null);
      setQuickStockLinkedTarget(null);
    }
  }, [showQuickAddStock]);

  if (!categories || !menuItems) return <div className="p-8 text-gray-500 dark:text-slate-400 font-bold">Loading Settings...</div>;

  const getCatCount = (catName: string) => {
    return menuItems.filter((item: DBMenuItem) => item.category === catName).length;
  };

  const handleDeleteCategory = (id: string, name: string) => {
    setDeletingCat({ id, name });
  };

  const executeDeleteCategory = async (id: string, catName: string) => {
    try {
      await db.categories.delete(id);
      const allItems = await db.menuItems.toArray();
      const itemsInCat = allItems.filter((item) => item.category === catName);
      for (const item of itemsInCat) {
        await db.menuItems.delete(item.id);
      }
      if (selectedCategory === catName) {
        setSelectedCategory(null);
      }
      showToast(`Category "${catName}" and all its items have been successfully deleted!`);
    } catch (err: any) {
      console.error(err);
      showToast(`Delete failed: ${err.message || err}`, 'error');
    }
  };

  const executeDeleteItem = async (id: string) => {
    try {
      await db.menuItems.delete(id);
      showToast("Menu item deleted successfully!");
    } catch (err: any) {
      console.error(err);
      showToast(`Delete failed: ${err.message || err}`, 'error');
    }
  };

  const handleQuickAddStockClick = (displayName: string, targetKey: string) => {
    setQuickStockName(displayName);
    setQuickStockTarget(targetKey);
    setShowQuickAddStock(true);
  };

  const handleCreateQuickStock = async (name: string, unit: string, minThreshold: string) => {
    const newId = `s-${Date.now()}`;
    try {
      await db.stockItems.add({
        id: newId,
        name: name.trim(),
        quantity: 0,
        unit: unit,
        minThreshold: parseFloat(minThreshold) || 5,
        lastUpdated: Date.now()
      });

      // Pass the link down
      setQuickStockLinkedId(newId);
      setQuickStockLinkedTarget(quickStockTarget);

      setQuickStockName('');
      setQuickStockTarget(null);
      setShowQuickAddStock(false);
      showToast(`Stock Item "${name.trim()}" added successfully!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to add stock item: ${err.message || err}`, 'error');
    }
  };

  const handleImportSuccess = (count: number) => {
    setSelectedCategory(null);
    setShowCsvImport(false);
    showToast(`${count} items successfully imported!`, 'success');
  };

  const filteredItems = (selectedCategory
    ? menuItems.filter((item) => item.category === selectedCategory)
    : menuItems).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full overflow-hidden">
      {/* Category Sidebar List */}
      <CategoryList
        categories={categories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        getCatCount={getCatCount}
        menuItemsLength={menuItems.length}
        onDeleteCategory={handleDeleteCategory}
      />

      {/* Menu Items Table Grid */}
      <MenuItemGrid
        filteredItems={filteredItems}
        selectedCategory={selectedCategory}
        onAddItemClick={() => setShowAddItem(true)}
        onCsvImportClick={() => setShowCsvImport(true)}
        onEditItem={(item) => setEditingItem(item)}
        onDeleteItem={(id) => setDeletingItemId(id)}
      />

      {/* Add Menu Item Modal */}
      <AddItemModal
        isOpen={showAddItem}
        onClose={() => setShowAddItem(false)}
        categories={categories}
        stockItems={stockItems || []}
        defaultCategory={selectedCategory}
        onQuickAddStockClick={handleQuickAddStockClick}
        quickStockLinkedId={quickStockLinkedId}
        quickStockLinkedTarget={quickStockLinkedTarget}
      />

      {/* Edit Menu Item Modal */}
      <EditItemModal
        editingItem={editingItem}
        onClose={() => setEditingItem(null)}
        categories={categories}
        stockItems={stockItems || []}
        onQuickAddStockClick={handleQuickAddStockClick}
        quickStockLinkedId={quickStockLinkedId}
        quickStockLinkedTarget={quickStockLinkedTarget}
      />

      {/* Excel / CSV import modal */}
      <CsvImportModal
        isOpen={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        menuItems={menuItems}
        onImportSuccess={handleImportSuccess}
      />

      {/* Quick Add Stock Ingredient Sub-Modal */}
      <QuickStockModal
        isOpen={showQuickAddStock}
        onClose={() => { setShowQuickAddStock(false); setQuickStockTarget(null); }}
        quickStockName={quickStockName}
        setQuickStockName={setQuickStockName}
        onCreateQuickStock={handleCreateQuickStock}
      />

      {/* Confirm Modals */}
      <ConfirmModal
        isOpen={deletingCat !== null}
        title="Delete Category"
        message={`⚠️ Are you sure you want to delete the "${deletingCat?.name}" category? This will permanently delete all menu items under this category! This action cannot be undone.`}
        onConfirm={async () => {
          if (deletingCat) {
            await executeDeleteCategory(deletingCat.id, deletingCat.name);
            setDeletingCat(null);
          }
        }}
        onCancel={() => setDeletingCat(null)}
      />

      <ConfirmModal
        isOpen={deletingItemId !== null}
        title="Delete Menu Item"
        message="⚠️ Are you sure you want to permanently delete this menu item? This action cannot be undone."
        onConfirm={async () => {
          if (deletingItemId) {
            await executeDeleteItem(deletingItemId);
            setDeletingItemId(null);
          }
        }}
        onCancel={() => setDeletingItemId(null)}
      />
    </div>
  );
}
