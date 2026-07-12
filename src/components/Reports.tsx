import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useLiveQuery, db, cancelBill } from '../db';
import { useToast } from './Toast';
import { ThermalPrinter } from '../printer';
import { Plus, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';


const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getItemName = (item: any): string => {
  return item?.menuItem?.name || item?.name || 'Unknown Item';
};
const getItemPrice = (item: any): number => {
  return item?.menuItem?.price ?? item?.price ?? 0;
};
const formatDateStr = (dateStr: string) => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return dateStr;
  const day = String(parts[2]).padStart(2, '0');
  const month = monthNames[parts[1] - 1] || '';
  const year = parts[0];
  return `${day} ${month} ${year}`;
};

const fastFormatDate = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Calendar, PieChart, TrendingUp, IndianRupee, Clock, CalendarDays, Download, FileText, BarChart3, CreditCard, Wallet, Smartphone, AlertCircle, Receipt, Layers, ShoppingBag, Printer, Ban, XCircle } from 'lucide-react';
import { escapeHtml } from '../utils/escapeHtml';
export default function Reports() {
  const [billsPage, setBillsPage] = useState(1);
  const [dailyPage, setDailyPage] = useState(1);

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
    setDailyPage(1);
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
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Add Expense form states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState('Cash');
  const [expNote, setExpNote] = useState('');
  const [expDate, setExpDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const totalExpenses = useMemo(() => {
    return (rangeExpenses || []).reduce((sum, e) => sum + e.amount, 0);
  }, [rangeExpenses]);

  // Expenses Payment Method breakdown
  const expenseMethodsBreakdown = useMemo(() => {
    const methods: Record<string, number> = {
      Cash: 0,
      UPI: 0,
      Card: 0
    };
    rangeExpenses.forEach(e => {
      const pm = e.paymentMethod || 'Cash';
      if (methods[pm] !== undefined) {
        methods[pm] += e.amount;
      } else {
        methods[pm] = (methods[pm] || 0) + e.amount;
      }
    });
    return Object.entries(methods).sort((a, b) => b[1] - a[1]);
  }, [rangeExpenses]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid expense amount!', 'error');
      return;
    }
    if (!expNote.trim()) {
      showToast('Please enter a description or note!', 'error');
      return;
    }

    let timestamp = Date.now();
    if (expDate) {
      const parts = expDate.split('-').map(Number);
      if (parts.length === 3) {
        const now = new Date();
        const expenseDate = new Date(parts[0], parts[1] - 1, parts[2], now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        timestamp = expenseDate.getTime();
      }
    }

    try {
      await db.expenses.add({
        id: crypto.randomUUID(),
        amount,
        category: 'Others',
        paymentMethod: expMethod,
        note: expNote.trim(),
        timestamp: timestamp
      });
      showToast('Expense successfully logged!');
      setShowAddExpense(false);
      setExpAmount('');
      setExpNote('');
      const d = new Date();
      setExpDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to save expense. Please try again.', 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await db.expenses.delete(id);
      showToast('Expense deleted successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete expense.', 'error');
    }
  };

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
        start.setDate(now.getDate() - 6); // 7 days inclusive of today
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'month1':
        start.setDate(now.getDate() - 29); // 30 days inclusive of today
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'month3':
        start.setDate(now.getDate() - 89); // 90 days inclusive of today
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'month6':
        start.setDate(now.getDate() - 179); // 180 days (6 months) inclusive of today
        setStartDate(getFormattedDate(start)); setEndDate(todayStr); break;
      case 'year1':
        start.setDate(now.getDate() - 364); // 365 days (1 year) inclusive of today
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
    if (!bills) return { totalSales: 0, totalOrders: 0, totalTax: 0, subTotal: 0, totalDiscount: 0, totalUnpaid: 0, paymentStats: {}, dailyStats: {}, hourlyStats: {}, itemStats: {}, weekdayStats: [] };

    const rangeBills = bills;

    let totalSales = 0;
    let totalTax = 0;
    let subTotal = 0;
    let totalDiscount = 0;
    let totalUnpaid = 0;
    let activeOrdersCount = 0;
    
    const paymentStats: Record<string, number> = {};
    const dailyStats: Record<string, any> = {};
    const hourlyStats: Record<string, any> = {};
    const itemStats: Record<string, { qty: number; revenue: number; category: string }> = {};

    // Count occurrences of each weekday in the selected range to get an accurate average
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // 0 = Sunday, 1 = Monday...
    try {
      const startParts = startDate.split('-').map(Number);
      const endParts = endDate.split('-').map(Number);
      if (startParts.length === 3 && endParts.length === 3) {
        const startD = new Date(startParts[0], startParts[1] - 1, startParts[2]);
        const endD = new Date(endParts[0], endParts[1] - 1, endParts[2]);
        const tempDate = new Date(startD);
        let safetyCount = 0;
        while (tempDate <= endD && safetyCount < 400) {
          weekdayCounts[tempDate.getDay()] += 1;
          tempDate.setDate(tempDate.getDate() + 1);
          safetyCount++;
        }
      }
    } catch (e) {
      console.error('Error calculating weekday counts:', e);
    }

    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdayStats: Record<string, { day: string; sales: number; orders: number; count: number }> = {};
    weekdayNames.forEach((day, index) => {
      weekdayStats[day] = { day, sales: 0, orders: 0, count: weekdayCounts[index] || 1 };
    });

    for (const b of rangeBills) {
      if (b.data?.status === 'cancelled') continue; // Skip cancelled bills
      activeOrdersCount++;
      subTotal += b.subtotal;
      totalTax += b.tax;
      totalDiscount += b.discount || 0;

      if (b.paymentMethod.startsWith('Split')) {
        const cashMatch = b.paymentMethod.match(/Cash:\s*₹?([\d.]+)/);
        const upiMatch = b.paymentMethod.match(/UPI:\s*₹?([\d.]+)/);
        const creditMatch = b.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
        
        let cashAmt = 0;
        let upiAmt = 0;
        let creditAmt = 0;

        if (cashMatch && cashMatch[1]) cashAmt = parseFloat(cashMatch[1]);
        if (upiMatch && upiMatch[1]) upiAmt = parseFloat(upiMatch[1]);
        if (creditMatch && creditMatch[1]) creditAmt = parseFloat(creditMatch[1]);

        paymentStats['Cash'] = (paymentStats['Cash'] || 0) + cashAmt;
        paymentStats['UPI'] = (paymentStats['UPI'] || 0) + upiAmt;
        paymentStats['Credit'] = (paymentStats['Credit'] || 0) + creditAmt;
        
        totalUnpaid += creditAmt;
        totalSales += (cashAmt + upiAmt);
      } else {
        if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar') {
          totalUnpaid += b.total;
          paymentStats['Credit'] = (paymentStats['Credit'] || 0) + b.total;
        } else if (b.paymentMethod === 'Unpaid') {
          totalUnpaid += b.total;
          paymentStats['Unpaid'] = (paymentStats['Unpaid'] || 0) + b.total;
        } else {
          totalSales += b.total;
          paymentStats[b.paymentMethod] = (paymentStats[b.paymentMethod] || 0) + b.total;
        }
      }

      const dateStr = formatDate(b.timestamp);
      if (!dailyStats[dateStr]) dailyStats[dateStr] = { orders: 0, subtotal: 0, discount: 0, tax: 0, sales: 0 };
      dailyStats[dateStr].orders += 1;
      dailyStats[dateStr].subtotal += b.subtotal;
      dailyStats[dateStr].discount += b.discount || 0;
      dailyStats[dateStr].tax += b.tax;

      let receivedAmount = b.total;
      if (b.paymentMethod.startsWith('Split')) {
         const creditMatch = b.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
         const creditAmt = creditMatch && creditMatch[1] ? parseFloat(creditMatch[1]) : 0;
         receivedAmount = b.total - creditAmt;
      } else if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Unpaid' || b.paymentMethod === 'Udhar') {
         receivedAmount = 0;
      }
      dailyStats[dateStr].sales += receivedAmount;

      const billDate = new Date(b.timestamp);
      const dayName = weekdayNames[billDate.getDay()];
      if (weekdayStats[dayName]) {
        weekdayStats[dayName].sales += receivedAmount;
        weekdayStats[dayName].orders += 1;
      }

      const hour = new Date(b.timestamp).getHours();
      const hourStr = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
      if (!hourlyStats[hourStr]) hourlyStats[hourStr] = { orders: 0, sales: 0 };
      hourlyStats[hourStr].orders += 1;
      hourlyStats[hourStr].sales += b.total;

      const items = b.items || b.data?.items || [];
      for (const item of items) {
        const name = getItemName(item);
        const price = getItemPrice(item);
        const category = item?.menuItem?.category || (item as any)?.category || 'Uncategorized';
        
        if (!itemStats[name]) itemStats[name] = { qty: 0, revenue: 0, category };
        itemStats[name].qty += item.quantity;
        itemStats[name].revenue += (price * item.quantity);
      }
    }
    
    return { 
      totalSales, 
      totalOrders: activeOrdersCount, 
      totalTax, 
      subTotal, 
      totalDiscount, 
      totalUnpaid,
      paymentStats, 
      dailyStats, 
      hourlyStats, 
      itemStats,
      weekdayStats: Object.values(weekdayStats)
    };
  }, [bills, startDate, endDate]);

  const isStatsLoading = !bills;

  const totalSales = backendStats?.totalSales || 0;
  const totalOrders = backendStats?.totalOrders || 0;
  const subTotal = backendStats?.subTotal || 0;
  const totalTax = backendStats?.totalTax || 0;
  const totalDiscount = backendStats?.totalDiscount || 0;
  const totalUnpaid = backendStats?.totalUnpaid || 0;
  const grossSales = totalSales + totalUnpaid + totalDiscount;
  const paymentStats = backendStats?.paymentStats || {};
  const dailyStats = backendStats?.dailyStats || {};
  const hourlyStats = backendStats?.hourlyStats || {};
  const itemStats = backendStats?.itemStats || {};
  const weekdayStats = backendStats?.weekdayStats || [];

  const topItems = Object.entries(itemStats)
    .map(([name, data]: any) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty);

  const filteredBills = bills || [];

  const displayBills = useMemo(() => {
    return [...filteredBills].sort((a, b) => b.timestamp - a.timestamp).slice(0, 300);
  }, [filteredBills]);

  const BILLS_PAGE_SIZE = 100;

  const sortedAllBills = useMemo(() => {
    return [...filteredBills].sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredBills]);

  const pagedBills = useMemo(() => {
    const startIndex = (billsPage - 1) * BILLS_PAGE_SIZE;
    return sortedAllBills.slice(startIndex, startIndex + BILLS_PAGE_SIZE);
  }, [sortedAllBills, billsPage]);

  const totalBillsPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredBills.length / BILLS_PAGE_SIZE));
  }, [filteredBills]);

  const DAILY_PAGE_SIZE = 30;

  const dailyDates = useMemo(() => {
    return Object.keys(dailyStats);
  }, [dailyStats]);

  const pagedDailyDates = useMemo(() => {
    const startIndex = (dailyPage - 1) * DAILY_PAGE_SIZE;
    return dailyDates.slice(startIndex, startIndex + DAILY_PAGE_SIZE);
  }, [dailyDates, dailyPage]);

  const totalDailyPages = useMemo(() => {
    return Math.max(1, Math.ceil(dailyDates.length / DAILY_PAGE_SIZE));
  }, [dailyDates]);

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

  if (!bills || isStatsLoading) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-bold text-gray-500 dark:text-slate-400">Loading Reports...</p>
      </div>
    </div>
  );

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
      if (b.data?.status === 'cancelled') return; // Skip cancelled bills in GST
      const taxable = Math.max(0, b.subtotal - (b.discount || 0));
      const cgst = b.tax / 2;
      const sgst = b.tax / 2;
      csvContent += `"${formatDate(b.timestamp)}","${b.billNumber || b.id}","${b.customerName || '-'}","${b.subtotal.toFixed(2)}","${(b.discount || 0).toFixed(2)}","${taxable.toFixed(2)}","${cgst.toFixed(2)}","${sgst.toFixed(2)}","${b.total.toFixed(2)}"\n`;
    });
    downloadBlob(csvContent, 'GST_Tax_Report');
  };

  const downloadPnLExcel = () => {
    // Sort dates ascending for a chronological P&L report
    const sortedDates = Object.keys(dailyStats).sort((a, b) => a.localeCompare(b));

    // Group expenses by date for inclusion in the P&L
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
      const gross = stats.subtotal;               // Pre-discount subtotal
      const discount = stats.discount;
      const tax = stats.tax;
      const netSales = stats.sales;               // Already net received (credit excluded)
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

  // Payment method icon helper
  const getPaymentIcon = (method: string) => {
    if (method === 'Cash') return <Wallet size={14} />;
    if (method === 'UPI') return <Smartphone size={14} />;
    if (method === 'Unpaid' || method === 'Credit' || method === 'Udhar') return <AlertCircle size={14} />;
    return <CreditCard size={14} />;
  };

  const getPaymentColor = (method: string) => {
    if (method === 'Cash') return { bg: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-600' };
    if (method === 'UPI') return { bg: 'bg-blue-500', light: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-600' };
    if (method === 'Unpaid' || method === 'Credit' || method === 'Udhar') return { bg: 'bg-red-500', light: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-600' };
    if (method === 'Card') return { bg: 'bg-amber-500', light: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' };
    return { bg: 'bg-purple-500', light: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-600' };
  };

  // Max hourly for bar chart scaling
  const maxHourlySales = Math.max(...Object.values(hourlyStats).map((s: any) => s.sales), 1);


  // Avg bill
  const avgBill = totalOrders > 0 ? (totalSales + totalUnpaid) / totalOrders : 0;

  // Total payment for percentage
  const totalPaymentAmount = Object.values(paymentStats).reduce((a: number, b: any) => a + b, 0) as number;

  const tabs = [
    { id: 'summary', label: 'Overview', icon: <BarChart3 size={15} /> },
    { id: 'closing', label: 'Closing Report', icon: <Receipt size={15} /> },
    { id: 'day_wise', label: 'Day Performance', icon: <CalendarDays size={15} /> },
    { id: 'expenses', label: 'Expenses', icon: <Wallet size={15} /> },
    { id: 'daily', label: 'Daily', icon: <CalendarDays size={15} /> },
    { id: 'hourly', label: 'Hourly', icon: <Clock size={15} /> },
    { id: 'items', label: 'Items', icon: <Layers size={15} /> },
    { id: 'bills', label: 'Bills', icon: <Receipt size={15} /> },
  ];

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">

      {/* ── HEADER BAR ── */}
      <div className="shrink-0 flex flex-col gap-3">

        {/* Row 1: Title + Downloads */}
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 dark:text-slate-100 tracking-tight">Reports & Analytics</h1>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 -mt-0.5">{startDate === endDate ? formatDateStr(startDate) : `${formatDateStr(startDate)} — ${formatDateStr(endDate)}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={downloadGSTExcel} 
              disabled={isExportDisabled}
              className="px-3 py-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold text-xs min-h-[40px] flex items-center gap-1.5 transition-all border border-transparent hover:border-emerald-200 disabled:opacity-50 disabled:pointer-events-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-400" 
              title="Download GST Report"
            >
              <Download size={13} /> GST
            </button>
            <button 
              onClick={downloadPnLExcel} 
              disabled={isExportDisabled}
              className="px-3 py-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold text-xs min-h-[40px] flex items-center gap-1.5 transition-all border border-transparent hover:border-emerald-200 disabled:opacity-50 disabled:pointer-events-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-400" 
              title="Download P&L Report"
            >
              <Download size={13} /> P&L
            </button>
            <button 
              onClick={downloadCSV} 
              disabled={isExportDisabled}
              className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs min-h-[40px] flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-200 disabled:opacity-50 disabled:pointer-events-none dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              <Download size={13} /> CSV
            </button>
            <button 
              onClick={downloadPDF} 
              disabled={isExportDisabled}
              className="px-3 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs min-h-[40px] flex items-center gap-1.5 transition-all shadow-sm shadow-purple-200 disabled:opacity-50 disabled:pointer-events-none dark:from-purple-700 dark:to-indigo-700"
            >
              <FileText size={13} /> PDF
            </button>
          </div>
        </div>

        {/* Row 2: Quick Filters + Date Pickers */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Quick filters */}
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 bg-gray-100/80 dark:bg-slate-900/30 p-1 rounded-xl w-fit">
              {quickFilters.map(f => (
                <button
                  key={f.id}
                  onClick={() => handleDateFilterChange(f.id)}
                  className={`shrink-0 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${dateFilter === f.id ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date pickers */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm w-fit shrink-0">
            <Calendar size={14} className="text-purple-400" />
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => { setStartDate(e.target.value); setDateFilter('custom'); }}
              title="Start Date"
              placeholder="YYYY-MM-DD"
              aria-label="Start Date"
              className="bg-transparent font-bold text-gray-700 dark:text-slate-200 focus:outline-none text-xs w-[110px]" 
            />
            <span className="text-gray-300 dark:text-slate-600 text-xs font-bold">→</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => { setEndDate(e.target.value); setDateFilter('custom'); }}
              title="End Date"
              placeholder="YYYY-MM-DD"
              aria-label="End Date"
              className="bg-transparent font-bold text-gray-700 dark:text-slate-200 focus:outline-none text-xs w-[110px]" 
            />
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

        {/* ═══ TAB: DAILY CLOSING REPORT ═══ */}
        {activeTab === 'closing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
            
            {/* Settle Summary Block */}
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
                  <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase truncate block" title="Net Sales (Received Cash/UPI/Card)">Net Sales (Received Cash/UPI/Card)</span>
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

              {/* Payment Methods Table */}
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

            {/* Expenses Snapshot Tally */}
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

        {/* ═══ TAB: EXPENSE TRACKER ═══ */}
        {activeTab === 'expenses' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
            
            {/* List block */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden min-h-[50vh] lg:min-h-0">
              <div className="flex justify-between items-center border-b border-gray-50 dark:border-slate-800/80 pb-4 shrink-0">
                <div>
                  <h2 className="text-lg font-black text-gray-800 dark:text-slate-100">Expense Tracker</h2>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-bold uppercase mt-1">Date: {startDate === endDate ? formatDateStr(startDate) : `${formatDateStr(startDate)} to ${formatDateStr(endDate)}`}</p>
                </div>
                <button 
                  onClick={() => setShowAddExpense(true)}
                  className="py-3 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-purple-100 dark:shadow-none animate-bounce"
                >
                  <Plus size={15} /> Log Expense
                </button>
              </div>

              <div className="flex-1 overflow-auto mt-4 pr-1">
                {rangeExpenses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-gray-300 dark:text-slate-600">
                    <Wallet size={48} className="opacity-20 mb-2 animate-pulse" />
                    <p className="text-sm font-black">No expenses logged for this range.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {rangeExpenses.map((exp) => (
                      <div key={exp.id} className="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-slate-900/40 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-900/80 transition-all border border-gray-100/50 dark:border-slate-800/40">
                        <div className="min-w-0">
                          <div className="font-black text-gray-800 dark:text-slate-200 text-sm truncate">{exp.note || 'Expense'}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1 uppercase bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full inline-block">{exp.paymentMethod}</div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="font-black text-sm text-rose-500">₹{exp.amount.toFixed(2)}</span>
                          <button 
                            onClick={() => setDeletingExpenseId(exp.id)}
                            className="p-2 text-gray-400 hover:text-red-500 rounded-xl transition-all cursor-pointer active:scale-95 hover:bg-red-50 dark:hover:bg-red-950/20"
                            title="Delete Expense"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Expenses Analytics Snapshot */}
            <div className="bg-white dark:bg-slate-900/80 p-6 rounded-3xl border border-gray-100 dark:border-slate-800/80 flex flex-col gap-5">
              <div>
                <h3 className="font-black text-gray-800 dark:text-slate-200 text-base">Expense Analytics</h3>
                <div className="text-2xl font-black text-rose-500 mt-1 flex items-center">
                  <IndianRupee size={22} className="mr-0.5" />
                  {totalExpenses.toFixed(2)}
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 font-bold mt-1 uppercase">Total logged expense</p>
              </div>

              {/* SVG / Pure CSS Visual Payment Method Breakdown */}
              <div className="flex flex-col gap-4.5 mt-2">
                <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wider">Breakdown by Payment Method</h4>
                <div className="flex flex-col gap-3">
                  {expenseMethodsBreakdown.map(([method, amount]) => {
                    const pct = totalExpenses > 0 ? ((amount / totalExpenses) * 100) : 0;
                    return (
                      <div key={method} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center font-bold text-xs text-gray-600 dark:text-slate-400">
                          <span>{method === 'Cash' ? 'Cash Drawer' : method === 'UPI' ? 'UPI Payment' : 'Credit/Debit Card'}</span>
                          <span className="font-black text-gray-800 dark:text-slate-300">₹{amount.toFixed(2)} <span className="text-xs text-gray-400 font-semibold ml-1">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-700" 
                            ref={el => { if (el) el.style.width = `${pct}%`; }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Add Expense Modal Popup */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="glass-modal bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm border border-gray-100 dark:bg-slate-900/95 dark:border-slate-800 flex flex-col gap-4 animate-in scale-in duration-200">
              <h3 className="font-black text-xl text-gray-800 dark:text-slate-100">Log New Expense</h3>
              <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="expense-date-input" className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Expense Date</label>
                  <input 
                    id="expense-date-input"
                    type="date" 
                    value={expDate}
                    onChange={e => setExpDate(e.target.value)}
                    title="Expense Date"
                    className="p-3 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-black text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="expense-amount-input" className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Expense Amount (₹)</label>
                  <input 
                    id="expense-amount-input"
                    type="number" 
                    step="any"
                    value={expAmount}
                    onChange={e => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    title="Expense Amount"
                    className="p-3 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-black text-gray-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="payment-method-select" className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Payment Out Method</label>
                  <select 
                    id="payment-method-select"
                    title="Payment Out Method"
                    value={expMethod}
                    onChange={e => setExpMethod(e.target.value)}
                    className="p-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-black text-gray-800 dark:text-slate-100 focus:outline-none cursor-pointer focus:border-purple-500"
                  >
                    <option value="Cash">💵 Cash Drawer</option>
                    <option value="UPI">📱 UPI Payment</option>
                    <option value="Card">💳 Credit/Debit Card</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="expense-note-input" className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-wide">Note / Description</label>
                  <input 
                    id="expense-note-input"
                    type="text" 
                    value={expNote}
                    onChange={e => setExpNote(e.target.value)}
                    placeholder="e.g. Salaries, UPI, guddu sailri may"
                    title="Note / Description"
                    className="p-3 bg-gray-50/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
                <div className="flex gap-3.5 mt-2.5">
                  <button 
                    type="button"
                    onClick={() => setShowAddExpense(false)}
                    className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-2xl font-bold text-sm text-gray-600 dark:text-slate-300 cursor-pointer active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-purple-100 dark:shadow-none cursor-pointer active:scale-95"
                  >
                    Save Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ TAB: SUMMARY ═══ */}
        {activeTab === 'summary' && (
          <div className="flex flex-col gap-4">

            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Gross Sales */}
              <div className="relative bg-gradient-to-br from-purple-600 via-purple-600 to-indigo-700 rounded-2xl p-4 text-white overflow-hidden shadow-lg shadow-purple-200">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-white/15 rounded-lg backdrop-blur-sm"><TrendingUp size={14} /></div>
                    <span className="text-purple-200 font-bold text-xs uppercase tracking-wider">Gross Sales</span>
                  </div>
                  <div className="text-2xl font-black tracking-tight">₹{grossSales.toFixed(2)}</div>
                  <div className="text-purple-200 text-xs font-semibold mt-1">{totalOrders} bills generated</div>
                </div>
              </div>

              {/* Net Sales */}
              <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white overflow-hidden shadow-lg shadow-emerald-200">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-white/15 rounded-lg backdrop-blur-sm"><IndianRupee size={14} /></div>
                    <span className="text-emerald-100 font-bold text-xs uppercase tracking-wider">Net Received</span>
                  </div>
                  <div className="text-2xl font-black tracking-tight">₹{totalSales.toFixed(2)}</div>
                  <div className="text-emerald-100 text-xs font-semibold mt-1">After credit deduction</div>
                </div>
              </div>

              {/* Avg Bill */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-orange-100 rounded-lg"><ShoppingBag size={14} className="text-orange-600" /></div>
                  <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Avg Bill</span>
                </div>
                <div className="text-2xl font-black text-gray-800 dark:text-slate-100 tracking-tight">₹{avgBill.toFixed(2)}</div>
                <div className="text-gray-400 text-xs font-semibold mt-1">Per order average</div>
              </div>

              {/* Credit (Udhar) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-red-100 rounded-lg"><AlertCircle size={14} className="text-red-600" /></div>
                  <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Credit (Udhar)</span>
                </div>
                <div className={`text-2xl font-black tracking-tight ${(paymentStats['Credit'] || 0) > 0 ? 'text-red-600' : 'text-gray-800 dark:text-slate-100'}`}>₹{(paymentStats['Credit'] || 0).toFixed(2)}</div>
                <div className="text-gray-400 text-xs font-semibold mt-1">Outstanding credit</div>
              </div>

              {/* Unpaid */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-red-100 rounded-lg"><AlertCircle size={14} className="text-red-600" /></div>
                  <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Unpaid Bills</span>
                </div>
                <div className={`text-2xl font-black tracking-tight ${(paymentStats['Unpaid'] || 0) > 0 ? 'text-red-600' : 'text-gray-800 dark:text-slate-100'}`}>₹{(paymentStats['Unpaid'] || 0).toFixed(2)}</div>
                <div className="text-gray-400 text-xs font-semibold mt-1">Outstanding unpaid</div>
              </div>
            </div>

            {/* Revenue Breakdown + Payment Split */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Revenue Breakdown - wider */}
              <div className="lg:col-span-3 bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
                  <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><IndianRupee size={14} className="text-purple-600 dark:text-purple-400" /></div>
                  <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Revenue Breakdown</h2>
                </div>
                <div className="p-5">
                  <div className="flex flex-col gap-0">
                    {/* Gross */}
                    <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="font-bold text-gray-700 dark:text-slate-300 text-sm">Gross Sales (Total Billed)</span>
                      </div>
                      <span className="font-black text-lg text-gray-900 dark:text-slate-100">₹{grossSales.toFixed(2)}</span>
                    </div>
                    {/* Discount */}
                    <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-rose-400" />
                        <span className="font-semibold text-gray-500 dark:text-slate-400 text-sm">Discount Applied</span>
                      </div>
                      <span className="font-bold text-rose-500 text-sm">– ₹{totalDiscount.toFixed(2)}</span>
                    </div>
                    {/* Tax */}
                    <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="font-semibold text-gray-500 dark:text-slate-400 text-sm">Tax (GST) Included</span>
                      </div>
                      <span className="font-bold text-amber-600 text-sm">₹{totalTax.toFixed(2)}</span>
                    </div>
                    {/* Credit */}
                    {(paymentStats['Credit'] || 0) > 0 && (
                      <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="font-semibold text-red-600 text-sm">Credit (Udhar)</span>
                        </div>
                        <span className="font-bold text-red-600 text-sm">– ₹{(paymentStats['Credit'] || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {/* Unpaid */}
                    {(paymentStats['Unpaid'] || 0) > 0 && (
                      <div className="flex items-center justify-between py-3 border-b border-dashed border-gray-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className="font-semibold text-orange-600 text-sm">Unpaid Bills</span>
                        </div>
                        <span className="font-bold text-orange-600 text-sm">– ₹{(paymentStats['Unpaid'] || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {/* Net */}
                    <div className="flex items-center justify-between py-3 mt-1 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 -mx-5 px-5 rounded-b-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="font-black text-emerald-800 dark:text-emerald-400 text-sm">Net Sales (Received)</span>
                      </div>
                      <span className="font-black text-xl text-emerald-700 dark:text-emerald-300">₹{totalSales.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Split */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><PieChart size={14} className="text-blue-600 dark:text-blue-400" /></div>
                  <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Payment Split</h2>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  {Object.entries(paymentStats).length === 0 ? (
                    <div className="text-center text-gray-400 font-semibold py-8 text-sm">No payments recorded</div>
                  ) : (
                    Object.entries(paymentStats)
                      .sort(([,a]: any, [,b]: any) => b - a)
                      .map(([method, amount]: any) => {
                        const pct = totalPaymentAmount > 0 ? ((amount / totalPaymentAmount) * 100) : 0;
                        const colors = getPaymentColor(method);
                        return (
                          <div key={method}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`p-1 rounded-md border ${colors.light}`}>{getPaymentIcon(method)}</span>
                                <span className="font-bold text-gray-700 dark:text-slate-300 text-sm">{method}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-black text-gray-800 dark:text-slate-200 text-sm">₹{amount.toFixed(2)}</span>
                                <span className="text-gray-400 dark:text-slate-500 text-xs font-semibold ml-1.5">({pct.toFixed(0)}%)</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${colors.bg} transition-all duration-700`} ref={el => { if (el) el.style.width = `${pct}%`; }} />
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
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
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">Aggregated over {startDate === endDate ? formatDateStr(startDate) : `${formatDateStr(startDate)} to ${formatDateStr(endDate)}`}</span>
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
                          {/* Day Details */}
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

                          {/* Progress Bar Container */}
                          <div className="flex-1 flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-100 dark:bg-slate-800 h-6 rounded-lg overflow-hidden relative">
                                <div 
                                  className={`h-full bg-gradient-to-r ${isLowest ? 'from-emerald-400 to-teal-400' : isHighest ? 'from-rose-500 to-orange-500' : 'from-purple-500 to-indigo-500'} rounded-lg flex items-center justify-end pr-2.5 transition-all duration-700`}
                                  ref={el => { if (el) el.style.width = `${Math.max(salesPct, 12)}%`; }}
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

                          {/* Weekly Totals */}
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

        {/* ═══ TAB: DAILY ═══ */}
        {activeTab === 'daily' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><CalendarDays size={14} className="text-blue-600 dark:text-blue-400" /></div>
                <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Daily Sales Breakdown</h2>
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{dailyDates.length} day(s)</span>
            </div>
            {totalDailyPages > 1 && (
              <div className="mx-5 my-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-amber-900/30">
                ℹ️ Showing page {dailyPage} of {totalDailyPages} ({((dailyPage - 1) * DAILY_PAGE_SIZE) + 1}–{Math.min(dailyPage * DAILY_PAGE_SIZE, dailyDates.length)} of {dailyDates.length} days)
              </div>
            )}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr className="text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                    <th className="py-3 px-5">Bill No</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Discount</th>
                    <th className="py-3 px-5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDailyDates.map((date) => {
                    const stats = dailyStats[date];
                    const dateBills = billsByDate[date] || [];
                    return (
                      <React.Fragment key={date}>
                        <tr className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-y border-purple-100/50 dark:border-purple-900/30">
                          <td colSpan={4} className="py-2.5 px-5">
                            <span className="font-black text-purple-800 dark:text-purple-300 text-xs">📅 {date}</span>
                            <span className="text-purple-500 dark:text-purple-400 text-xs font-semibold ml-3">{stats.orders} orders</span>
                          </td>
                          <td className="py-2.5 px-4 text-right text-purple-400 dark:text-purple-300 font-bold text-xs">
                            {stats.discount > 0 && `–₹${stats.discount.toFixed(0)}`}
                          </td>
                          <td className="py-2.5 px-5 text-right font-black text-purple-700 dark:text-purple-300 text-xs">₹{stats.sales.toFixed(2)}</td>
                        </tr>
                        {dateBills.map(bill => (
                          <tr key={bill.id} className="border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-5 pl-8 text-xs font-bold text-gray-400 dark:text-slate-500">#{bill.billNumber || String(bill.id).slice(-6)}</td>
                            <td className="py-2.5 px-4 text-xs font-medium text-gray-500 dark:text-slate-400">{formatTime(bill.timestamp)}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-600 dark:text-slate-300 font-semibold truncate max-w-[150px]" title={bill.customerName || ''}>{bill.customerName || '—'}</td>
                            <td className="py-2.5 px-4">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-md border truncate max-w-[150px] inline-block align-middle ${getPaymentColor(bill.paymentMethod.startsWith('Split') ? 'Card' : bill.paymentMethod).light}`} title={bill.paymentMethod}>
                                {bill.paymentMethod}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-rose-400 text-xs">
                              {(bill.discount || 0) > 0 ? `–₹${(bill.discount || 0).toFixed(2)}` : ''}
                            </td>
                            <td className="py-2.5 px-5 text-right font-bold text-gray-800 dark:text-slate-200 text-xs">₹{bill.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {pagedDailyDates.length === 0 && (
                    <tr><td colSpan={6} className="p-12 text-center text-gray-400 font-semibold">No sales data for selected dates.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalDailyPages > 1 && (
              <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/30 shrink-0">
                <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                  Showing {((dailyPage - 1) * DAILY_PAGE_SIZE) + 1} to {Math.min(dailyPage * DAILY_PAGE_SIZE, dailyDates.length)} of {dailyDates.length} days
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={dailyPage === 1}
                    onClick={() => setDailyPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    ◀ Previous
                  </button>
                  <button
                    disabled={dailyPage === totalDailyPages}
                    onClick={() => setDailyPage(prev => Math.min(totalDailyPages, prev + 1))}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: HOURLY ═══ */}
        {activeTab === 'hourly' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg"><Clock size={14} className="text-orange-600 dark:text-orange-400" /></div>
                <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Hourly Performance</h2>
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{Object.keys(hourlyStats).length} active hour(s)</span>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {Object.keys(hourlyStats).length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 font-semibold">No hourly data available.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.entries(hourlyStats)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([hour, stats]: any) => {
                      const salesPct = (stats.sales / maxHourlySales) * 100;
                      return (
                        <div key={hour} className="flex items-center gap-4 group hover:bg-gray-50 dark:hover:bg-slate-800/40 rounded-xl px-3 py-2 transition-all">
                          <div className="w-28 shrink-0">
                            <div className="text-xs font-black text-gray-600 dark:text-slate-300">{hour.split(' - ')[0]}</div>
                            <div className="text-xs font-semibold text-gray-400 dark:text-slate-500">to {hour.split(' - ')[1]}</div>
                          </div>
                          <div className="flex-1 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 dark:bg-slate-800 h-5 rounded-lg overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-lg transition-all duration-700 flex items-center justify-end pr-2" 
                                  ref={el => { if (el) el.style.width = `${Math.max(salesPct, 8)}%`; }}
                                >
                                  {salesPct > 25 && <span className="text-xs font-black text-white">₹{stats.sales.toFixed(0)}</span>}
                                </div>
                              </div>
                              {salesPct <= 25 && <span className="text-xs font-bold text-gray-500 dark:text-slate-400 w-16 text-right">₹{stats.sales.toFixed(0)}</span>}
                            </div>
                          </div>
                          <div className="w-20 text-right shrink-0">
                            <span className="bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-md text-xs font-bold">{stats.orders} orders</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: ITEMS ═══ */}
        {activeTab === 'items' && (
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
        )}

        {/* ═══ TAB: BILLS ═══ */}
        {activeTab === 'bills' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Receipt size={14} className="text-purple-600 dark:text-purple-400" /></div>
                <h2 className="text-sm font-black text-gray-800 dark:text-slate-200">Bill Ledger</h2>
              </div>
              <span className="px-3 py-1 bg-purple-50 border border-purple-200 dark:border-purple-800 dark:bg-purple-950/20 rounded-lg text-xs font-bold text-purple-700 dark:text-purple-400">
                {totalOrders} total bills
              </span>
            </div>
            {totalBillsPages > 1 && (
              <div className="mx-5 my-2 text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-900/30">
                ℹ️ Showing page {billsPage} of {totalBillsPages} ({((billsPage - 1) * BILLS_PAGE_SIZE) + 1}–{Math.min(billsPage * BILLS_PAGE_SIZE, filteredBills.length)} of {filteredBills.length} bills)
              </div>
            )}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr className="text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                    <th className="py-3 px-5">Bill No</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Discount</th>
                    <th className="py-3 px-5 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBills.map((bill) => {
                    const isCancelled = bill.data?.status === 'cancelled';
                    return (
                      <tr key={bill.id} className={`border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors ${bill.paymentMethod === 'Unpaid' ? 'bg-red-50/30 dark:bg-red-950/10' : ''} ${isCancelled ? 'opacity-60 bg-red-50/10 dark:bg-red-950/5' : ''}`}>
                        <td className="py-3 px-5 font-black text-gray-700 dark:text-slate-400 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}>
                              #{bill.billNumber || String(bill.id).slice(-6)}
                            </span>
                            {isCancelled && (
                              <span className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0">
                                Cancelled
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className={`font-bold text-gray-600 dark:text-slate-300 ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}`}>{formatDate(bill.timestamp)}</div>
                          <div className="text-gray-400 dark:text-slate-500 font-semibold">{formatTime(bill.timestamp)}</div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className={`font-bold text-gray-700 dark:text-slate-200 truncate max-w-[150px] ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}`} title={bill.customerName || ''}>{bill.customerName || '—'}</div>
                          {bill.customerPhone && <div className="text-gray-400 dark:text-slate-500 font-medium">{bill.customerPhone}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md border truncate max-w-[150px] inline-block align-middle ${isCancelled ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700 line-through' : getPaymentColor(bill.paymentMethod.startsWith('Split') ? 'Card' : bill.paymentMethod).light}`} title={bill.paymentMethod}>
                            {bill.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-rose-400 text-xs">
                          {(bill.discount || 0) > 0 && !isCancelled ? `–₹${(bill.discount || 0).toFixed(2)}` : ''}
                          {isCancelled && '—'}
                        </td>
                        <td className={`py-3 px-5 text-right font-black text-xs ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-200'}`}>
                          ₹{bill.total.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isCancelled ? (
                            <div className="flex flex-col items-center gap-0.5 justify-center">
                              <span className="text-[9px] font-bold text-red-400 uppercase tracking-tighter">Reason:</span>
                              <span className="text-[10px] font-medium text-red-500 dark:text-red-400 max-w-[110px] truncate" title={bill.data?.cancelReason}>
                                {bill.data?.cancelReason || '-'}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setCancelBillId(bill.id);
                                setCancelBillNum(bill.billNumber ? `#${bill.billNumber}` : `#${bill.id.slice(-6)}`);
                                setCancelReason('');
                                setCancelModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold text-[10px] flex items-center gap-1 transition-all border border-red-100 dark:border-red-900/20 active:scale-95 mx-auto cursor-pointer"
                            >
                              <Ban size={10} /> Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {pagedBills.length === 0 && (
                    <tr><td colSpan={7} className="p-12 text-center text-gray-400 font-semibold">No bills found in this date range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalBillsPages > 1 && (
              <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/30 shrink-0">
                <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                  Showing {((billsPage - 1) * BILLS_PAGE_SIZE) + 1} to {Math.min(billsPage * BILLS_PAGE_SIZE, filteredBills.length)} of {filteredBills.length} bills
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={billsPage === 1}
                    onClick={() => setBillsPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    ◀ Previous
                  </button>
                  <button
                    disabled={billsPage === totalBillsPages}
                    onClick={() => setBillsPage(prev => Math.min(totalBillsPages, prev + 1))}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Expense Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deletingExpenseId !== null}
        title="Delete Expense"
        message="⚠️ Are you sure you want to delete this expense? This action cannot be undone."
        onConfirm={async () => {
          if (deletingExpenseId) {
            await handleDeleteExpense(deletingExpenseId);
            setDeletingExpenseId(null);
          }
        }}
        onCancel={() => setDeletingExpenseId(null)}
      />

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
