import { useState, useEffect } from 'react';
import { useLiveQuery, db, DBCategory, DBMenuItem } from '../db';
import { Plus, Trash2, Tag, UtensilsCrossed, Pencil, X, Check, Save, FileSpreadsheet, Download, Eye, EyeOff } from 'lucide-react';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';

interface VariantInput {
  name: string;
  price: string;
  stockItemId?: string;
  stockQtyPerUnit?: string;
  isActive?: boolean;
}

export default function Menu() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], 'categories');
  const menuItems = useLiveQuery(() => db.menuItems.toArray(), [], 'menu_items');
  const stockItems = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items');

  // --- Category Filter ---
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { showToast } = useToast();
  const [deletingCat, setDeletingCat] = useState<{ id: string, name: string } | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // --- Add Category State ---
  const [newCatName, setNewCatName] = useState('');

  // --- Edit Category State ---
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  // --- Add Item State ---
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

  // --- Edit Item Modal State ---
  const [editingItem, setEditingItem] = useState<DBMenuItem | null>(null);
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

  // --- Excel/CSV Import Modal ---
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);

  // --- Add Item Modal state ---
  const [showAddItem, setShowAddItem] = useState(false);

  // --- Quick Add Stock Item State ---
  const [showQuickAddStock, setShowQuickAddStock] = useState(false);
  const [quickStockName, setQuickStockName] = useState('');
  const [quickStockUnit, setQuickStockUnit] = useState('pcs');
  const [quickStockMinThreshold, setQuickStockMinThreshold] = useState('5');
  const [quickStockTarget, setQuickStockTarget] = useState<string | null>(null);

  // Automatically pre-select category when user clicks category tab
  useEffect(() => {
    if (selectedCategory) {
      setNewItemCategory(selectedCategory);
    } else {
      setNewItemCategory('');
    }
  }, [selectedCategory]);

  // =============== CATEGORY HANDLERS ===============

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await db.categories.add({
      id: Date.now().toString(),
      name: newCatName.trim()
    });
    setNewCatName('');
  };

  const handleDeleteCategory = (id: string, catName: string) => {
    setDeletingCat({ id, name: catName });
  };

  const executeDeleteCategory = async (id: string, catName: string) => {
    try {
      // 1. Delete category from db
      await db.categories.delete(id);

      // 2. Fetch and delete all menu items that belong to this category
      const allItems = await db.menuItems.toArray();
      const itemsInCat = allItems.filter((item: DBMenuItem) => item.category === catName);
      for (const item of itemsInCat) {
        await db.menuItems.delete(item.id);
      }

      if (selectedCategory === catName) {
        setSelectedCategory(null);
      }
      showToast(`Category "${catName}" and all its items have been successfully deleted!`);
    } catch (err: any) {
      console.error("Failed to delete category:", err);
      showToast(`Delete failed: ${err.message || err}`, 'error');
    }
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
      const itemsInCat = allItems.filter((item: DBMenuItem) => item.category === oldName);
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

  // =============== ITEM HANDLERS ===============

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemCategory) return;
    if (!hasVariants && !newItemPrice) return;
    
    const validVariants = variants.filter((v: VariantInput) => v.name.trim() && v.price);

    await db.menuItems.add({
      id: Date.now().toString(),
      name: newItemName.trim(),
      price: hasVariants ? (Number(validVariants[0]?.price) || 0) : Number(newItemPrice),
      category: newItemCategory,
      isActive: newItemActive,
      variants: hasVariants ? validVariants.map((v: VariantInput) => ({
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
    
    setNewItemName('');
    setNewItemPrice('');
    setNewItemCategory(selectedCategory || '');
    setHasVariants(false);
    setNewItemStockId('');
    setNewItemStockQty('');
    setNewItemActive(true);
    setNewItemPrinterTarget('kitchen');
    setVariants([
      { name: 'Half', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true },
      { name: 'Full', price: '', stockItemId: '', stockQtyPerUnit: '', isActive: true }
    ]);
    setShowAddItem(false);
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const executeDeleteItem = async (id: string) => {
    try {
      await db.menuItems.delete(id);
      showToast("Menu item deleted successfully!");
    } catch (err: any) {
      console.error("Failed to delete menu item:", err);
      showToast(`Delete failed: ${err.message || err}`, 'error');
    }
  };

  const startEditItem = (item: DBMenuItem) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemCategory(item.category);
    setEditItemPrice(String(item.price));
    setEditItemActive(item.isActive !== false);
    if (item.variants && item.variants.length > 0) {
      setEditHasVariants(true);
      setEditVariants(item.variants.map((v: { name: string; price: number; stockItemId?: string; stockQtyPerUnit?: number; isActive?: boolean }) => ({
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
    setEditItemStockId(item.stockItemId || '');
    setEditItemStockQty(item.stockQtyPerUnit ? String(item.stockQtyPerUnit) : '');
    setEditItemPrinterTarget(item.printerTarget || 'kitchen');
  };

  const handleSaveItem = async () => {
    if (!editingItem || !editItemName.trim() || !editItemCategory) return;
    
    const validVariants = editVariants.filter((v: VariantInput) => v.name.trim() && v.price);

    await db.menuItems.update(editingItem.id, {
      name: editItemName.trim(),
      category: editItemCategory,
      price: editHasVariants ? (Number(validVariants[0]?.price) || 0) : Number(editItemPrice),
      isActive: editItemActive,
      variants: editHasVariants ? validVariants.map((v: VariantInput) => ({
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

    setEditingItem(null);
  };

  const cancelEditItem = () => {
    setEditingItem(null);
  };

  const handleQuickAddStock = async () => {
    if (!quickStockName.trim()) return;
    const newId = `s-${Date.now()}`;
    try {
      await db.stockItems.add({
        id: newId,
        name: quickStockName.trim(),
        quantity: 0,
        unit: quickStockUnit,
        minThreshold: parseFloat(quickStockMinThreshold) || 5,
        lastUpdated: Date.now()
      });

      // Automatically link the newly added stock item
      if (quickStockTarget === 'parent-add') {
        setNewItemStockId(newId);
      } else if (quickStockTarget === 'parent-edit') {
        setEditItemStockId(newId);
      } else if (quickStockTarget?.startsWith('variant-add-')) {
        const idx = parseInt(quickStockTarget.replace('variant-add-', ''));
        const newV = [...variants];
        newV[idx] = { ...newV[idx], stockItemId: newId };
        setVariants(newV);
      } else if (quickStockTarget?.startsWith('variant-edit-')) {
        const idx = parseInt(quickStockTarget.replace('variant-edit-', ''));
        const newV = [...editVariants];
        newV[idx] = { ...newV[idx], stockItemId: newId };
        setEditVariants(newV);
      }

      setQuickStockName('');
      setQuickStockUnit('pcs');
      setQuickStockMinThreshold('5');
      setQuickStockTarget(null);
      setShowQuickAddStock(false);
      showToast(`Stock Item "${quickStockName.trim()}" added successfully!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to add stock item: ${err.message || err}`, 'error');
    }
  };

  const handleExportMenu = async () => {
    let data = [];

    if (!menuItems || menuItems.length === 0) {
      // Download the built-in sample menu template!
      data = [
        { "Category": "Soup", "Item Name": "Tomato Soup", "Full Price": 120, "Half Price": 70 },
        { "Category": "Soup", "Item Name": "Hot & Sour Soup", "Full Price": 130, "Half Price": "-" },
        { "Category": "Starter", "Item Name": "Paneer Tikka", "Full Price": 240, "Half Price": 140 },
        { "Category": "Starter", "Item Name": "Veg Spring Roll", "Full Price": 180, "Half Price": "-" },
        { "Category": "Mains", "Item Name": "Kadhai Paneer", "Full Price": 285, "Half Price": "-" },
        { "Category": "Mains", "Item Name": "Dal Makhani", "Full Price": 220, "Half Price": 130 },
        { "Category": "Chinese", "Item Name": "Veg Chowmein", "Full Price": 160, "Half Price": 90 }
      ];
    } else {
      // Export current menu items
      for (const item of menuItems) {
        const category = item.category || 'General';
        let fullPrice = item.price || 0;
        let halfPrice: string | number = '-';

        if (item.variants && item.variants.length > 0) {
          const halfVariant = item.variants.find((v: { name: string; price: number }) => v.name.toLowerCase() === 'half');
          const fullVariant = item.variants.find((v: { name: string; price: number }) => v.name.toLowerCase() === 'full');
          if (halfVariant) {
            halfPrice = halfVariant.price;
          }
          if (fullVariant) {
            fullPrice = fullVariant.price;
          } else if (item.variants.length > 0 && !fullVariant) {
            fullPrice = item.variants[item.variants.length - 1].price;
            if (item.variants.length > 1) {
              halfPrice = item.variants[0].price;
            }
          }
        }

        data.push({
          "Category": category,
          "Item Name": item.name,
          "Full Price": fullPrice,
          "Half Price": halfPrice
        });
      }
    }

    // Dynamic import of XLSX to optimize bundle size
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Menu");

    // Generate buffer and trigger native XLSX download
    const fileName = !menuItems || menuItems.length === 0 
      ? "Sample_Menu_Template.xlsx" 
      : `Menu_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    showToast(`Excel File "${fileName}" successfully downloaded! Check your Downloads folder.`, 'success');
  };

  // =============== EXCEL CSV IMPORT ===============

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    
    const categoryIdx = headers.findIndex(h => h === 'category');
    const nameIdx = headers.findIndex(h => h === 'item name' || h === 'name');
    const priceIdx = headers.findIndex(h => h === 'full price' || h === 'price');
    const halfPriceIdx = headers.findIndex(h => h === 'half price');

    if (categoryIdx === -1 || nameIdx === -1 || priceIdx === -1) {
      throw new Error('CSV file must have "Category", "Item Name" (or "Name"), and "Full Price" (or "Price") columns!');
    }

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Handle commas inside quotes correctly (regex for CSV splitting)
      const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^["']|["']$/g, ''));
      
      const category = values[categoryIdx] || '';
      const name = values[nameIdx] || '';
      const priceText = values[priceIdx] || '0';
      const halfPriceText = halfPriceIdx !== -1 ? (values[halfPriceIdx] || '-') : '-';

      if (!name || !category) continue;

      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
      const halfPrice = parseFloat(halfPriceText.replace(/[^0-9.]/g, '')) || 0;

      items.push({
        category,
        name,
        price,
        halfPrice,
        hasHalf: halfPriceText !== '-' && halfPrice > 0
      });
    }
    return items;
  };

  const parseExcelJson = (jsonData: any[]) => {
    if (jsonData.length === 0) return [];

    // Find key names dynamically (case-insensitive headers)
    const firstRow = jsonData[0];
    const keys = Object.keys(firstRow);

    const categoryKey = keys.find(k => k.toLowerCase() === 'category');
    const nameKey = keys.find(k => k.toLowerCase() === 'item name' || k.toLowerCase() === 'name');
    const priceKey = keys.find(k => k.toLowerCase() === 'full price' || k.toLowerCase() === 'price');
    const halfPriceKey = keys.find(k => k.toLowerCase() === 'half price');

    if (!categoryKey || !nameKey || !priceKey) {
      throw new Error('Excel sheet must have "Category", "Item Name" (or "Name"), and "Full Price" (or "Price") columns!');
    }

    const items = [];
    for (const row of jsonData) {
      const category = String(row[categoryKey] || '').trim();
      const name = String(row[nameKey] || '').trim();
      const priceText = String(row[priceKey] || '0').trim();
      const halfPriceText = halfPriceKey ? String(row[halfPriceKey] || '-').trim() : '-';

      if (!name || !category) continue;

      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
      const halfPrice = parseFloat(halfPriceText.replace(/[^0-9.]/g, '')) || 0;

      items.push({
        category,
        name,
        price,
        halfPrice,
        hasHalf: halfPriceText !== '-' && halfPrice > 0
      });
    }
    return items;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = async (event) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

          const parsed = parseExcelJson(jsonData);
          setCsvPreview(parsed);
        } catch (err: any) {
          showToast('Excel parse error: ' + (err.message || err), 'error');
          setCsvPreview([]);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Legacy CSV parsing support
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const parsed = parseCSV(text);
          setCsvPreview(parsed);
        } catch (err: any) {
          showToast(err.message || err, 'error');
          setCsvPreview([]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleImportCsv = async () => {
    if (csvPreview.length === 0) return;
    try {
      const existingCats = await db.categories.toArray();
      const newCategoriesToAdd: DBCategory[] = [];
      const newItemsToAdd: DBMenuItem[] = [];
      
      // We keep track of category names we are adding to avoid duplicate additions in the same CSV batch
      const addedCatNames = new Set(existingCats.map((c: DBCategory) => c.name.toLowerCase()));

      for (const item of csvPreview) {
        const catNameTrimmed = item.category.trim();
        const catNameLower = catNameTrimmed.toLowerCase();
        
        if (!addedCatNames.has(catNameLower)) {
          const newCatId = `c-${Math.random().toString(36).substring(2, 8)}`;
          newCategoriesToAdd.push({
            id: newCatId,
            name: catNameTrimmed
          });
          addedCatNames.add(catNameLower);
        }

        const itemVariants = item.hasHalf
          ? [{ name: 'Half', price: item.halfPrice }, { name: 'Full', price: item.price }]
          : [];

        newItemsToAdd.push({
          id: `i-${Math.random().toString(36).substring(2, 8)}`,
          name: item.name.trim(),
          price: item.price,
          category: catNameTrimmed,
          isActive: true,
          variants: itemVariants
        });
      }

      // 1. Bulk insert new categories first
      if (newCategoriesToAdd.length > 0) {
        await db.categories.bulkPut(newCategoriesToAdd);
      }

      // 2. Bulk insert new menu items
      if (newItemsToAdd.length > 0) {
        await db.menuItems.bulkPut(newItemsToAdd);
      }

      setCsvPreview([]);
      setShowCsvImport(false);
      setSelectedCategory(null);
      showToast(`${newItemsToAdd.length} items successfully imported!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('CSV Import Error: ' + (err.message || err), 'error');
    }
  };

  if (!categories || !menuItems) return <div className="p-8 text-gray-500 dark:text-slate-400 font-bold">Loading Settings...</div>;

  // Filter items by selected category
  const filteredItems = (selectedCategory
    ? menuItems.filter((item: DBMenuItem) => item.category === selectedCategory)
    : menuItems).sort((a: DBMenuItem, b: DBMenuItem) => a.name.localeCompare(b.name));

  const sortedCategories = categories.slice().sort((a: DBCategory, b: DBCategory) => a.name.localeCompare(b.name));

  // Count items per category
  const getCatCount = (catName: string) => menuItems.filter((item: DBMenuItem) => item.category === catName).length;

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full overflow-hidden">

      {/* ========== CATEGORIES SECTION (LEFT) ========== */}
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
          {/* All Button */}
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
            }`}>{menuItems.length}</span>
          </button>

          {sortedCategories.map((cat) => (
            <div key={cat.id} className="relative group w-full flex">
              {editingCatId === cat.id ? (
                /* ---- Inline Edit Mode ---- */
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
                  <button onClick={handleSaveCategory} className="p-1 text-green-600 dark:text-green-450 hover:bg-green-50 dark:hover:bg-green-950/20 rounded-lg shrink-0" title="Save">
                    <Check size={16} />
                  </button>
                  <button onClick={cancelEditCategory} className="p-1 text-gray-400 hover:bg-gray-200 rounded-lg shrink-0" title="Cancel">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                /* ---- Category Pill ---- */
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

              {/* Edit/Delete icons on hover */}
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
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id, cat.name); }}
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

      {/* ========== MENU ITEMS SECTION (RIGHT) ========== */}
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
              onClick={() => setShowCsvImport(true)}
              className="px-4 py-2 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 border border-transparent dark:border-emerald-800/30 shadow-sm"
            >
              <FileSpreadsheet size={16} /> Import from Excel / CSV
            </button>
            <button 
              onClick={() => setShowAddItem(true)}
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
                        onClick={async (e) => {
                          e.stopPropagation();
                          await db.menuItems.update(item.id, { isActive: item.isActive !== false ? false : true });
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
                      <button onClick={() => startEditItem(item)} className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors" title="Delete">
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

      {/* ========== EDIT ITEM MODAL ========== */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={cancelEditItem}>
          <div 
            className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden border border-transparent dark:border-slate-800/80 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Pencil size={22} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Item Edit करें</h3>
              </div>
              <button onClick={cancelEditItem} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
                <X size={22} className="text-white" />
              </button>
            </div>

            {/* Modal Body */}
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
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-400 font-bold text-gray-800 dark:text-slate-100 text-lg dark:bg-slate-800"
                />
              </div>

              <div>
                <label htmlFor="editItemCategorySelect" className="block text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Category</label>
                <select
                  id="editItemCategorySelect"
                  value={editItemCategory}
                  onChange={(e) => setEditItemCategory(e.target.value)}
                  title="Select Category"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-400 font-bold text-gray-800 dark:text-slate-100 bg-white dark:bg-slate-800"
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
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-slate-700 focus:outline-none focus:border-orange-400 font-bold text-gray-800 dark:text-slate-100 text-lg dark:bg-slate-800"
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
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-400 dark:bg-slate-900 dark:text-slate-100" 
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
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-400 dark:bg-slate-900 dark:text-slate-100" 
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
                                : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
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
                                  setQuickStockTarget(`variant-edit-${idx}`);
                                  const parentName = editItemName.trim();
                                  const varName = editVariants[idx]?.name.trim();
                                  const displayName = parentName && varName ? `${parentName} (${varName})` : varName || parentName;
                                  setQuickStockName(displayName);
                                  setShowQuickAddStock(true);
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
                      className="mt-1 self-start px-3 py-1.5 bg-orange-50 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-orange-600 dark:text-orange-400 text-xs font-black rounded-lg transition-colors border border-orange-100 dark:border-slate-700 flex items-center gap-1.5"
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
                          setQuickStockTarget('parent-edit');
                          setQuickStockName(editItemName.trim());
                          setShowQuickAddStock(true);
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
                    <input id="editItemStockQtyInput" type="number" step="0.01" value={editItemStockQty} onChange={(e) => setEditItemStockQty(e.target.value)} placeholder="Deduct" title="Quantity" className="w-full px-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold dark:bg-slate-800 dark:text-slate-100" />
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

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-slate-800/80 flex justify-end gap-3 bg-gray-50 dark:bg-slate-900/30">
              <button
                onClick={cancelEditItem}
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
      )}

      {/* ========== EXCEL CSV IMPORT MODAL ========== */}
      {showCsvImport && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => { setShowCsvImport(false); setCsvPreview([]); }}>
          <div 
            className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-[680px] mx-4 max-h-[85vh] overflow-hidden flex flex-col border border-transparent dark:border-slate-800/80 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <FileSpreadsheet size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Excel / CSV Menu Import</h3>
                  <p className="text-emerald-100 text-xs">Select an Excel (.xlsx, .xls) or CSV (.csv) file</p>
                </div>
              </div>
              <button onClick={() => { setShowCsvImport(false); setCsvPreview([]); }} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
                <X size={22} className="text-white" />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5">
              {/* Instructions & Template Guide */}
              <div className="bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-2xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-400 text-sm">Excel Sheet Format Guide:</h4>
                  <button 
                    onClick={handleExportMenu}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
                  >
                    <Download size={14} /> Download Sample Template
                  </button>
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed mb-3">
                  Create the following columns in your Excel sheet and upload it directly in <strong>Excel (.xlsx)</strong> format:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse bg-white dark:bg-slate-900/30 rounded-xl overflow-hidden shadow-sm">
                    <thead>
                      <tr className="bg-emerald-600 text-white font-bold">
                        <th className="p-2 border-r border-emerald-500">Category</th>
                        <th className="p-2 border-r border-emerald-500">Item Name</th>
                        <th className="p-2 border-r border-emerald-500">Full Price</th>
                        <th className="p-2">Half Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100 dark:border-slate-800/80 text-gray-700 dark:text-slate-300 font-medium">
                        <td className="p-2 border-r border-gray-100 dark:border-slate-800/80">Soup</td>
                        <td className="p-2 border-r border-gray-100 dark:border-slate-800/80">Tomato Soup</td>
                        <td className="p-2 border-r border-gray-100 dark:border-slate-800/80">120</td>
                        <td className="p-2 text-gray-400 dark:text-slate-500">70</td>
                      </tr>
                      <tr className="text-gray-700 dark:text-slate-300 font-medium">
                        <td className="p-2 border-r border-gray-100 dark:border-slate-800/80">Starter</td>
                        <td className="p-2 border-r border-gray-100 dark:border-slate-800/80">Paneer Tikka</td>
                        <td className="p-2 border-r border-gray-100 dark:border-slate-800/80">250</td>
                        <td className="p-2 text-gray-400 dark:text-slate-500">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors p-8 rounded-2xl text-center relative bg-gray-50 dark:bg-slate-900/40 flex flex-col items-center justify-center cursor-pointer">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  title="Select Excel / CSV File"
                  aria-label="Select Excel / CSV File"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <FileSpreadsheet size={40} className="text-emerald-500 mb-2" />
                <span className="font-bold text-gray-700 dark:text-slate-300 text-sm">Select Excel / CSV File</span>
                <span className="text-xs text-gray-400 dark:text-slate-500 mt-1">Accepts native Excel (.xlsx, .xls) and CSV (.csv) sheets</span>
              </div>

              {/* Preview Table */}
              {csvPreview.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-gray-700 dark:text-slate-300 text-sm">Import Preview ({csvPreview.length} Items Found):</span>
                    <button onClick={() => setCsvPreview([])} className="text-xs text-red-500 font-bold hover:underline">Clear</button>
                  </div>
                  <div className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 font-bold border-b border-gray-200 dark:border-slate-800">
                          <th className="p-2">Name</th>
                          <th className="p-2">Category</th>
                          <th className="p-2">Price</th>
                          <th className="p-2">Variants (Half/Full)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-slate-800/60 hover:bg-gray-50 dark:hover:bg-slate-800/40 font-semibold text-gray-700 dark:text-slate-300">
                            <td className="p-2 max-w-[150px]"><div className="truncate" title={item.name}>{item.name}</div></td>
                            <td className="p-2 max-w-[120px]"><span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-xs truncate inline-block max-w-full" title={item.category}>{item.category}</span></td>
                            <td className="p-2 text-emerald-600 dark:text-emerald-400">₹{item.price}</td>
                            <td className="p-2 text-gray-500 dark:text-slate-400">
                              {item.hasHalf ? `Half: ₹${item.halfPrice} | Full: ₹${item.price}` : 'Regular Price'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-5 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3 bg-gray-50 dark:bg-slate-900/30">
              <button onClick={() => { setShowCsvImport(false); setCsvPreview([]); }} className="px-6 py-3 rounded-xl font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button
                onClick={handleImportCsv}
                disabled={csvPreview.length === 0}
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 dark:shadow-none transition-all flex items-center gap-2"
              >
                <Plus size={18} /> Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ADD ITEM MODAL ========== */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowAddItem(false)}>
          <div 
            className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden border border-transparent dark:border-slate-800/80 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Plus size={22} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Menu Item Add करें</h3>
              </div>
              <button onClick={() => setShowAddItem(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
                <X size={22} className="text-white" />
              </button>
            </div>

            {/* Modal Body */}
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
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800" 
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
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-orange-500 font-bold text-gray-800 dark:text-slate-100 dark:bg-slate-800" 
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
                                  setQuickStockTarget(`variant-add-${idx}`);
                                  const parentName = newItemName.trim();
                                  const varName = variants[idx]?.name.trim();
                                  const displayName = parentName && varName ? `${parentName} (${varName})` : varName || parentName;
                                  setQuickStockName(displayName);
                                  setShowQuickAddStock(true);
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
                      className="mt-1 self-start px-3 py-1.5 bg-orange-50 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-orange-600 dark:text-orange-400 text-xs font-black rounded-lg transition-colors border border-orange-100 dark:border-slate-700 flex items-center gap-1.5"
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
                          setQuickStockTarget('parent-add');
                          setQuickStockName(newItemName.trim());
                          setShowQuickAddStock(true);
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

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-slate-800/80 flex justify-end gap-3 bg-gray-50 dark:bg-slate-900/30">
              <button
                onClick={() => setShowAddItem(false)}
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
      )}

      {/* ========== QUICK ADD STOCK ITEM SUB-MODAL ========== */}
      {showQuickAddStock && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in" onClick={() => { setShowQuickAddStock(false); setQuickStockTarget(null); }}>
          <div 
            className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl w-full max-w-[400px] mx-4 overflow-hidden border border-transparent dark:border-slate-800 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">नया स्टॉक Item जोड़ें</h3>
              <button onClick={() => { setShowQuickAddStock(false); setQuickStockTarget(null); }} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4">
              <div>
                <label htmlFor="quickStockNameInput" className="block text-xs font-bold text-gray-400 dark:text-slate-500 mb-1">Stock Item Name</label>
                <input
                  type="text"
                  id="quickStockNameInput"
                  placeholder="e.g. Tomato, Coke Bottle"
                  value={quickStockName}
                  onChange={(e) => setQuickStockName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddStock()}
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

            {/* Modal Footer */}
            <div className="p-5 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2 bg-gray-50 dark:bg-slate-900/30">
              <button
                onClick={() => { setShowQuickAddStock(false); setQuickStockTarget(null); }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickAddStock}
                disabled={!quickStockName.trim()}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-100 dark:shadow-none transition-all"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Delete Confirmation Modal */}
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

      {/* Menu Item Delete Confirmation Modal */}
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

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
