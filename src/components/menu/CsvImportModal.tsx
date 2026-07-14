import React, { useState } from 'react';
import { FileSpreadsheet, X, Download, Plus } from 'lucide-react';
import { db, DBCategory, DBMenuItem } from '../../db';
import { useToast } from '../Toast';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: DBMenuItem[];
  onImportSuccess: (count: number) => void;
}

export default function CsvImportModal({
  isOpen,
  onClose,
  menuItems,
  onImportSuccess
}: CsvImportModalProps) {
  const { showToast } = useToast();
  const [csvPreview, setCsvPreview] = useState<any[]>([]);

  if (!isOpen) return null;

  const handleExportMenu = async () => {
    let data = [];

    if (!menuItems || menuItems.length === 0) {
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
      for (const item of menuItems) {
        const category = item.category || 'General';
        let fullPrice = item.price || 0;
        let halfPrice: string | number = '-';

        if (item.variants && item.variants.length > 0) {
          const halfVariant = item.variants.find((v) => v.name.toLowerCase() === 'half');
          const fullVariant = item.variants.find((v) => v.name.toLowerCase() === 'full');
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

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Menu");

    const fileName = !menuItems || menuItems.length === 0 
      ? "Sample_Menu_Template.xlsx" 
      : `Menu_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    showToast(`Excel File "${fileName}" successfully downloaded!`, 'success');
  };

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
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
      
      const addedCatNames = new Set(existingCats.map((c) => c.name.toLowerCase()));

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

      if (newCategoriesToAdd.length > 0) {
        await db.categories.bulkPut(newCategoriesToAdd);
      }

      if (newItemsToAdd.length > 0) {
        await db.menuItems.bulkPut(newItemsToAdd);
      }

      const importedCount = newItemsToAdd.length;
      setCsvPreview([]);
      onImportSuccess(importedCount);
    } catch (err: any) {
      console.error(err);
      showToast('CSV Import Error: ' + (err.message || err), 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
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
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors" title="Close" aria-label="Close">
            <X size={22} className="text-white" />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5">
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
                      <tr key={idx} className="border-b border-gray-100 dark:border-slate-800/60 hover:bg-gray-55 dark:hover:bg-slate-800/40 font-semibold text-gray-700 dark:text-slate-300">
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
          <button onClick={() => { setCsvPreview([]); onClose(); }} className="px-6 py-3 rounded-xl font-bold text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors">Cancel</button>
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
  );
}
