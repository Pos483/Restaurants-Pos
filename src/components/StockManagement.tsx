import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from '../db';
import { db, DBStockItem, DBStockTransaction } from '../db';
import { Plus, Trash2, Edit2, AlertTriangle, Package, CalendarDays, ShoppingCart, MinusCircle, X, Download, FileText } from 'lucide-react';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatDateToInput = (date: Date) => date.toLocaleDateString('en-CA');
const formatTimestampToTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString('en-IN');

export default function StockManagement() {
  const stockItems = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items');
  const stockTransactions = useLiveQuery(() => db.stockTransactions.toArray(), [], 'stock_transactions');

  const [activeTab, setActiveTab] = useState('items');
  const [activeModal, setActiveModal] = useState<'addItem' | 'dailyUse' | 'purchase' | null>(null);
  const { showToast } = useToast();
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Add/Edit Item form
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [minThreshold, setMinThreshold] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Purchase (Stock In)
  const [purchaseItemId, setPurchaseItemId] = useState<string | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState('');

  // Consumption (Stock Out)
  const [consumptionItemId, setConsumptionItemId] = useState<string | null>(null);
  const [consumptionQuantity, setConsumptionQuantity] = useState('');

  // Report
  const [reportDate, setReportDate] = useState(formatDateToInput(new Date()));

  useEffect(() => {
    if (!editingId) { setName(''); setQuantity(''); setUnit('kg'); setMinThreshold(''); }
  }, [editingId]);

  const closeModal = () => {
    setActiveModal(null);
    setEditingId(null);
    setName(''); setQuantity(''); setUnit('kg'); setMinThreshold('');
    setPurchaseItemId(null); setPurchaseQuantity('');
    setConsumptionItemId(null); setConsumptionQuantity('');
  };

  const handleAddItemOrUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    if (editingId) {
      await db.stockItems.update(editingId, { name, unit, minThreshold: parseFloat(minThreshold) || 0 });
      showToast('Stock item details updated successfully!');
    } else {
      const initialQuantity = parseFloat(quantity) || 0;
      const newItem: DBStockItem = {
        id: Date.now().toString(),
        name,
        quantity: initialQuantity,
        unit,
        minThreshold: parseFloat(minThreshold) || 0,
        lastUpdated: Date.now(),
      };
      await db.stockItems.add(newItem);
      if (initialQuantity > 0) {
        await db.stockTransactions.add({
          id: crypto.randomUUID(), stockItemId: newItem.id,
          type: 'in', quantity: initialQuantity, reason: 'Initial Stock', timestamp: Date.now(),
        });
      }
      showToast('New stock item added successfully!');
    }
    closeModal();
  };

  const handleEditItem = (item: DBStockItem) => {
    setEditingId(item.id);
    setName(item.name);
    setUnit(item.unit);
    setMinThreshold(item.minThreshold.toString());
    setActiveModal('addItem');
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const executeDeleteItem = async (id: string) => {
    try {
      // 1. Delete transactions first to satisfy foreign key constraint
      await db.stockTransactions.where('stock_item_id').equals(id).delete();
      // 2. Delete the stock item itself
      await db.stockItems.delete(id);
      showToast('Stock item and transactions deleted successfully!');
    } catch (err: any) {
      console.error("Failed to delete stock item:", err);
      showToast(`Delete failed: ${err.message || err}`, 'error');
    }
  };

  const handleStockTransaction = async (
    e: React.FormEvent, type: 'in' | 'out',
    itemId: string | null, quantityStr: string
  ) => {
    e.preventDefault();
    const qtyChange = parseFloat(quantityStr) || 0;
    if (qtyChange <= 0) return;
    if (!itemId) return;

    try {
      // H-12 Fix: Read fresh stock data to avoid stale state
      const item = await db.stockItems.get(itemId);
      if (!item) throw new Error('Stock item not found');

      let newQuantity = item.quantity;
      if (type === 'in') { newQuantity += qtyChange; }
      else {
        newQuantity -= qtyChange;
        if (newQuantity < 0) throw new Error('BELOW_ZERO');
      }
      await db.stockItems.update(itemId, { quantity: newQuantity, lastUpdated: Date.now() });
      await db.stockTransactions.add({
        id: crypto.randomUUID(), stockItemId: itemId, type,
        quantity: qtyChange, reason: type === 'in' ? 'Purchase' : 'Daily Use', timestamp: Date.now(),
      });
      showToast(`Stock ${type === 'in' ? 'added' : 'used'} successfully!`);
      closeModal();
    } catch (err: any) {
      if (err.message === 'BELOW_ZERO') {
        showToast('Error: Stock quantity cannot go below zero!', 'error');
      } else {
        console.error('Stock transaction failed:', err);
        showToast(`Stock update failed: ${err.message || err}`, 'error');
      }
    }
  };

  const filteredTransactions = useMemo(() => {
    if (!stockTransactions) return [];
    const startOfDay = new Date(reportDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reportDate); endOfDay.setHours(23, 59, 59, 999);
    return stockTransactions
      .filter(t => t.timestamp >= startOfDay.getTime() && t.timestamp <= endOfDay.getTime())
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [stockTransactions, reportDate]);

  const groupedDailyReport = useMemo(() => {
    const grouped = filteredTransactions.reduce((acc, curr) => {
      if (!acc[curr.stockItemId]) {
        const item = stockItems?.find(i => i.id === curr.stockItemId);
        acc[curr.stockItemId] = { itemName: item?.name || 'Unknown', unit: item?.unit || '', totalIn: 0, totalOut: 0, transactions: [] };
      }
      if (curr.type === 'in') acc[curr.stockItemId].totalIn += curr.quantity;
      else acc[curr.stockItemId].totalOut += curr.quantity;
      acc[curr.stockItemId].transactions.push(curr);
      return acc;
    }, {} as Record<string, { itemName: string; unit: string; totalIn: number; totalOut: number; transactions: DBStockTransaction[] }>);
    return Object.values(grouped);
  }, [filteredTransactions, stockItems]);

  const handleExportStockInventory = async () => {
    if (!stockItems || stockItems.length === 0) {
      showToast('There are no stock items to export.', 'error');
      return;
    }

    try {
      const data = stockItems.slice().sort((a, b) => a.name.localeCompare(b.name)).map(item => {
        const isLowStock = item.quantity <= item.minThreshold;
        return {
          "Item Name": item.name,
          "In Stock": item.quantity,
          "Unit": item.unit,
          "Alert Threshold": item.minThreshold,
          "Status": isLowStock ? "Low Stock" : "In Stock",
          "Last Updated": new Date(item.lastUpdated).toLocaleString('en-IN')
        };
      });

      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Inventory");

      const fileName = `Stock_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showToast(`Stock inventory Excel file successfully downloaded!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Export failed: ' + (err.message || err), 'error');
    }
  };

  const handleExportDailyReport = async () => {
    if (filteredTransactions.length === 0) {
      showToast(`No transaction records found for ${reportDate}.`, 'error');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Daily Summary
      const summaryData = groupedDailyReport.map(group => ({
        "Item Name": group.itemName,
        "Total In": group.totalIn,
        "Total Out (Daily Use)": group.totalOut,
        "Unit": group.unit
      }));
      const summaryWS = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWS, "Daily Summary");

      // Sheet 2: Transaction Log
      const timelineData = filteredTransactions.map(tx => {
        const item = stockItems?.find(i => i.id === tx.stockItemId);
        return {
          "Time": formatTimestampToTime(tx.timestamp),
          "Item Name": item?.name || 'Unknown',
          "Type": tx.type === 'in' ? 'Stock In' : 'Stock Out',
          "Quantity": tx.quantity,
          "Unit": item?.unit || '',
          "Reason": tx.reason || ''
        };
      });
      const timelineWS = XLSX.utils.json_to_sheet(timelineData);
      XLSX.utils.book_append_sheet(workbook, timelineWS, "Transaction Log");

      const fileName = `Stock_Daily_Report_${reportDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showToast(`Stock Daily Report for ${reportDate} successfully downloaded!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Export failed: ' + (err.message || err), 'error');
    }
  };

  const handleExportStockInventoryPDF = () => {
    if (!stockItems || stockItems.length === 0) {
      showToast('There are no stock items to export.', 'error');
      return;
    }

    try {
      const doc = new jsPDF('portrait');
      doc.setTextColor(249, 115, 22); // orange accent
      doc.setFontSize(18);
      doc.text("CURRENT STOCK INVENTORY", 14, 15);

      doc.setTextColor(100);
      doc.setFontSize(9);
      const timestamp = new Date().toLocaleString('en-IN');
      doc.text(`Generated: ${timestamp}`, 196, 15, { align: 'right' });

      const head = [['Item Name', 'In Stock', 'Unit', 'Alert At', 'Status', 'Last Updated']];
      const body = stockItems.slice().sort((a, b) => a.name.localeCompare(b.name)).map(item => {
        const isLowStock = item.quantity <= item.minThreshold;
        return [
          item.name,
          String(item.quantity),
          item.unit,
          String(item.minThreshold),
          isLowStock ? 'Low Stock' : 'In Stock',
          new Date(item.lastUpdated).toLocaleString('en-IN')
        ];
      });

      autoTable(doc, {
        head,
        body,
        startY: 22,
        headStyles: { fillColor: [249, 115, 22], textColor: 255 }, // orange theme
        alternateRowStyles: { fillColor: [255, 247, 237] }, // light orange tint
        styles: { fontSize: 9, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.1 }
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Page ${i} of ${pageCount}`, 105, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      doc.save(`Stock_Inventory_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast("Stock Inventory PDF report downloaded successfully!", "success");
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF: " + (err.message || err), "error");
    }
  };

  const handleExportDailyReportPDF = () => {
    if (filteredTransactions.length === 0) {
      showToast(`No transaction records found for ${reportDate}.`, 'error');
      return;
    }

    try {
      const doc = new jsPDF('portrait');

      // Page Title
      doc.setTextColor(249, 115, 22);
      doc.setFontSize(18);
      doc.text("DAILY STOCK REPORT", 14, 15);

      // Subtitle
      doc.setTextColor(100);
      doc.setFontSize(10);
      doc.text(`Date: ${reportDate}`, 14, 22);

      const timestamp = new Date().toLocaleString('en-IN');
      doc.setFontSize(9);
      doc.text(`Generated: ${timestamp}`, 196, 15, { align: 'right' });

      // Summary Table first
      doc.setFontSize(11);
      doc.setTextColor(50);
      doc.text("Daily Summary", 14, 30);

      const summaryHead = [['Item Name', 'Stock In', 'Stock Out (Daily Use)', 'Unit']];
      const summaryBody = groupedDailyReport.map(group => [
        group.itemName,
        `+${group.totalIn}`,
        `-${group.totalOut}`,
        group.unit
      ]);

      autoTable(doc, {
        head: summaryHead,
        body: summaryBody,
        startY: 34,
        headStyles: { fillColor: [249, 115, 22], textColor: 255 },
        alternateRowStyles: { fillColor: [255, 247, 237] },
        styles: { fontSize: 9, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.1 }
      });

      // Transactions Timeline next
      const nextY = (doc as any).lastAutoTable.finalY + 12;

      doc.setFontSize(11);
      doc.setTextColor(50);
      doc.text("Detailed Timeline Log", 14, nextY);

      const timelineHead = [['Time', 'Item Name', 'Type', 'Quantity', 'Unit', 'Reason']];
      const timelineBody = filteredTransactions.map(tx => {
        const item = stockItems?.find(i => i.id === tx.stockItemId);
        return [
          formatTimestampToTime(tx.timestamp),
          item?.name || 'Unknown',
          tx.type === 'in' ? 'Stock In' : 'Stock Out',
          String(tx.quantity),
          item?.unit || '',
          tx.reason || ''
        ];
      });

      autoTable(doc, {
        head: timelineHead,
        body: timelineBody,
        startY: nextY + 4,
        headStyles: { fillColor: [74, 85, 104], textColor: 255 }, // slate gray theme for transaction list
        alternateRowStyles: { fillColor: [247, 250, 252] },
        styles: { fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.1 }
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Page ${i} of ${pageCount}`, 105, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      doc.save(`Stock_Daily_Report_${reportDate}.pdf`);
      showToast(`Stock Daily Report for ${reportDate} successfully downloaded!`, "success");
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF: " + (err.message || err), "error");
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 bg-gray-50 dark:bg-[#0B0F19] transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <Package className="text-orange-500" size={28} />
          <h1 className="text-2xl font-black text-gray-800 dark:text-white">Stock Management</h1>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3">
          {/* 3 Action Buttons */}
          <button onClick={() => { setEditingId(null); setActiveModal('addItem'); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all shadow-sm dark:shadow-orange-900/20 active:scale-95 text-sm">
            <Plus size={18} /> Add New Item
          </button>
          <button onClick={() => setActiveModal('dailyUse')}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-sm dark:shadow-red-900/20 active:scale-95 text-sm">
            <MinusCircle size={18} /> Enter Daily Use
          </button>
          <button onClick={() => setActiveModal('purchase')}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-sm dark:shadow-green-900/20 active:scale-95 text-sm">
            <ShoppingCart size={18} /> Add Purchase (Stock In)
          </button>

          <div className="w-px h-8 bg-gray-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>
          <div className="flex bg-gray-200 dark:bg-slate-800/60 p-1 rounded-xl">
            <button onClick={() => setActiveTab('items')} className={`px-5 py-2 font-bold rounded-lg transition-all text-sm ${activeTab === 'items' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm dark:shadow-none' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}>Inventory</button>
            <button onClick={() => setActiveTab('report')} className={`px-5 py-2 font-bold rounded-lg transition-all text-sm ${activeTab === 'report' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm dark:shadow-none' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}>Daily Report</button>
          </div>
        </div>
      </div>

      {/* ITEMS TAB - Full Width Table */}
      {activeTab === 'items' && (
        <div className="flex-1 bg-white dark:bg-[#111827] rounded-2xl shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-700/50 overflow-hidden flex flex-col transition-colors">
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center shrink-0 gap-3">
            <h2 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white truncate">
              <span className="hidden sm:inline">Current Stock Inventory</span>
              <span className="inline sm:hidden">Stock Inventory</span>
            </h2>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleExportStockInventory}
                className="px-2.5 py-2 sm:px-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl font-bold text-xs sm:text-sm transition-all border border-transparent dark:border-emerald-800/30 flex items-center gap-1.5 shadow-sm"
                title="Download Excel Report"
              >
                <Download size={15} />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                onClick={handleExportStockInventoryPDF}
                className="px-2.5 py-2 sm:px-4 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-xl font-bold text-xs sm:text-sm transition-all border border-transparent dark:border-purple-800/30 flex items-center gap-1.5 shadow-sm"
                title="Download PDF Report"
              >
                <FileText size={15} />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-white dark:bg-[#111827] sticky top-0 shadow-sm dark:shadow-none border-b border-gray-100 dark:border-slate-700/50 text-gray-500 dark:text-slate-400 text-sm">
                <tr>
                  <th className="p-4 font-bold">Item Name</th>
                  <th className="p-4 font-bold">In Stock</th>
                  <th className="p-4 font-bold">Alert At</th>
                  <th className="p-4 font-bold text-center">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stockItems?.sort((a, b) => a.name.localeCompare(b.name)).map(item => {
                  const isLowStock = item.quantity <= item.minThreshold;
                  return (
                    <tr key={item.id} className={`border-b border-gray-50 dark:border-slate-800/40 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors group ${isLowStock ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                      <td className="p-4 font-bold text-gray-800 dark:text-slate-200 max-w-[180px]"><div className="min-w-0 truncate">{item.name}</div></td>
                      <td className="p-4 font-black text-gray-800 dark:text-white text-lg">
                        {item.quantity} <span className="text-gray-400 dark:text-slate-500 text-sm font-bold">{item.unit}</span>
                      </td>
                      <td className="p-4 text-gray-500 dark:text-slate-400 font-medium">{item.minThreshold} {item.unit}</td>
                      <td className="p-4 text-center">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                            <AlertTriangle size={14} /> Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">In Stock</span>
                        )}
                      </td>
                      <td className="p-4 flex gap-2 justify-end">
                        <button onClick={() => handleEditItem(item)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
                {stockItems?.length === 0 && (
                  <tr><td colSpan={5} className="p-10 text-center text-gray-400 dark:text-slate-500 font-bold">No items in inventory.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT TAB */}
      {activeTab === 'report' && (
        <div className="flex-1 bg-white dark:bg-[#111827] rounded-2xl shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-700/50 flex flex-col overflow-hidden transition-colors">
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800/30 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2 shrink-0 truncate">
              <CalendarDays size={20} className="text-orange-500 shrink-0" />
              <span className="hidden sm:inline">Daily Stock Transactions</span>
              <span className="inline sm:hidden">Transactions</span>
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs sm:text-sm font-bold text-gray-500 dark:text-slate-400 shrink-0">Date:</span>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} title="Select Report Date" placeholder="Select date" className="report-date-input p-2 border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-xs sm:text-sm text-gray-700 dark:text-slate-200 outline-none focus:border-orange-500 dark:bg-slate-800 shrink-0 !w-[140px]" />
              <button
                onClick={handleExportDailyReport}
                className="px-2.5 py-2 sm:px-3.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl font-bold text-xs sm:text-sm transition-all border border-transparent dark:border-emerald-800/30 flex items-center gap-1 shadow-sm shrink-0"
                title="Download Excel Report"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                onClick={handleExportDailyReportPDF}
                className="px-2.5 py-2 sm:px-3.5 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-xl font-bold text-xs sm:text-sm transition-all border border-transparent dark:border-purple-800/30 flex items-center gap-1 shadow-sm shrink-0"
                title="Download PDF Report"
              >
                <FileText size={14} />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6 flex flex-col gap-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
              {groupedDailyReport.map(group => (
                <div key={group.itemName} className="bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 shadow-sm dark:shadow-none p-4 rounded-xl flex items-center justify-between transition-colors min-w-0 gap-4">
                  <div className="font-bold text-gray-800 dark:text-slate-200 text-lg min-w-0 truncate">{group.itemName}</div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Stock In</div>
                      <div className="font-black text-green-600 dark:text-green-400">+{group.totalIn} <span className="text-xs">{group.unit}</span></div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Stock Out</div>
                      <div className="font-black text-red-500 dark:text-red-400">-{group.totalOut} <span className="text-xs">{group.unit}</span></div>
                    </div>
                  </div>
                </div>
              ))}
              {groupedDailyReport.length === 0 && (
                <div className="col-span-full p-4 text-center text-gray-500 dark:text-slate-400 font-medium">No transactions recorded for this date.</div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-slate-700/50 pb-2">Detailed Timeline Log</h3>
              <div className="flex flex-col gap-2">
                {filteredTransactions.map(tx => {
                  const item = stockItems?.find(i => i.id === tx.stockItemId);
                  return (
                    <div key={tx.id} className="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors min-w-0">
                      <div className="w-20 text-xs font-bold text-gray-400 dark:text-slate-500 shrink-0">{formatTimestampToTime(tx.timestamp)}</div>
                      <div className="flex-1 font-bold text-gray-700 dark:text-slate-200 min-w-0 truncate">{item?.name || 'Unknown'}</div>
                      <div className={`font-black w-24 text-right shrink-0 ${tx.type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {tx.type === 'in' ? '+' : '-'}{tx.quantity} <span className="text-xs">{item?.unit}</span>
                      </div>
                      <div className="flex-[2] text-sm text-gray-500 dark:text-slate-400 font-medium min-w-0 truncate">{tx.reason}</div>
                    </div>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <div className="text-center text-gray-400 dark:text-slate-500 p-4 font-medium">Timeline is empty.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL POPUPS ===== */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-2xl dark:shadow-none border border-gray-200 dark:border-slate-700/50 w-full max-w-md animate-in zoom-in-95 duration-200 transition-colors" onClick={e => e.stopPropagation()}>

            {/* Add New Item Modal */}
            {activeModal === 'addItem' && (
              <>
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 dark:bg-orange-900/30 p-2.5 rounded-xl text-orange-600 dark:text-orange-400"><Plus size={22} /></div>
                    <h2 className="text-xl font-black text-gray-800 dark:text-white">{editingId ? 'Edit Item' : 'Add New Item'}</h2>
                  </div>
                  <button onClick={closeModal} title="Close" aria-label="Close" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X size={22} /></button>
                </div>
                <form onSubmit={handleAddItemOrUpdateDetails} className="p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Item Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium dark:bg-slate-800 dark:text-white" placeholder="e.g. Rice, Tomato" />
                  </div>
                  {!editingId && (
                    <div>
                      <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Initial Quantity</label>
                      <input type="number" step="any" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium dark:bg-slate-800 dark:text-white" placeholder="Leave empty for 0" />
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Unit</label>
                      <select title="Select Unit" value={unit} onChange={e => setUnit(e.target.value)} className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-slate-800 dark:text-white font-medium">
                        <option value="kg">kg</option><option value="g">g</option><option value="L">L</option>
                        <option value="ml">ml</option><option value="pcs">pcs</option><option value="pkt">pkt</option>
                      </select>
                    </div>
                    <div className="flex-[2]">
                      <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Low Alert (Qty)</label>
                      <input type="number" step="any" min="0" value={minThreshold} onChange={e => setMinThreshold(e.target.value)} className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium dark:bg-slate-800 dark:text-white" placeholder="e.g. 5" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm dark:shadow-orange-900/20 active:scale-95">
                      <Plus size={18} /> {editingId ? 'Update Item' : 'Add Item'}
                    </button>
                    <button type="button" onClick={closeModal} className="px-6 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-bold rounded-xl transition-all">Cancel</button>
                  </div>
                </form>
              </>
            )}

            {/* Enter Daily Use Modal */}
            {activeModal === 'dailyUse' && (
              <>
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="bg-red-100 dark:bg-red-900/30 p-2.5 rounded-xl text-red-600 dark:text-red-400"><MinusCircle size={22} /></div>
                    <h2 className="text-xl font-black text-gray-800 dark:text-white">Enter Daily Use</h2>
                  </div>
                  <button onClick={closeModal} title="Close" aria-label="Close" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X size={22} /></button>
                </div>
                <form onSubmit={e => handleStockTransaction(e, 'out', consumptionItemId, consumptionQuantity)} className="p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Select Item</label>
                    <select title="Select Stock Item" value={consumptionItemId || ''} onChange={e => setConsumptionItemId(e.target.value)} required className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-400 outline-none font-bold text-gray-700 dark:text-white bg-white dark:bg-slate-800">
                      <option value="" disabled>-- Select Item --</option>
                      {stockItems?.map(item => <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Quantity Used</label>
                    <input type="number" step="any" min="0.001" value={consumptionQuantity} onChange={e => setConsumptionQuantity(e.target.value)} required className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-400 outline-none font-bold dark:bg-slate-800 dark:text-white" placeholder="e.g. 2" />
                  </div>
                  <button type="submit" disabled={!consumptionItemId} className="w-full mt-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95">
                    <MinusCircle size={18} /> Submit Daily Use
                  </button>
                </form>
              </>
            )}

            {/* Add Purchase Modal */}
            {activeModal === 'purchase' && (
              <>
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 dark:bg-green-900/30 p-2.5 rounded-xl text-green-600 dark:text-green-400"><ShoppingCart size={22} /></div>
                    <h2 className="text-xl font-black text-gray-800 dark:text-white">Add Purchase (Stock In)</h2>
                  </div>
                  <button onClick={closeModal} title="Close" aria-label="Close" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X size={22} /></button>
                </div>
                <form onSubmit={e => handleStockTransaction(e, 'in', purchaseItemId, purchaseQuantity)} className="p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Select Item</label>
                    <select title="Select Stock Item" value={purchaseItemId || ''} onChange={e => setPurchaseItemId(e.target.value)} required className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-400 outline-none font-bold text-gray-700 dark:text-white bg-white dark:bg-slate-800">
                      <option value="" disabled>-- Select Item --</option>
                      {stockItems?.map(item => <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-600 dark:text-slate-400 mb-1">Quantity Purchased</label>
                    <input type="number" step="any" min="0.001" value={purchaseQuantity} onChange={e => setPurchaseQuantity(e.target.value)} required className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-400 outline-none font-bold dark:bg-slate-800 dark:text-white" placeholder="e.g. 50" />
                  </div>
                  <button type="submit" disabled={!purchaseItemId} className="w-full mt-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95">
                    <Plus size={18} /> Add Stock
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stock Item Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deletingItemId !== null}
        title="Delete Stock Item"
        message="⚠️ Are you sure you want to permanently delete this inventory item and all its transactions? This action cannot be undone."
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