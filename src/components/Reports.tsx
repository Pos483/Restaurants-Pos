import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery, db, cancelBill } from '../db';
import { useToast } from './Toast';
import { ThermalPrinter } from '../printer';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Calendar, 
  TrendingUp, 
  Clock, 
  CalendarDays, 
  Download, 
  FileText, 
  BarChart3, 
  Receipt, 
  Layers, 
  Wallet, 
  Printer, 
  XCircle
} from 'lucide-react';
import { escapeHtml } from '../utils/escapeHtml';
import {
  calculateBackendStats,
  formatDateStr,
  fastFormatDate
} from '../utils/reportHelpers';

import SummaryTab from './reports/SummaryTab';
import DailyTab from './reports/DailyTab';
import ItemsTab from './reports/ItemsTab';
import BillsTab from './reports/BillsTab';
import ExpensesTab from './reports/ExpensesTab';

export default function Reports() {
  const [billsPage, setBillsPage] = useState(1);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    setBillsPage(1);
  }, [startDate, endDate]);

  const bills = useLiveQuery(async () => {
    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);
    const startOfDay = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0).getTime();
    const endOfDay = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999).getTime();

    return await db.bills.where('timestamp').between(startOfDay, endOfDay, true, true).toArray();
  }, [startDate, endDate], 'bills');

  const { showToast } = useToast();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelBillId, setCancelBillId] = useState<string | null>(null);
  const [cancelBillNum, setCancelBillNum] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  const handleCancelBill = async () => {
    if (!cancelBillId || !cancelReason.trim()) return;
    setCancelLoading(true);
    try {
      await cancelBill(cancelBillId, cancelReason.trim());
      showToast(`Bill ${cancelBillNum} cancelled successfully!`, 'success');
      setCancelModalOpen(false);
      setCancelReason('');
      setCancelBillId(null);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to cancel bill.', 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const rangeExpenses = useLiveQuery(async () => {
    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);
    const startOfDay = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0).getTime();
    const endOfDay = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999).getTime();
    return db.expenses.where('timestamp').between(startOfDay, endOfDay, true, true).toArray();
  }, [startDate, endDate], 'expenses') || [];

  const totalExpenses = useMemo(() => {
    return (rangeExpenses || []).reduce((sum, e) => sum + e.amount, 0);
  }, [rangeExpenses]);

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

  const [activeTab, setActiveTab] = useState('summary');
  const [dateFilter, setDateFilter] = useState<string>('today');

  const quickFilters = [
    { id: 'today', label: 'Today', icon: '📅' },
    { id: 'yesterday', label: 'Yesterday', icon: '⏪' },
    { id: 'week', label: '7 Days', icon: '📆' },
    { id: 'month1', label: '30 Days', icon: '🗓️' },
    { id: 'month3', label: '90 Days', icon: '📊' },
    { id: 'month6', label: '6 Months', icon: '📈' },
    { id: 'custom', label: 'Custom', icon: '⚙️' },
  ];

  const handleDateFilterChange = (filterId: string) => {
    setDateFilter(filterId);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const getFormattedDate = (date: Date) => {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    let start = new Date();
    start.setHours(0, 0, 0, 0);
    switch (filterId) {
      case 'today':
        setStartDate(todayStr); setEndDate(todayStr); break;
      case 'yesterday':
        start.setDate(now.getDate() - 1);
        const yestStr = getFormattedDate(start);
        setStartDate(yestStr); setEndDate(yestStr); break;
      case 'week':
        start.setDate(now.getDate() - 6);
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'month1':
        start.setDate(now.getDate() - 29);
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'month3':
        start.setDate(now.getDate() - 89);
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'month6':
        start.setDate(now.getDate() - 179);
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'year1':
        start.setDate(now.getDate() - 364);
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'custom': break;
    }
  };

  const formatDate = useCallback((ts: number) => {
    return fastFormatDate(ts);
  }, []);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const backendStats = useMemo(() => {
    return calculateBackendStats(bills, startDate, endDate);
  }, [bills, startDate, endDate]);

  const isStatsLoading = !bills;

  const totalSales = backendStats.totalSales;
  const totalOrders = backendStats.totalOrders;
  const subTotal = backendStats.subTotal;
  const totalTax = backendStats.totalTax;
  const totalDiscount = backendStats.totalDiscount;
  const totalUnpaid = backendStats.totalUnpaid;
  const grossSales = totalSales + totalUnpaid + totalDiscount;
  const paymentStats = backendStats.paymentStats;
  const dailyStats = backendStats.dailyStats;
  const hourlyStats = backendStats.hourlyStats;
  const itemStats = backendStats.itemStats;
  const weekdayStats = backendStats.weekdayStats;
  const categoryStats = backendStats.categoryStats;

  const sortedCategories = useMemo(() => {
    return Object.entries(categoryStats)
      .map(([name, data]: any) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [categoryStats]);

  const topItems = useMemo(() => {
    return Object.entries(itemStats)
      .map(([name, data]: any) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);
  }, [itemStats]);

  const filteredBills = bills || [];

  const displayBills = useMemo(() => {
    return [...filteredBills].sort((a, b) => b.timestamp - a.timestamp).slice(0, 300);
  }, [filteredBills]);

  const billsByDate = useMemo(() => {
    const groups: Record<string, typeof filteredBills> = {};
    filteredBills.forEach(b => {
      const dStr = formatDate(b.timestamp);
      if (!groups[dStr]) groups[dStr] = [];
      groups[dStr].push(b);
    });
    return groups;
  }, [filteredBills, formatDate]);

  const isExportDisabled = isStatsLoading || filteredBills.length === 0;

  const handlePrintClosingReport = async () => {
    try {
      const breakdown = {
        Cash: paymentStats['Cash'] || 0,
        UPI: paymentStats['UPI'] || 0,
        Card: paymentStats['Card'] || 0,
        Credit: paymentStats['Credit'] || 0,
        Unpaid: paymentStats['Unpaid'] || 0,
      };
      
      const closingData = {
        date: startDate === endDate ? formatDateStr(startDate) : `${formatDateStr(startDate)} to ${formatDateStr(endDate)}`,
        totalOrders,
        subtotal: subTotal,
        discount: totalDiscount,
        tax: totalTax,
        totalSales,
        paymentBreakdown: breakdown,
        totalExpenses,
        netProfit: totalSales - totalExpenses,
      };

      await ThermalPrinter.printClosingReport(closingData, globalSettings);
      showToast('Daily Closing Report printed successfully!');
    } catch (err) {
      console.error(err);
      showToast('Printing failed. Please check connection.', 'error');
    }
  };

  const downloadBlob = (content: string, prefix: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${prefix}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    let csvContent = "";
    if (activeTab === 'summary' || activeTab === 'bills') {
      csvContent += "Bill No,Date,Time,Customer,Phone,Payment Method,Subtotal,Discount,Tax,Total\n";
      [...filteredBills].sort((a, b) => b.timestamp - a.timestamp).forEach(b => {
        const discountStr = b.discount || 0;
        const isCancelled = b.data?.status === 'cancelled';
        const pMethod = isCancelled ? `CANCELLED (${b.paymentMethod})` : b.paymentMethod;
        csvContent += `"${b.billNumber || b.id}","${formatDate(b.timestamp)}","${formatTime(b.timestamp)}","${b.customerName || '-'}","${b.customerPhone || '-'}","${pMethod}",${b.subtotal},${discountStr},${b.tax},${b.total}\n`;
      });
    } else if (activeTab === 'daily') {
      csvContent += "Date/Bill No,Time/Orders,Customer/Gross Sales,Payment Method,Discount,Total/Net Sales\n";
      Object.entries(dailyStats).forEach(([date, stats]: any) => {
        csvContent += `"${date} (Summary)","${stats.orders} orders","${stats.subtotal.toFixed(2)}","Summary","${stats.discount.toFixed(2)}","${stats.sales.toFixed(2)}"\n`;
        const dBills = (billsByDate[date] || []).slice().sort((a, b) => b.timestamp - a.timestamp);
        dBills.forEach(b => {
          const discountStr = b.discount || 0;
          const isCancelled = b.data?.status === 'cancelled';
          const pMethod = isCancelled ? `CANCELLED (${b.paymentMethod})` : b.paymentMethod;
          csvContent += `"#${b.billNumber || String(b.id).slice(-6)}","${formatTime(b.timestamp)}","${b.customerName || '-'}","${pMethod}","${discountStr.toFixed(2)}","${b.total.toFixed(2)}"\n`;
        });
      });
    } else if (activeTab === 'items') {
      csvContent += "Item Name,Category,Quantity Sold,Revenue\n";
      topItems.forEach(item => {
        csvContent += `"${item.name}","${item.category}",${item.qty},${item.revenue}\n`;
      });
    } else if (activeTab === 'categories') {
      csvContent += "Category Name,Quantity Sold,Revenue\n";
      sortedCategories.forEach(cat => {
        csvContent += `"${cat.name}",${cat.qty},${cat.revenue}\n`;
      });
    } else if (activeTab === 'hourly') {
      csvContent += "Hour,Orders,Revenue\n";
      Object.entries(hourlyStats).sort((a, b) => a[0].localeCompare(b[0])).forEach(([hour, stats]: any) => {
        csvContent += `"${hour}",${stats.orders},${stats.sales}\n`;
      });
    }
    downloadBlob(csvContent, `restaurant_report_${activeTab}`);
  };

  const downloadGSTExcel = () => {
    const taxRate = globalSettings?.gstPercentage || 5;
    const halfRate = (taxRate / 2).toFixed(1);
    let csvContent = `Date,Bill No,Customer,Subtotal,Discount,Taxable Amount,CGST (${halfRate}%),SGST (${halfRate}%),Total Amount\n`;
    [...filteredBills].sort((a, b) => b.timestamp - a.timestamp).forEach(b => {
      if (b.data?.status === 'cancelled') return;
      const taxable = Math.max(0, b.subtotal - (b.discount || 0));
      const cgst = b.tax / 2;
      const sgst = b.tax / 2;
      csvContent += `"${formatDate(b.timestamp)}","${b.billNumber || b.id}","${b.customerName || '-'}","${b.subtotal.toFixed(2)}","${(b.discount || 0).toFixed(2)}","${taxable.toFixed(2)}","${cgst.toFixed(2)}","${sgst.toFixed(2)}","${b.total.toFixed(2)}"\n`;
    });
    downloadBlob(csvContent, 'GST_Tax_Report');
  };

  const downloadPnLExcel = () => {
    const sortedDates = Object.keys(dailyStats).sort((a, b) => a.localeCompare(b));
    const expensesByDate: Record<string, number> = {};
    rangeExpenses.forEach(exp => {
      const d = fastFormatDate(exp.timestamp);
      expensesByDate[d] = (expensesByDate[d] || 0) + exp.amount;
    });

    let csvContent = "Date,Total Orders,Gross Sales (Billed),Discount,Tax (GST),Net Sales (Received),Expenses,Net Profit / Loss\n";
    let totalOrders = 0, totalGross = 0, totalDiscount = 0, totalTax = 0, totalNet = 0, totalExp = 0;

    sortedDates.forEach(date => {
      const stats: any = dailyStats[date];
      const expenses = expensesByDate[date] || 0;
      const gross = stats.subtotal;
      const discount = stats.discount;
      const tax = stats.tax;
      const netSales = stats.sales;
      const netProfit = netSales - expenses;

      totalOrders += stats.orders;
      totalGross += gross;
      totalDiscount += discount;
      totalTax += tax;
      totalNet += netSales;
      totalExp += expenses;

      csvContent += `"${date}","${stats.orders}","${gross.toFixed(2)}","${discount.toFixed(2)}","${tax.toFixed(2)}","${netSales.toFixed(2)}","${expenses.toFixed(2)}","${netProfit.toFixed(2)}"\n`;
    });

    const grandNetProfit = totalNet - totalExp;
    csvContent += `\n"TOTAL","${totalOrders}","${totalGross.toFixed(2)}","${totalDiscount.toFixed(2)}","${totalTax.toFixed(2)}","${totalNet.toFixed(2)}","${totalExp.toFixed(2)}","${grandNetProfit.toFixed(2)}"\n`;

    downloadBlob(csvContent, 'Profit_Loss_Report');
  };

  const downloadPDF = () => {
    try {
      const doc = new jsPDF('landscape');
      doc.setTextColor(74, 4, 78);
      doc.setFontSize(18);
      doc.text(`${escapeHtml(globalSettings?.restaurantName) || 'Restaurant'} - ${activeTab.toUpperCase()} REPORT`, 14, 15);
      doc.setTextColor(100);
      doc.setFontSize(11);
      doc.text(`Period: ${formatDateStr(startDate)} to ${formatDateStr(endDate)}`, 14, 22);
      const timestamp = new Date().toLocaleString();
      doc.setFontSize(9);
      doc.text(`Generated: ${timestamp}`, 280, 15, { align: 'right' });
      const styles: any = {
          headStyles: { fillColor: [74, 4, 78], textColor: 255 },
          alternateRowStyles: { fillColor: [253, 244, 255] },
          styles: { fontSize: 9, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 }
      };
      if (activeTab === 'summary' || activeTab === 'bills') {
        const body = [...displayBills].sort((a, b) => b.timestamp - a.timestamp).map(b => {
          const isCancelled = b.data?.status === 'cancelled';
          return [
            `#${b.billNumber || String(b.id).slice(-6)}`, formatDate(b.timestamp), formatTime(b.timestamp),
            b.customerName || '-', isCancelled ? `CANCELLED (${b.paymentMethod})` : b.paymentMethod,
            (b.discount || 0) > 0 ? `-Rs. ${(b.discount || 0).toFixed(2)}` : '-',
            `Rs. ${b.total.toFixed(2)}`
          ];
        }) as string[][];
        autoTable(doc, { head: [['Bill No', 'Date', 'Time', 'Customer', 'Payment', 'Discount', 'Total']], body, startY: 30, ...styles });
      } else if (activeTab === 'daily') {
        const body: any[] = [];
        Object.entries(dailyStats).forEach(([date, stats]: any) => {
            body.push([{ content: `Date: ${date} (Daily Total: Rs. ${stats.sales.toFixed(2)})`, colSpan: 6, styles: { fillColor: [252, 231, 243], textColor: [131, 24, 67], fontStyle: 'bold' } }]);
            const dBills = (billsByDate[date] || []).slice().sort((a, b) => b.timestamp - a.timestamp);
            dBills.forEach(b => {
              const isCancelled = b.data?.status === 'cancelled';
              body.push([ `#${b.billNumber || String(b.id).slice(-6)}`, formatTime(b.timestamp), b.customerName || '-', isCancelled ? `CANCELLED (${b.paymentMethod})` : b.paymentMethod,
                (b.discount || 0) > 0 ? `-Rs. ${(b.discount || 0).toFixed(2)}` : '-', `Rs. ${b.total.toFixed(2)}` ]);
            });
        });
        autoTable(doc, { head: [['Bill No', 'Time', 'Customer', 'Payment', 'Discount', 'Net Sales']], body, startY: 30, ...styles });
      } else if (activeTab === 'items') {
        const body = topItems.map((item: any) => [ item.name, item.category, item.qty.toString(), `Rs. ${item.revenue.toFixed(2)}` ]) as string[][];
        autoTable(doc, { head: [['Item Name', 'Category', 'Qty Sold', 'Revenue']], body, startY: 30, ...styles });
      } else if (activeTab === 'categories') {
        const body = sortedCategories.map((cat: any) => [ cat.name, cat.qty.toString(), `Rs. ${cat.revenue.toFixed(2)}` ]) as string[][];
        autoTable(doc, { head: [['Category Name', 'Qty Sold', 'Revenue']], body, startY: 30, ...styles });
      } else if (activeTab === 'hourly') {
        const body = Object.entries(hourlyStats).sort((a, b) => a[0].localeCompare(b[0])).map(([hour, stats]: any) => [
            hour, stats.orders.toString(), `Rs. ${stats.sales.toFixed(2)}`
        ]) as string[][];
        autoTable(doc, { head: [['Hour', 'Orders', 'Revenue']], body, startY: 30, ...styles });
      }
      const pageCount = (doc as any).internal.getNumberOfPages();
      for(let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.text(`Page ${i} of ${pageCount}`, 148, doc.internal.pageSize.height - 10, { align: 'center' });
      }
      doc.save(`restaurant_report_${activeTab}_${startDate}_to_${endDate}.pdf`);
    } catch (err) {
      console.error("PDF Generation failed:", err);
      showToast("Failed to generate PDF. Make sure jsPDF is installed properly.", "error");
    }
  };

  const handleCancelClick = (billId: string, billNumberDisplay: string) => {
    setCancelBillId(billId);
    setCancelBillNum(billNumberDisplay);
    setCancelReason('');
    setCancelModalOpen(true);
  };

  if (!bills || isStatsLoading) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-bold text-gray-500 dark:text-slate-400">Loading Reports...</p>
      </div>
    </div>
  );

  const maxHourlySales = Math.max(...Object.values(hourlyStats).map((s: any) => s.sales), 1);

  const tabs = [
    { id: 'summary', label: 'Overview', icon: <BarChart3 size={15} /> },
    { id: 'closing', label: 'Closing Report', icon: <Receipt size={15} /> },
    { id: 'day_wise', label: 'Day Performance', icon: <CalendarDays size={15} /> },
    { id: 'expenses', label: 'Expenses', icon: <Wallet size={15} /> },
    { id: 'daily', label: 'Daily', icon: <CalendarDays size={15} /> },
    { id: 'hourly', label: 'Hourly', icon: <Clock size={15} /> },
    { id: 'categories', label: 'Categories', icon: <Layers size={15} /> },
    { id: 'items', label: 'Items', icon: <Layers size={15} /> },
    { id: 'bills', label: 'Bills', icon: <Receipt size={15} /> },
  ];

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* ── HEADER BAR ── */}
      <div className="shrink-0 flex flex-col gap-3">
        {/* Row 1: Title + Filters + Downloads */}
        <div className="flex items-center justify-between flex-wrap lg:flex-nowrap gap-3 pb-3 border-b border-gray-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3.5 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200">
                <BarChart3 size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900 dark:text-slate-100 tracking-tight">Reports & Analytics</h1>
                <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 -mt-0.5">{startDate === endDate ? formatDateStr(startDate) : `${formatDateStr(startDate)} — ${formatDateStr(endDate)}`}</p>
              </div>
            </div>

            <select
              value={dateFilter}
              onChange={(e) => handleDateFilterChange(e.target.value)}
              title="Select Date Range"
              className="px-3 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-xs focus:outline-none focus:border-purple-500 cursor-pointer shadow-sm w-32 shrink-0 animate-in fade-in duration-200"
            >
              {quickFilters.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm shrink-0 animate-in slide-in-from-left duration-250">
                <Calendar size={12} className="text-purple-400" />
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => { setStartDate(e.target.value); setDateFilter('custom'); }}
                  title="Start Date"
                  aria-label="Start Date"
                  className="bg-transparent font-bold text-gray-700 dark:text-slate-200 focus:outline-none text-[10px] w-[95px]" 
                />
                <span className="text-gray-300 dark:text-slate-600 text-[10px] font-bold">→</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => { setEndDate(e.target.value); setDateFilter('custom'); }}
                  title="End Date"
                  aria-label="End Date"
                  className="bg-transparent font-bold text-gray-700 dark:text-slate-200 focus:outline-none text-[10px] w-[95px]" 
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={downloadGSTExcel} 
              disabled={isExportDisabled}
              className="px-3 py-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold text-xs min-h-[36px] flex items-center gap-1.5 transition-all border border-transparent hover:border-emerald-200 disabled:opacity-50 disabled:pointer-events-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-400" 
              title="Download GST Report"
            >
              <Download size={13} /> GST
            </button>
            <button 
              onClick={downloadPnLExcel} 
              disabled={isExportDisabled}
              className="px-3 py-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold text-xs min-h-[36px] flex items-center gap-1.5 transition-all border border-transparent hover:border-emerald-200 disabled:opacity-50 disabled:pointer-events-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-400" 
              title="Download P&L Report"
            >
              <Download size={13} /> P&L
            </button>
            <button 
              onClick={downloadCSV} 
              disabled={isExportDisabled}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs min-h-[36px] flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-200 disabled:opacity-50 disabled:pointer-events-none dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              <Download size={13} /> CSV
            </button>
            <button 
              onClick={downloadPDF} 
              disabled={isExportDisabled}
              className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs min-h-[36px] flex items-center gap-1.5 transition-all shadow-sm shadow-purple-200 disabled:opacity-50 disabled:pointer-events-none dark:from-purple-700 dark:to-indigo-700"
            >
              <FileText size={13} /> PDF
            </button>
          </div>
        </div>

        {/* Row 3: Sub-tabs navigation bar */}
        <div className="flex items-center overflow-x-auto scrollbar-hide py-1 border-t border-gray-100 dark:border-slate-800/80 mt-1 shrink-0">
          <div className="flex items-center gap-0.5 bg-gray-100/80 dark:bg-slate-900/50 p-1 rounded-xl w-fit">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-slate-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-auto flex flex-col pb-4">
        {/* ═══ TAB: SUMMARY ═══ */}
        {activeTab === 'summary' && (
          <SummaryTab backendStats={backendStats} />
        )}

        {/* ═══ TAB: DAILY CLOSING REPORT ═══ */}
        {activeTab === 'closing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-gray-100 dark:border-slate-800/80 flex flex-col gap-5">
              <div className="flex justify-between items-center border-b border-gray-50 dark:border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-lg font-black text-gray-800 dark:text-slate-100">Daily Closing Report</h2>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-bold uppercase mt-1">Date: {startDate === endDate ? formatDateStr(startDate) : `${formatDateStr(startDate)} to ${formatDateStr(endDate)}`}</p>
                </div>
                <button 
                  onClick={handlePrintClosingReport}
                  className="py-3 px-5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl font-black text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-orange-100 dark:shadow-none"
                >
                  <Printer size={15} /> Print Closing Report
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 min-w-0">
                  <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase truncate block" title="Gross Sales (Total Billed)">Gross Sales (Total Billed)</span>
                  <div className="text-xl font-black text-gray-800 dark:text-slate-200 mt-1 truncate">₹{grossSales.toFixed(2)}</div>
                </div>
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 min-w-0">
                  <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase truncate block" title="Net Sales (Received Cash/UPI/Card)">Net Sales (Received)</span>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 truncate">₹{totalSales.toFixed(2)}</div>
                </div>
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 min-w-0">
                  <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase truncate block" title="Total Expenses Billed">Total Expenses Billed</span>
                  <div className="text-xl font-black text-rose-500 mt-1 truncate">₹{totalExpenses.toFixed(2)}</div>
                </div>
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 min-w-0">
                  <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase truncate block" title="Est. Net Profit">Est. Net Profit</span>
                  <div className={`text-xl font-black mt-1 truncate ${(totalSales - totalExpenses) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-rose-500'}`}>
                    ₹{(totalSales - totalExpenses).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-2">
                <h3 className="text-sm font-black uppercase text-gray-400 dark:text-slate-500 tracking-wider">Payment Breakdown</h3>
                <div className="flex flex-col border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-2 p-3.5 border-b border-gray-50 dark:border-slate-800 font-black text-xs text-gray-400 uppercase bg-gray-50/30 dark:bg-slate-900/20">
                    <span>Payment Method</span>
                    <span className="text-right">Total (₹)</span>
                  </div>
                  {['Cash', 'UPI', 'Card', 'Credit', 'Unpaid'].map((pm) => {
                    const amt = paymentStats[pm] || 0;
                    return (
                      <div key={pm} className="grid grid-cols-2 p-3.5 border-b border-gray-50 dark:border-slate-800/40 last:border-0 font-bold text-sm text-gray-700 dark:text-slate-300">
                        <span>{pm === 'Credit' ? 'Credit (Udhar)' : pm === 'Unpaid' ? 'Unpaid' : pm}</span>
                        <span className="text-right font-black">₹{amt.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-gray-100 dark:border-slate-800/80 flex flex-col gap-4">
              <h3 className="font-black text-gray-800 dark:text-slate-200 text-base">Expense Log Summary</h3>
              <div className="flex flex-col gap-3">
                {rangeExpenses.length === 0 ? (
                  <div className="text-center py-12 text-gray-300 dark:text-slate-600 font-bold text-xs flex flex-col items-center gap-1">
                    <Wallet size={28} className="opacity-20" />
                    No expenses logged today
                  </div>
                ) : (
                  rangeExpenses.slice(0, 8).map((exp) => (
                    <div key={exp.id} className="p-3 bg-gray-50/60 dark:bg-slate-900/40 rounded-2xl flex items-center justify-between border border-gray-100/50 dark:border-slate-800/20">
                      <div className="min-w-0">
                        <div className="font-black text-gray-800 dark:text-slate-200 text-xs truncate">{exp.note || 'Expense'}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-0.5">{exp.paymentMethod}</div>
                      </div>
                      <span className="font-black text-xs text-rose-500 shrink-0">₹{exp.amount.toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: DAY PERFORMANCE (WEEKDAY AGGREGATION) ═══ */}
        {activeTab === 'day_wise' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><CalendarDays size={14} className="text-purple-600 dark:text-purple-400" /></div>
                <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Weekly Performance Analysis</h2>
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">Aggregated over range</span>
            </div>

            <div className="p-5 bg-purple-50/50 dark:bg-purple-950/10 border-b border-gray-100 dark:border-slate-800/60 flex items-start gap-3 shrink-0">
              <span className="text-lg">💡</span>
              <div>
                <h4 className="text-xs font-black text-purple-950 dark:text-purple-300">Staff Holiday Planning Guidance</h4>
                <p className="text-xs text-purple-800 dark:text-purple-400 font-semibold mt-0.5">
                  यह ग्राफ चुनी गई अवधि में सभी हफ्तों के डेटा को मिलाकर दिखाता है। <strong>"Best for Holiday"</strong> टैग वाले दिन सेल्स और ग्राहकों की संख्या सबसे कम रहती है, जो स्टाफ की छुट्टी के लिए सबसे सही दिन है।
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {weekdayStats.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 font-semibold">No sales data available.</div>
              ) : (() => {
                const maxAvgSales = Math.max(...weekdayStats.map((s: any) => s.sales / s.count), 1);
                const sortedByAvg = [...weekdayStats].sort((a: any, b: any) => (a.sales / a.count) - (b.sales / b.count));
                const hasSales = weekdayStats.some((s: any) => s.sales > 0);
                const lowestDay = hasSales ? sortedByAvg[0]?.day : null;
                const highestDay = hasSales ? sortedByAvg[sortedByAvg.length - 1]?.day : null;

                return (
                  <div className="flex flex-col gap-4">
                    {weekdayStats.map((item: any) => {
                      const avgSales = item.sales / item.count;
                      const salesPct = (avgSales / maxAvgSales) * 100;
                      const isLowest = item.day === lowestDay;
                      const isHighest = item.day === highestDay;

                      return (
                        <div key={item.day} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 group hover:bg-gray-50 dark:hover:bg-slate-800/40 rounded-xl px-3 py-2.5 transition-all border border-transparent hover:border-gray-100 dark:hover:border-slate-800">
                          <div className="w-40 shrink-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-xs text-gray-800 dark:text-slate-200">{item.day}</span>
                              {isLowest && (
                                <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                                  Best for Holiday
                                </span>
                              )}
                              {isHighest && (
                                <span className="bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                                  Peak Day
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500">
                              Based on {item.count} week{item.count > 1 ? 's' : ''} in range
                            </span>
                          </div>

                          <div className="flex-1 flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-100 dark:bg-slate-800 h-6 rounded-lg overflow-hidden relative">
                                <div 
                                  className={`h-full bg-gradient-to-r ${isLowest ? 'from-emerald-400 to-teal-400' : isHighest ? 'from-rose-500 to-orange-500' : 'from-purple-500 to-indigo-500'} rounded-lg flex items-center justify-end pr-2.5 transition-all duration-700`}
                                  style={{ width: `${Math.max(salesPct, 12)}%` }}
                                >
                                  {salesPct > 20 && (
                                    <span className="text-[10px] font-black text-white">
                                      ₹{avgSales.toFixed(0)}/day avg
                                    </span>
                                  )}
                                </div>
                                {salesPct <= 20 && (
                                  <span className="absolute left-2.5 top-1 text-[10px] font-bold text-gray-600 dark:text-slate-400">
                                    ₹{avgSales.toFixed(0)}/day avg
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="w-32 text-right shrink-0 flex flex-col gap-0.5">
                            <span className="font-black text-xs text-gray-700 dark:text-slate-300">
                              Total: ₹{item.sales.toFixed(0)}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500">
                              {item.orders} bill{item.orders !== 1 ? 's' : ''} total
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══ TAB: EXPENSES ═══ */}
        {activeTab === 'expenses' && (
          <ExpensesTab rangeExpenses={rangeExpenses} />
        )}

        {/* ═══ TAB: DAILY Sales Table ═══ */}
        {activeTab === 'daily' && (
          <DailyTab 
            dailyStats={dailyStats} 
            billsByDate={billsByDate} 
            formatTime={formatTime} 
          />
        )}

        {/* ═══ TAB: HOURLY Chart ═══ */}
        {activeTab === 'hourly' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg"><Clock size={14} className="text-orange-600 dark:text-orange-400" /></div>
                <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Hourly Performance</h2>
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{Object.keys(hourlyStats).length} active hour(s)</span>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {Object.keys(hourlyStats).length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 font-semibold">No hourly data available.</div>
              ) : (() => {
                const sortedHours = Object.entries(hourlyStats).sort((a, b) => a[0].localeCompare(b[0]));
                const hourlyList = sortedHours.map(([hour, stats]: any) => ({ hour, ...stats }));
                const peakHourObj = [...hourlyList].sort((a, b) => b.sales - a.sales)[0];
                const slowestHourObj = [...hourlyList].sort((a, b) => a.sales - b.sales)[0];

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 flex flex-col gap-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl border border-orange-100 bg-orange-50/20 dark:border-orange-950/20 dark:bg-orange-950/10 flex items-center gap-3">
                          <div className="p-2 bg-orange-500 text-white rounded-xl shadow-md shadow-orange-100 dark:shadow-none"><TrendingUp size={16} /></div>
                          <div>
                            <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider">Peak Hour</span>
                            <div className="text-xs font-black text-gray-800 dark:text-slate-200 mt-0.5">{peakHourObj?.hour}</div>
                            <div className="text-sm font-black text-orange-600 dark:text-orange-400">₹{peakHourObj?.sales.toFixed(2)}</div>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-slate-800/80 dark:bg-slate-900/30 flex items-center gap-3">
                          <div className="p-2 bg-gray-400 text-white rounded-xl"><Clock size={16} /></div>
                          <div>
                            <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider">Slowest Hour</span>
                            <div className="text-xs font-black text-gray-800 dark:text-slate-200 mt-0.5">{slowestHourObj?.hour}</div>
                            <div className="text-sm font-black text-gray-500 dark:text-slate-400">₹{slowestHourObj?.sales.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                        <div className="grid grid-cols-3 p-3.5 border-b border-gray-50 dark:border-slate-800 font-black text-xs text-gray-400 uppercase bg-gray-50/30 dark:bg-slate-900/20">
                          <span>Hour</span>
                          <span className="text-center">Orders</span>
                          <span className="text-right">Revenue (₹)</span>
                        </div>
                        <div className="flex flex-col divide-y divide-gray-50 dark:divide-slate-800/40 max-h-[40vh] overflow-y-auto">
                          {hourlyList.map((item) => {
                            const isHovered = hoveredHour === item.hour;
                            const isPeak = item.hour === peakHourObj?.hour;
                            return (
                              <div 
                                key={item.hour} 
                                className={`grid grid-cols-3 p-3.5 items-center font-bold text-xs text-gray-700 dark:text-slate-300 transition-all duration-150 cursor-pointer ${
                                  isHovered ? 'bg-orange-50/50 dark:bg-orange-950/10' : 'hover:bg-gray-50/30 dark:hover:bg-slate-800/20'
                                }`}
                                onMouseEnter={() => setHoveredHour(item.hour)}
                                onMouseLeave={() => setHoveredHour(null)}
                              >
                                <span className="flex items-center gap-1.5 font-bold">
                                  {item.hour.split(' - ')[0]}
                                  {isPeak && (
                                    <span className="bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide">
                                      Peak
                                    </span>
                                  )}
                                </span>
                                <span className="text-center text-gray-500 dark:text-slate-400">{item.orders} bills</span>
                                <span className="text-right font-black text-gray-900 dark:text-slate-100">₹{item.sales.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50/30 dark:bg-slate-900/10 border border-gray-100 dark:border-slate-800 rounded-3xl p-6 flex flex-col gap-4 items-center justify-center min-h-[300px]">
                      <h3 className="text-xs font-black uppercase text-gray-400 dark:text-slate-500 tracking-wider">Hourly Performance Chart</h3>
                      
                      {(() => {
                        const width = 280;
                        const height = 180;
                        const paddingLeft = 35;
                        const paddingRight = 10;
                        const paddingTop = 15;
                        const paddingBottom = 25;

                        const chartWidth = width - paddingLeft - paddingRight;
                        const chartHeight = height - paddingTop - paddingBottom;
                        const barWidth = Math.max(4, Math.floor(chartWidth / hourlyList.length) - 6);

                        const points = hourlyList.map((item, idx) => {
                          const x = paddingLeft + idx * (chartWidth / hourlyList.length) + 3;
                          const barHeight = (item.sales / maxHourlySales) * chartHeight;
                          const y = height - paddingBottom - barHeight;
                          return { x, y, barHeight, ...item };
                        });

                        const activeHour = hoveredHour 
                          ? points.find((p) => p.hour === hoveredHour)
                          : peakHourObj ? points.find((p) => p.hour === peakHourObj.hour) : null;

                        return (
                          <div className="relative w-full flex flex-col items-center gap-4">
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                              <defs>
                                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#f97316" />
                                  <stop offset="100%" stopColor="#fdba74" />
                                </linearGradient>
                              </defs>

                              {[0, 0.5, 1].map((ratio, idx) => {
                                const y = height - paddingBottom - ratio * chartHeight;
                                const labelVal = ratio * maxHourlySales;
                                return (
                                  <g key={idx}>
                                    <line 
                                      x1={paddingLeft} 
                                      y1={y} 
                                      x2={width - paddingRight} 
                                      y2={y} 
                                      stroke="#e2e8f0" 
                                      strokeDasharray="2 2" 
                                      className="dark:stroke-slate-800/80"
                                    />
                                    <text 
                                      x={paddingLeft - 6} 
                                      y={y + 3} 
                                      textAnchor="end" 
                                      className="text-[8px] font-bold fill-gray-400 dark:fill-slate-500"
                                    >
                                      ₹{labelVal >= 1000 ? `${(labelVal / 1000).toFixed(0)}k` : labelVal.toFixed(0)}
                                    </text>
                                  </g>
                                );
                              })}

                              {points.map((p) => {
                                const isHovered = hoveredHour === p.hour;
                                return (
                                  <g key={p.hour}>
                                    <rect 
                                      x={p.x} 
                                      y={p.y} 
                                      width={barWidth} 
                                      height={Math.max(p.barHeight, 2)} 
                                      rx={Math.min(barWidth / 2, 3)}
                                      fill={isHovered ? '#ea580c' : 'url(#hourGrad)'}
                                      className="transition-all duration-200 cursor-pointer origin-bottom"
                                      onMouseEnter={() => setHoveredHour(p.hour)}
                                      onMouseLeave={() => setHoveredHour(null)}
                                    />
                                    <rect 
                                      x={p.x - 2} 
                                      y={paddingTop} 
                                      width={barWidth + 4} 
                                      height={chartHeight} 
                                      fill="transparent" 
                                      className="cursor-pointer"
                                      onMouseEnter={() => setHoveredHour(p.hour)}
                                      onMouseLeave={() => setHoveredHour(null)}
                                    />
                                  </g>
                                );
                              })}

                              {points.filter((_, idx) => idx % Math.max(1, Math.floor(points.length / 4)) === 0).map((p) => (
                                <text 
                                  key={p.hour}
                                  x={p.x + barWidth / 2} 
                                  y={height - 10} 
                                  textAnchor="middle" 
                                  className="text-[8px] font-bold fill-gray-400 dark:fill-slate-500"
                                >
                                  {p.hour.split(' - ')[0]}
                                </text>
                              ))}
                            </svg>

                            {activeHour && (
                              <div className="bg-orange-50/40 border border-orange-100 dark:bg-slate-900/40 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-center flex flex-col gap-0.5 w-full">
                                <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                  Selected Hour: {activeHour.hour}
                                </span>
                                <span className="text-sm font-black text-gray-800 dark:text-slate-100 mt-0.5">
                                  ₹{activeHour.sales.toFixed(2)}
                                </span>
                                <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">
                                  {activeHour.orders} bill(s) generated
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══ TAB: CATEGORIES Distribution Chart ═══ */}
        {activeTab === 'categories' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Layers size={14} className="text-purple-600 dark:text-purple-400" /></div>
                <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Category-Wise Sales Summary</h2>
              </div>
              <span className="px-3 py-1 bg-purple-50 border border-purple-200 dark:border-purple-800 dark:bg-purple-950/20 rounded-lg text-xs font-bold text-purple-700 dark:text-purple-400">
                {sortedCategories.length} categories sold
              </span>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {sortedCategories.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 font-semibold">
                  No category data available.
                </div>
              ) : (() => {
                const totalCategoryRevenue = sortedCategories.reduce((sum: number, c: any) => sum + c.revenue, 0);
                const CATEGORY_COLORS = ['#7c3aed', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#8b5cf6'];
                const radius = 36;
                const strokeWidth = 10;
                const circumference = 2 * Math.PI * radius;
                let accumulatedPercent = 0;

                const donutSlices = sortedCategories.map((cat: any, idx: number) => {
                  const pct = totalCategoryRevenue > 0 ? (cat.revenue / totalCategoryRevenue) * 100 : 0;
                  const dash = (pct / 100) * circumference;
                  const offset = circumference - (accumulatedPercent / 100) * circumference;
                  accumulatedPercent += pct;
                  const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                  return { ...cat, pct, dash, offset, color };
                });

                const activeCat = hoveredCategory 
                  ? donutSlices.find((c: any) => c.name === hoveredCategory)
                  : donutSlices[0];

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 flex flex-col border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50/50 dark:bg-slate-900/20 text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                              <th className="py-3 px-4 w-12 text-center">#</th>
                              <th className="py-3 px-4">Category Name</th>
                              <th className="py-3 px-4 text-center">Qty Sold</th>
                              <th className="py-3 px-4 text-right">Revenue</th>
                              <th className="py-3 px-4 text-right">% Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {donutSlices.map((cat: any, index: number) => {
                              const isHovered = hoveredCategory === cat.name;
                              return (
                                <tr 
                                  key={cat.name} 
                                  className={`border-b border-gray-50 dark:border-slate-800/60 transition-all duration-200 cursor-pointer ${
                                    isHovered ? 'bg-purple-50/40 dark:bg-purple-950/15' : 'hover:bg-gray-50/30 dark:hover:bg-slate-800/20'
                                  }`}
                                  onMouseEnter={() => setHoveredCategory(cat.name)}
                                  onMouseLeave={() => setHoveredCategory(null)}
                                >
                                  <td className="py-3 px-4 text-center">
                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{index + 1}</span>
                                  </td>
                                  <td className="py-3 px-4 font-bold text-xs text-gray-800 dark:text-slate-200">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                      <span className="truncate max-w-[150px]" title={cat.name}>{cat.name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-xs font-bold text-gray-600 dark:text-slate-400">
                                      {cat.qty}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right font-black text-xs text-gray-800 dark:text-slate-200">
                                    ₹{cat.revenue.toFixed(2)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-bold text-xs text-purple-600 dark:text-purple-400">
                                    {cat.pct.toFixed(1)}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-gray-50/30 dark:bg-slate-900/10 border border-gray-100 dark:border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-6">
                      <h3 className="text-xs font-black uppercase text-gray-400 dark:text-slate-500 tracking-wider">Revenue Distribution</h3>
                      
                      <div className="relative w-48 h-48">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                          {donutSlices.map((slice: any) => {
                            const isHovered = hoveredCategory === slice.name;
                            return (
                              <circle
                                key={slice.name}
                                cx="50"
                                cy="50"
                                r={radius}
                                fill="transparent"
                                stroke={slice.color}
                                strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
                                strokeDasharray={`${slice.dash} ${circumference - slice.dash}`}
                                strokeDashoffset={slice.offset}
                                strokeLinecap={slice.pct > 2 ? 'round' : 'butt'}
                                className="transition-all duration-300 origin-center"
                                style={{ transform: isHovered ? 'scale(1.03)' : 'scale(1)' }}
                                onMouseEnter={() => setHoveredCategory(slice.name)}
                                onMouseLeave={() => setHoveredCategory(null)}
                              />
                            );
                          })}
                        </svg>

                        {activeCat && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-4">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider truncate max-w-[120px]">
                              {activeCat.name}
                            </span>
                            <span className="text-lg font-black text-gray-800 dark:text-slate-100 mt-0.5">
                              ₹{activeCat.revenue.toFixed(0)}
                            </span>
                            <span className="text-[10px] font-black text-purple-600 dark:text-purple-400">
                              {activeCat.pct.toFixed(1)}% share
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 justify-center mt-2 max-h-32 overflow-y-auto pr-1">
                        {donutSlices.slice(0, 6).map((slice: any) => (
                          <div 
                            key={slice.name} 
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                              hoveredCategory === slice.name 
                                ? 'bg-white border-purple-200 text-purple-700 dark:bg-slate-800 dark:border-purple-900 dark:text-purple-400 shadow-sm'
                                : 'bg-transparent border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700'
                            }`}
                            onMouseEnter={() => setHoveredCategory(slice.name)}
                            onMouseLeave={() => setHoveredCategory(null)}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                            <span className="truncate max-w-[80px]">{slice.name}</span>
                          </div>
                        ))}
                        {donutSlices.length > 6 && (
                          <div className="text-[9px] font-bold text-gray-400 dark:text-slate-500 flex items-center justify-center">
                            +{donutSlices.length - 6} more categories
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══ TAB: ITEMS SOLD ═══ */}
        {activeTab === 'items' && (
          <ItemsTab itemStats={itemStats} />
        )}

        {/* ═══ TAB: BILLS log ═══ */}
        {activeTab === 'bills' && (
          <BillsTab 
            bills={filteredBills} 
            billsPage={billsPage} 
            setBillsPage={setBillsPage}
            formatDate={formatDate}
            formatTime={formatTime}
            onCancelClick={handleCancelClick}
          />
        )}
      </div>

      {/* Cancel Bill Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-gray-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center sm:text-left mb-5">
              <h3 className="font-black text-xl text-gray-800 dark:text-slate-100">Cancel Bill {cancelBillNum}</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">This action cannot be undone and the stock will be returned.</p>
            </div>
            
            <div className="mb-5">
              <label className="text-xs font-bold text-gray-600 dark:text-slate-400 mb-2 block">Reason for cancellation *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Example: Customer changed mind, incorrect item ordered..."
                className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-red-400 dark:focus:border-red-500/80 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950/40 resize-none h-24"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setCancelModalOpen(false); setCancelReason(''); }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-gray-700 dark:text-slate-300 rounded-xl font-bold transition-all text-xs active:scale-95"
                disabled={cancelLoading}
              >
                No, Keep Bill
              </button>
              <button
                type="button"
                onClick={handleCancelBill}
                disabled={!cancelReason.trim() || cancelLoading}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs active:scale-95"
              >
                {cancelLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <><XCircle size={14} /> Yes, Cancel Bill</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
