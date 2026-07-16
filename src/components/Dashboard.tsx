import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery, db, rescueBillItems, DBBill, recordCustomerCredit, revertCustomerCreditForBill, normalizePhone } from '../db';
import { OrderItem } from '../types';
import { TrendingUp, ShoppingBag, Calculator, Eye, EyeOff, X, Printer, Download, Tag, Award, Clock, UserPlus, CheckCircle2, XCircle } from 'lucide-react';
import { ThermalPrinter } from '../printer';
import DiscountModal from './DiscountModal';
import CustomerModal from './CustomerModal';
import { useToast } from './Toast';

// @ts-ignore
import html2pdf from 'html2pdf.js';
// @ts-ignore
import QRCode from 'qrcode';
import { escapeHtml } from '../utils/escapeHtml';

if (typeof window !== 'undefined') {
  (window as any).html2pdf = html2pdf;
}

// Helper to safely extract item name & price from different data shapes
const getItemName = (item: OrderItem): string => {
  return item?.menuItem?.name || item?.name || 'Unknown Item';
};
const getItemPrice = (item: OrderItem): number => {
  return item?.menuItem?.price ?? item?.price ?? 0;
};

// Helper to extract credit amount from payment method string
const getCreditAmountFromMethod = (method: string, totalAmount: number): number => {
  if (method === 'Credit' || method === 'Udhar') return totalAmount;
  if (method.startsWith('Split')) {
     const creditMatch = method.match(/Credit:\s*₹?([\d.]+)/);
     if (creditMatch && creditMatch[1]) {
        return parseFloat(creditMatch[1]);
     }
  }
  return 0;
};



export default function Dashboard() {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD local format

  const bills = useLiveQuery(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const selStart = new Date(selectedDate);
    selStart.setHours(0, 0, 0, 0);
    const selEnd = new Date(selectedDate);
    selEnd.setHours(23, 59, 59, 999);

    const startOfDay = Math.min(todayStart.getTime(), selStart.getTime());
    const endOfDay = Math.max(todayEnd.getTime(), selEnd.getTime());

    return await db.bills.where('timestamp').between(startOfDay, endOfDay, true, true).toArray();
  }, [selectedDate], 'bills');

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

  const [viewBill, setViewBill] = useState<DBBill | null>(null);
  const [editingPaymentBill, setEditingPaymentBill] = useState<DBBill | null>(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>('Cash');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUpi, setSplitUpi] = useState<string>('');
  const [splitCredit, setSplitCredit] = useState<string>('');
  const [activeInput, setActiveInput] = useState<'cash'|'upi'|'credit'>('cash');
  const [tempCustomerName, setTempCustomerName] = useState<string>('');
  const [tempCustomerPhone, setTempCustomerPhone] = useState<string>('');

  useEffect(() => {
    const autofill = async () => {
      const clean = normalizePhone(tempCustomerPhone);
      if (clean.length === 10) {
        const match = await db.customers.where('phone').equals(clean).first();
        if (match) {
          setTempCustomerName(match.name);
        }
      }
    };
    autofill();
  }, [tempCustomerPhone]);

  const [whatsappCooldowns, setWhatsappCooldowns] = useState<Record<string, number>>({});
  const [whatsappStatusPopup, setWhatsappStatusPopup] = useState<{
    show: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const activeKeys = Object.keys(whatsappCooldowns).filter(id => whatsappCooldowns[id] > 0);
    if (activeKeys.length === 0) return;

    const interval = setInterval(() => {
      setWhatsappCooldowns(prev => {
        const updated = { ...prev };
        let changed = false;
        for (const id of Object.keys(updated)) {
          if (updated[id] > 1) {
            updated[id] -= 1;
            changed = true;
          } else {
            delete updated[id];
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [whatsappCooldowns]);



  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('All');
  const [discountingBill, setDiscountingBill] = useState<DBBill | null>(null);
  const [customerBill, setCustomerBill] = useState<DBBill | null>(null);


  const [showSales, setShowSales] = useState(false);
  const [showAvgBill, setShowAvgBill] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (showSales) {
      timeout = setTimeout(() => {
        setShowSales(false);
      }, 60000); // 1 minute
    }
    return () => clearTimeout(timeout);
  }, [showSales]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (showAvgBill) {
      timeout = setTimeout(() => {
        setShowAvgBill(false);
      }, 60000); // 1 minute
    }
    return () => clearTimeout(timeout);
  }, [showAvgBill]);

  const backendStats = useMemo(() => {
    if (!bills) return { totalSales: 0, totalOrders: 0, itemStats: {}, hourlyStats: {} };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    
    const todaysBills = bills.filter(b => b.timestamp >= today.getTime() && b.timestamp <= endOfToday.getTime());
    
    let totalSales = 0; // Gross / Total Billed
    let totalUnpaid = 0;
    let totalCredit = 0;
    let totalUnpaidOnly = 0;
    let totalDiscount = 0;
    let totalOrders = 0;
    const itemStats: Record<string, { qty: number }> = {};
    const hourlyStats: Record<string, { orders: number }> = {};
    
    for (const b of todaysBills) {
      if (b.data?.status === 'cancelled') continue;
      totalOrders++;
      totalSales += b.total;
      totalDiscount += b.discount || 0;
      if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar') {
        totalCredit += b.total;
        totalUnpaid += b.total;
      } else if (b.paymentMethod === 'Unpaid') {
        totalUnpaidOnly += b.total;
        totalUnpaid += b.total;
      } else if (b.paymentMethod.startsWith('Split')) {
        const creditMatch = b.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
        if (creditMatch && creditMatch[1]) {
           const amt = parseFloat(creditMatch[1]);
           totalCredit += amt;
           totalUnpaid += amt;
        }
      }
      
      const hour = new Date(b.timestamp).getHours();
      const hourStr = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
      
      if (!hourlyStats[hourStr]) hourlyStats[hourStr] = { orders: 0 };
      hourlyStats[hourStr].orders += 1;
      
      const items = rescueBillItems(b);
      for (const item of items) {
        const name = getItemName(item);
        if (!itemStats[name]) itemStats[name] = { qty: 0 };
        itemStats[name].qty += item.quantity;
      }
    }
    
    return { totalSales, totalUnpaid, totalCredit, totalUnpaidOnly, totalDiscount, totalOrders, itemStats, hourlyStats };
  }, [bills]);

  if (!bills) {
    return (
      <div className="p-12 flex flex-col items-center justify-center h-full text-center max-w-md mx-auto animate-in fade-in duration-300">
        <div className="w-12 h-12 border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin mb-4"></div>
        <h3 className="font-black text-lg text-gray-800 dark:text-slate-100 transition-colors">Loading Dashboard Data...</h3>
        <p className="text-gray-400 dark:text-slate-500 text-xs font-bold mt-1 transition-colors">Establishing secure cloud database connection</p>
      </div>
    );
  }

  const todayDiscount = backendStats?.totalDiscount || 0;
  const todaySales = (backendStats?.totalSales || 0) + todayDiscount;
  const todayUnpaid = backendStats?.totalUnpaid || 0;
  const todayCredit = backendStats?.totalCredit || 0;
  const todayUnpaidOnly = backendStats?.totalUnpaidOnly || 0;
  const todayNet = todaySales - todayUnpaid - todayDiscount;
  const todayOrders = backendStats?.totalOrders || 0;
  const averageBill = todayOrders > 0 ? (((backendStats?.totalSales || 0) / todayOrders)) : 0;

  const itemStats = backendStats?.itemStats || {};
  let topItem = '-';
  let maxQty = 0;
  for (const [name, data] of Object.entries(itemStats) as [string, any][]) {
    if (data.qty > maxQty) {
      maxQty = data.qty;
      topItem = name;
    }
  }

  const hourlyStats = backendStats?.hourlyStats || {};
  let peakHour = '-';
  let maxOrders = 0;
  for (const [hour, data] of Object.entries(hourlyStats) as [string, any][]) {
    if (data.orders > maxOrders) {
      maxOrders = data.orders;
      peakHour = hour.split(' - ')[0]; // get "14:00" from "14:00 - 15:00"
    }
  }

  // Filter bills list by selectedDate
  const selectedDateStart = new Date(selectedDate);
  selectedDateStart.setHours(0, 0, 0, 0);
  const selectedDateEnd = new Date(selectedDate);
  selectedDateEnd.setHours(23, 59, 59, 999);

  const filteredBills = (bills || [])
    .filter(b => {
      const dateMatch = b.timestamp >= selectedDateStart.getTime() && b.timestamp <= selectedDateEnd.getTime();
      const paymentMatch = selectedPaymentMethod === 'All' || 
                          (selectedPaymentMethod === 'Split' ? b.paymentMethod.startsWith('Split') : 
                           selectedPaymentMethod === 'Credit' ? (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar') :
                           selectedPaymentMethod === 'Unpaid' ? (b.paymentMethod === 'Unpaid') :
                           b.paymentMethod === selectedPaymentMethod);
      return dateMatch && paymentMatch;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const displayBills = filteredBills.slice(0, 300);





  const handleReprint = async (bill: DBBill) => {
    try {
      await ThermalPrinter.printReceipt(
        bill.tableId, 
        rescueBillItems(bill), 
        bill.subtotal, 
        bill.tax, 
        bill.total, 
        bill.paymentMethod, 
        bill.billNumber || 0, 
        globalSettings,
        bill.discount,
        bill.customerName,
        bill.customerPhone,
        bill.timestamp
      );
    } catch (err: any) {
      console.error("Reprint failed:", err);
      showToast(`Reprint Failed: ${err.message || err}`, 'error');
    }
  };

  const handleUpdatePayment = async () => {
    if (!editingPaymentBill) return;
    
    let finalMethod = newPaymentMethod;
    if (newPaymentMethod === 'Split') {
       const c = Number(splitCash) || 0;
       const u = Number(splitUpi) || 0;
       const cr = Number(splitCredit) || 0;
       const diff = (c + u + cr) - editingPaymentBill.total;
       if (Math.abs(diff) >= 0.01) {
          showToast(`Split amounts (₹${(c + u + cr).toFixed(2)}) must equal the total bill amount (₹${editingPaymentBill.total.toFixed(2)})!`, 'error');
          return;
       }
       const parts = [];
       if (c > 0) parts.push(`Cash: ₹${c.toFixed(2)}`);
       if (u > 0) parts.push(`UPI: ₹${u.toFixed(2)}`);
       if (cr > 0) parts.push(`Credit: ₹${cr.toFixed(2)}`);
       finalMethod = `Split (${parts.join(', ')})`;
    }

    const requiresCustomerInfo = finalMethod === 'Credit' || (finalMethod.startsWith('Split') && (Number(splitCredit) || 0) > 0);
    const name = tempCustomerName.trim();
    const phone = tempCustomerPhone.trim();

    if (requiresCustomerInfo && (!name || !phone)) {
       showToast('Customer name and phone number are required for Credit transactions! ⚠️', 'error');
       return;
    }

    const oldCreditAmount = getCreditAmountFromMethod(editingPaymentBill.paymentMethod, editingPaymentBill.total);
    const newCreditAmount = getCreditAmountFromMethod(finalMethod, editingPaymentBill.total);

    try {
      await db.bills.update(editingPaymentBill.id, { 
        paymentMethod: finalMethod,
        customerName: name || editingPaymentBill.customerName,
        customerPhone: phone || editingPaymentBill.customerPhone
      });

      // ── Khata Book Sync ────────────────────────────────────────────────────
      if (oldCreditAmount !== newCreditAmount) {
         if (oldCreditAmount > 0) {
            const oldPhone = editingPaymentBill.customerPhone || phone;
            if (oldPhone) {
                 const formattedBillNum = editingPaymentBill.billNumber 
                    ? `#${editingPaymentBill.billNumber.toString().padStart(6, '0')}` 
                    : `#${editingPaymentBill.id.slice(-6)}`;
                 const customNote = finalMethod.startsWith('Split') 
                    ? `Payment received via Split for Bill ${formattedBillNum}`
                    : `Payment received via ${finalMethod} for Bill ${formattedBillNum}`;
                await revertCustomerCreditForBill(
                   editingPaymentBill.id,
                   oldPhone,
                   oldCreditAmount,
                   editingPaymentBill.billNumber,
                   customNote
                );
            }
         }
         if (newCreditAmount > 0) {
            if (phone) {
               await recordCustomerCredit(name || 'Unknown Customer', phone, newCreditAmount, editingPaymentBill.id, editingPaymentBill.billNumber);
               showToast('Bill updated and Khata Book credit entry synced! ✅');
            } else {
               showToast('Bill updated but Khata Book could not be synced due to missing phone number.', 'info');
            }
         } else {
            showToast('Payment method updated successfully! ✅');
         }
      } else if (newCreditAmount > 0 && (editingPaymentBill.customerPhone !== phone || editingPaymentBill.customerName !== name)) {
         // Customer changed
         const oldPhone = editingPaymentBill.customerPhone;
         if (oldPhone) {
            await revertCustomerCreditForBill(
               editingPaymentBill.id,
               oldPhone,
               oldCreditAmount,
               editingPaymentBill.billNumber,
               'Customer details updated'
            );
         }
         if (phone) {
            await recordCustomerCredit(name || 'Unknown Customer', phone, newCreditAmount, editingPaymentBill.id, editingPaymentBill.billNumber);
            showToast('Customer details and Khata Book sync updated! ✅');
         }
      } else {
        showToast('Payment method updated successfully! ✅');
      }
    } catch (err: any) {
      showToast(`Update failed: ${err.message}`, 'error');
    }

    setEditingPaymentBill(null);
  };

  const handleSaveBillDiscount = async (amount: string, type: 'amount'|'percentage') => {
    if (!discountingBill) return;
    
    const rawDiscount = Number(amount) || 0;
    const discountVal = type === 'percentage' ? (discountingBill.subtotal * (rawDiscount / 100)) : rawDiscount;
    const taxableAmount = Math.max(0, discountingBill.subtotal - discountVal);
    const gstPerc = globalSettings?.gstPercentage ?? 5;
    const tax = taxableAmount * (gstPerc / 100);
    const finalTotal = taxableAmount + tax;
    
    let newPaymentMethod = discountingBill.paymentMethod;
    if (newPaymentMethod.startsWith('Split') && finalTotal !== discountingBill.total) {
       newPaymentMethod = 'Credit';
       showToast('Notice: The total changed, so the split payment was reset to Credit. Please update payment manually.', 'info');
    }

    // M-2 Fix: Only update changed fields to avoid overwriting concurrent changes
    const partialUpdate = {
       discount: discountVal,
       tax: tax,
       total: finalTotal,
       paymentMethod: newPaymentMethod
    };

    await db.bills.update(discountingBill.id, partialUpdate);
    
    if (viewBill?.id === discountingBill.id) {
       const freshBill = await db.bills.get(discountingBill.id);
       if (freshBill) setViewBill(freshBill);
    }
    setDiscountingBill(null);
  };

  const handleSaveCustomerInfo = async (name: string, phone: string) => {
    if (!customerBill) return;
    
    // Partial update to prevent overwriting other fields
    const partialUpdate = { 
       customerName: name.trim() || undefined, 
       customerPhone: phone.trim() || undefined 
    };
    await db.bills.update(customerBill.id, partialUpdate);
    
    if (viewBill?.id === customerBill.id) {
       const freshBill = await db.bills.get(customerBill.id);
       if (freshBill) setViewBill(freshBill);
    }
    setCustomerBill(null);
  };

  const handleDownloadBillPDF = async (bill: DBBill) => {
    if (!(window as any).html2pdf) {
      showToast("PDF library is loading. Please try again in a few seconds.", "info");
      return;
    }

    const isCancelled = bill.data?.status === 'cancelled';

    // Generate UPI QR code locally as a Data URL if UPI ID is present
    let qrCodeDataUrl = '';
    if (globalSettings?.upiId && !isCancelled) {
      try {
        const upiLink = `upi://pay?pa=${globalSettings?.upiId}&pn=${encodeURIComponent(globalSettings?.restaurantName || 'Restaurant')}&am=${bill.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(bill.billNumber?.toString() || bill.id)}`;
        qrCodeDataUrl = await QRCode.toDataURL(upiLink, { margin: 1, width: 150 });
      } catch (err) {
        console.error("Failed to generate QR code:", err);
      }
    }

    const billHtml = `
      <div style="font-family: 'Courier New', Courier, monospace; width: 70mm; padding: 5mm; color: #000; background: white; margin: 0 auto; border: 1px solid #eee;">
         <div style="text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 4px; text-transform: uppercase;">
            ${escapeHtml(globalSettings?.restaurantName) || 'Restaurant POS'}
         </div>
         <div style="text-align: center; font-size: 10px; line-height: 1.2; margin-bottom: 10px;">
            ${globalSettings?.address ? `${escapeHtml(globalSettings?.address)}<br>` : ''}
            ${globalSettings?.phone ? `Ph: ${escapeHtml(globalSettings?.phone)}<br>` : ''}
            ${globalSettings?.email ? `Email: ${escapeHtml(globalSettings?.email)}<br>` : ''}
            ${globalSettings?.gstNumber ? `GSTIN: ${escapeHtml(globalSettings?.gstNumber)}<br>` : ''}
            ${globalSettings?.fssaiNumber ? `FSSAI: ${escapeHtml(globalSettings?.fssaiNumber)}` : ''}
         </div>
         
         <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
         
         ${isCancelled ? `
         <div style="text-align: center; font-weight: bold; font-size: 16px; margin: 5px 0; color: #dc2626;">
            *** CANCELLED ***
         </div>
         <div style="text-align: center; font-size: 9px; color: #dc2626; margin-bottom: 5px;">
            Reason: ${escapeHtml(bill.data?.cancelReason || 'Unknown')}
         </div>
         <div style="border-top: 1px dashed #dc2626; margin: 5px 0;"></div>
         ` : ''}
         
         <div style="font-size: 10px; margin-bottom: 5px; line-height: 1.4;">
            <b>Bill No: ${bill.billNumber ? bill.billNumber.toString().padStart(6, '0') : escapeHtml(bill.id.slice(-6))}</b><br>
            Date: ${new Date(bill.timestamp).toLocaleString()}<br>
            Table: ${escapeHtml(String(bill.tableId))}<br>
            ${bill.customerName ? `Customer: ${escapeHtml(bill.customerName)}<br>` : ''}
            ${bill.customerPhone ? `Phone: ${escapeHtml(bill.customerPhone)}` : ''}
         </div>
         
         <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
         
         <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 10px 0;">
            <thead>
               <tr style="border-bottom: 1px dashed #000;">
                  <th style="text-align: left; padding-bottom: 4px;">Item</th>
                  <th style="text-align: center; padding-bottom: 4px;">Qty</th>
                  <th style="text-align: right; padding-bottom: 4px;">Price</th>
               </tr>
            </thead>
            <tbody>
               ${rescueBillItems(bill).map(item => `
                  <tr style="${isCancelled ? 'text-decoration: line-through; color: #888;' : ''}">
                     <td style="padding: 4px 0;">${escapeHtml(getItemName(item))}</td>
                     <td style="text-align: center; padding: 4px 0;">${item.quantity}</td>
                     <td style="text-align: right; padding: 4px 0;">${(getItemPrice(item) * item.quantity).toFixed(2)}</td>
                  </tr>
               `).join('')}
            </tbody>
         </table>
         
         <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
         
         <div style="font-size: 10px; text-align: right; line-height: 1.5; ${isCancelled ? 'color: #888;' : ''}">
            Subtotal: Rs ${bill.subtotal.toFixed(2)}<br>
            ${(bill.discount && bill.discount > 0) ? `Discount: -Rs ${bill.discount.toFixed(2)}<br>` : ''}
            GST (${globalSettings?.gstPercentage || 5}%): Rs ${bill.tax.toFixed(2)}
         </div>
         
         <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
         
         <div style="font-size: 16px; font-weight: bold; text-align: center; margin: 8px 0; ${isCancelled ? 'text-decoration: line-through; color: #888;' : ''}">
            TOTAL: Rs ${bill.total.toFixed(2)}
         </div>
         
         <div style="text-align: center; font-size: 10px; margin-bottom: 8px; ${isCancelled ? 'color: #888;' : ''}">
            Payment: ${escapeHtml(bill.paymentMethod)}
         </div>
         
         <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
         
         ${qrCodeDataUrl ? `
          <div style="text-align: center; margin-top: 10px;">
            <img src="${qrCodeDataUrl}" style="width: 100px; height: 100px; margin: 0 auto; display: block;" />
            <div style="font-size: 10px; margin-top: 4px;"><b>Scan to Pay via UPI</b></div>
            <div style="font-size: 9px;">UPI: ${escapeHtml(globalSettings?.upiId)}</div>
          </div>
          <div style="border-top: 1px dashed #000; margin: 5px 0; margin-top: 10px;"></div>
          ` : ''}

          ${(globalSettings?.printThankYou !== false) ? `
          <div style="text-align: center; font-size: 11px; font-weight: bold; margin-top: 8px; padding: 4px; border: 1px dashed #888; border-radius: 4px; white-space: pre-line;">
             *** ${escapeHtml(globalSettings?.thankYouMessage) || 'Thank You! Visit Again.'} ***
          </div>
          ` : ''}
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = billHtml;
    
    const opt = {
      margin:       2,
      filename:     `bill_${bill.billNumber || bill.id}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 3, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: [80, 200], orientation: 'portrait' }
    };
    (window as any).html2pdf().set(opt).from(element).save();
  };

  const handleNumpad = (val: string) => {
    if (val === 'backspace') {
      if (activeInput === 'cash') setSplitCash(prev => prev.slice(0, -1));
      else if (activeInput === 'upi') setSplitUpi(prev => prev.slice(0, -1));
      else if (activeInput === 'credit') setSplitCredit(prev => prev.slice(0, -1));
    } else {
      if (activeInput === 'cash') setSplitCash(prev => prev + val);
      else if (activeInput === 'upi') setSplitUpi(prev => prev + val);
      else if (activeInput === 'credit') setSplitCredit(prev => prev + val);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden transition-colors">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 shrink-0">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-800 rounded-3xl p-4 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-950/40 flex items-center gap-4 hover-lift transition-all min-w-0">
          <div className="bg-white/20 p-3 rounded-2xl hidden xl:block shrink-0">
            <TrendingUp size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-indigo-100 font-bold text-xs uppercase tracking-wider mb-1 truncate">Today's Sales</div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-2xl font-black truncate flex-1">
                {showSales ? `₹${todaySales.toFixed(2)}` : '****'}
              </div>
              <button 
                onClick={() => setShowSales(!showSales)} 
                className="p-1 hover:bg-white/20 rounded-lg transition-colors shrink-0"
                title={showSales ? "Hide Sales" : "Show Sales"}
              >
                {showSales ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {showSales && (todayDiscount > 0 || todayCredit > 0 || todayUnpaidOnly > 0) && (
              <div className="text-xs text-white/80 mt-1 font-medium bg-white/10 px-2 py-0.5 rounded inline-block backdrop-blur-sm max-w-full truncate">
                Net: ₹{todayNet.toFixed(2)}
                {todayDiscount > 0 && ` | Disc: ₹${todayDiscount.toFixed(2)}`}
                {todayCredit > 0 && ` | Credit: ₹${todayCredit.toFixed(2)}`}
                {todayUnpaidOnly > 0 && ` | Unpaid: ₹${todayUnpaidOnly.toFixed(2)}`}
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-400 to-orange-500 dark:from-orange-500 dark:to-orange-700 rounded-3xl p-4 text-white shadow-lg shadow-orange-200 dark:shadow-orange-950/40 flex items-center gap-4 hover-lift transition-all min-w-0">
          <div className="bg-white/20 p-3 rounded-2xl hidden xl:block shrink-0">
            <ShoppingBag size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-orange-100 font-bold text-xs uppercase tracking-wider mb-1 truncate">Orders Today</div>
            <div className="text-2xl font-black truncate">{todayOrders}</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-teal-400 to-teal-500 dark:from-teal-500 dark:to-teal-700 rounded-3xl p-4 text-white shadow-lg shadow-teal-200 dark:shadow-teal-950/40 flex items-center gap-4 hover-lift transition-all min-w-0">
          <div className="bg-white/20 p-3 rounded-2xl hidden xl:block shrink-0">
            <Calculator size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-teal-100 font-bold text-xs uppercase tracking-wider mb-1 truncate">Avg Bill</div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-2xl font-black truncate flex-1">
                {showAvgBill ? `₹${averageBill.toFixed(2)}` : '****'}
              </div>
              <button 
                onClick={() => setShowAvgBill(!showAvgBill)} 
                className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer shrink-0"
                title={showAvgBill ? "Hide Avg Bill" : "Show Avg Bill"}
              >
                {showAvgBill ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-pink-400 to-pink-500 dark:from-pink-500 dark:to-pink-700 rounded-3xl p-4 text-white shadow-lg shadow-pink-200 dark:shadow-pink-950/40 flex items-center gap-4 hover-lift transition-all min-w-0">
          <div className="bg-white/20 p-3 rounded-2xl hidden xl:block shrink-0">
            <Award size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-pink-100 font-bold text-xs uppercase tracking-wider mb-1">Top Item</div>
            <div className="text-xl font-black truncate max-w-full" title={topItem}>{topItem}</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-700 rounded-3xl p-4 text-white shadow-lg shadow-blue-200 dark:shadow-blue-950/40 flex items-center gap-4 hover-lift transition-all min-w-0">
          <div className="bg-white/20 p-3 rounded-2xl hidden xl:block shrink-0">
            <Clock size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-blue-100 font-bold text-xs uppercase tracking-wider mb-1 truncate">Peak Hour</div>
            <div className="text-xl font-black truncate">{peakHour}</div>
          </div>
        </div>
      </div>

      {/* Bills List */}
      <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800/80 flex flex-col overflow-hidden transition-colors">
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 transition-colors">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Recent Bills</h2>
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-bold text-gray-500 dark:text-slate-400 shadow-sm">
              {filteredBills.length} Bills
            </span>
            {filteredBills.length > 300 && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 animate-pulse bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-900/30">
                ⚠️ Showing latest 300 bills
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label htmlFor="dashboardPaymentFilter" className="text-sm font-bold text-gray-500 dark:text-slate-400 whitespace-nowrap cursor-pointer">Payment:</label>
              <select 
                id="dashboardPaymentFilter"
                name="dashboardPaymentFilter"
                value={selectedPaymentMethod}
                onChange={e => setSelectedPaymentMethod(e.target.value)}
                className="p-3 px-4 border border-gray-200 dark:border-slate-700 rounded-lg font-bold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
              >
                <option value="All">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Split">Split</option>
                <option value="Credit">Credit (Udhar)</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="dashboardDateFilter" className="text-sm font-bold text-gray-500 dark:text-slate-400 whitespace-nowrap cursor-pointer">Date:</label>
              <input 
                id="dashboardDateFilter"
                name="dashboardDateFilter"
                type="date" 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="p-3 px-4 border border-gray-200 dark:border-slate-700 rounded-lg font-bold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="text-gray-400 dark:text-slate-400 font-bold text-xs uppercase tracking-widest sticky top-0 bg-gray-50/90 dark:bg-slate-800/90 backdrop-blur-md z-10 border-b border-gray-200 dark:border-slate-700">
                <th className="p-4 rounded-tl-xl">Bill No</th>
                <th className="p-4">Time</th>
                <th className="p-4">Table / Type</th>
                <th className="p-4">Payment</th>
                <th className="p-4 text-right">Discount</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4 text-center rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody>
               {displayBills.map((bill, idx) => {
                const isCancelled = bill.data?.status === 'cancelled';
                return (
                  <tr 
                    key={bill.id} 
                    className={`border-b border-gray-100/80 dark:border-slate-800/50 transition-colors duration-150 group ${isCancelled ? 'bg-red-50/10 dark:bg-red-950/5 opacity-60' : bill.discount && bill.discount > 0 ? 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/40 dark:hover:bg-red-950/30' : idx % 2 === 0 ? 'bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-slate-800/40' : 'bg-gray-50/50 dark:bg-slate-800/20 hover:bg-gray-100/60 dark:hover:bg-slate-800/50'}`}
                  >
                    <td className="p-4 font-black text-gray-800 dark:text-slate-200">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-gray-800 dark:text-slate-200 ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : ''}`}>
                          {bill.billNumber ? `#${bill.billNumber.toString().padStart(6, '0')}` : '-'}
                        </span>
                        {isCancelled && (
                          <span className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0">
                            Cancelled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`p-4 font-medium text-sm ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-500 dark:text-slate-400'}`}>
                      {new Date(bill.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${isCancelled ? 'bg-gray-100 dark:bg-slate-850 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-800 line-through' : bill.tableId === 'Quick' || String(bill.tableId).startsWith('Quick-') ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400' : 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400'}`}>
                        {String(bill.tableId).startsWith('Quick-') 
                          ? String(bill.tableId).replace('Quick-', '') 
                          : bill.tableId === 'Quick' 
                            ? (bill.data?.orderType || 'Takeaway') 
                            : bill.tableId === 'Online'
                              ? 'Online'
                              : `Table ${bill.tableId}`}
                      </span>
                    </td>
                    <td className="p-4">
                        <button 
                          onClick={() => {
                            setEditingPaymentBill(bill);
                            setTempCustomerName(bill.customerName || '');
                            setTempCustomerPhone(bill.customerPhone || '');
                            if (bill.paymentMethod.startsWith('Split')) {
                              setNewPaymentMethod('Split');
                              const cashMatch = bill.paymentMethod.match(/Cash:\s*₹?([\d.]+)/);
                              const upiMatch = bill.paymentMethod.match(/UPI:\s*₹?([\d.]+)/);
                              const creditMatch = bill.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
                              setSplitCash(cashMatch ? parseFloat(cashMatch[1]).toString() : '');
                              setSplitUpi(upiMatch ? parseFloat(upiMatch[1]).toString() : '');
                              setSplitCredit(creditMatch ? parseFloat(creditMatch[1]).toString() : '');
                            } else {
                              setNewPaymentMethod(bill.paymentMethod === 'Udhar' ? 'Credit' : bill.paymentMethod);
                              setSplitCash('');
                              setSplitUpi('');
                              setSplitCredit('');
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1 transition-all shadow-sm max-w-[150px] sm:max-w-[200px] min-w-0 ${
                            bill.paymentMethod === 'Credit' || bill.paymentMethod === 'Unpaid' || bill.paymentMethod === 'Udhar' ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-950/30' :
                            bill.paymentMethod === 'Cash' ? 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/30 hover:bg-green-100 dark:hover:bg-green-950/30' :
                            bill.paymentMethod === 'UPI' ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/30 hover:bg-green-100 dark:hover:bg-green-950/30' :
                            'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-950/30'
                          }`}
                          title={bill.paymentMethod}
                        >
                          <span className="truncate">{bill.paymentMethod === 'Udhar' ? 'Credit' : bill.paymentMethod}</span> <span className="text-xs ml-1 shrink-0">✎</span>
                        </button>
                    </td>
                    <td className={`p-4 text-right font-bold ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : 'text-red-500 dark:text-red-400'}`}>
                      {bill.discount && bill.discount > 0 && !isCancelled ? `-₹${bill.discount.toFixed(2)}` : '-'}
                    </td>
                    <td className={`p-4 text-right font-black ${isCancelled ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-200'}`}>₹{bill.total.toFixed(2)}</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => setViewBill(bill)} className="p-3 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-xl transition-all hover:scale-110 active:scale-95" title="View Bill">
                        <Eye size={18} />
                      </button>
                      <button onClick={() => handleReprint(bill)} className="p-3 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all hover:scale-110 active:scale-95" title="Reprint">
                        <Printer size={18} />
                      </button>
                      <button onClick={() => handleDownloadBillPDF(bill)} className="p-3 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-xl transition-all hover:scale-110 active:scale-95" title="Download PDF">
                        <Download size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
              {filteredBills.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 dark:text-slate-500 font-medium">
                    No bills generated on {selectedDate}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Bill Modal */}
      {viewBill && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="glass-modal rounded-3xl w-full max-w-md shadow-2xl dark:shadow-black/40 overflow-hidden flex flex-col max-h-full border border-white/20 dark:border-slate-700/50">
            <div className="p-4 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/80 dark:bg-slate-800/60 backdrop-blur-sm">
              <h3 className="font-bold text-lg text-gray-800 dark:text-slate-100">Bill Details</h3>
              <button onClick={() => setViewBill(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors text-gray-500 dark:text-slate-400" title="Close">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-auto">
              {viewBill.data?.status === 'cancelled' && (
                 <div className="mb-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 p-3 rounded-2xl text-center shrink-0">
                   <span className="bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 font-black px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase">Cancelled</span>
                   <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-2">Reason: {viewBill.data?.cancelReason || 'Unknown'}</p>
                 </div>
               )}
              <div className="text-center mb-6">
                <div className="font-black text-xl text-gray-800 dark:text-slate-100">{globalSettings?.restaurantName || 'Restaurant POS'}</div>
                <div className="text-gray-500 dark:text-slate-400 text-sm mt-1">{new Date(viewBill.timestamp).toLocaleString()}</div>
                <div className="text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                  {String(viewBill.tableId).startsWith('Quick-') 
                    ? String(viewBill.tableId).replace('Quick-', '') 
                    : viewBill.tableId === 'Quick' 
                      ? (viewBill.data?.orderType || 'Takeaway') 
                      : viewBill.tableId === 'Online'
                        ? 'Online'
                        : `Table ${viewBill.tableId}`}
                </div>
                {viewBill.billNumber && <div className="text-gray-800 dark:text-slate-200 font-black mt-2">Bill No: {viewBill.billNumber.toString().padStart(6, '0')}</div>}
                
                {(viewBill.customerName || viewBill.customerPhone) && (
                  <div className="mt-4 bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/40 flex flex-col items-center justify-center mx-auto max-w-[200px]">
                    {viewBill.customerName && <div className="text-sm font-bold text-indigo-900 dark:text-indigo-300 truncate w-full text-center">👤 {viewBill.customerName}</div>}
                    {viewBill.customerPhone && <div className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mt-1 truncate w-full text-center">📞 {viewBill.customerPhone}</div>}
                  </div>
                )}
              </div>
              
              <div className="border-t border-b border-gray-100 dark:border-slate-700/50 py-4 mb-4 flex flex-col gap-2">
                {rescueBillItems(viewBill).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm gap-2 min-w-0">
                    <span className="font-bold text-gray-700 dark:text-slate-200 truncate flex-1">{item.quantity}x {getItemName(item)}</span>
                    <span className="font-medium text-gray-600 dark:text-slate-400 shrink-0">₹{(getItemPrice(item) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1 text-sm font-medium text-gray-500 dark:text-slate-400 mb-4">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{viewBill.subtotal.toFixed(2)}</span></div>
                {viewBill.discount && viewBill.discount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400 font-bold"><span>Discount</span><span>-₹{viewBill.discount.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between"><span>GST</span><span>₹{viewBill.tax.toFixed(2)}</span></div>
              </div>
              
              <div className="flex justify-between items-center border-t border-gray-200 dark:border-slate-700/50 pt-4 text-xl font-black text-gray-800 dark:text-slate-100">
                <span>Total</span>
                <span>₹{viewBill.total.toFixed(2)}</span>
              </div>
              <div className="text-center text-sm font-bold text-gray-400 dark:text-slate-500 mt-2">
                Paid via {viewBill.paymentMethod}
              </div>
            </div>
            
            <div className="px-4 pb-2 bg-gray-50/80 dark:bg-slate-800/40 flex gap-2 justify-center">
               <button 
                  onClick={() => setCustomerBill(viewBill)} 
                  className="flex-1 py-2 border-2 border-indigo-200 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs sm:text-sm transition-all"
               >
                  <UserPlus size={16} />
                  {viewBill.customerName || viewBill.customerPhone ? 'Edit Customer' : 'Add Customer'}
               </button>
               <button 
                  onClick={() => setDiscountingBill(viewBill)} 
                  className="flex-1 py-2 border-2 border-indigo-200 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs sm:text-sm transition-all"
               >
                  <Tag size={16} />
                  {viewBill.discount && viewBill.discount > 0 ? 'Edit Discount' : 'Add Discount'}
               </button>
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50/80 dark:bg-slate-800/40 flex flex-col gap-2">
               <div className="flex gap-2">
                  <button onClick={() => handleDownloadBillPDF(viewBill)} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-200 dark:shadow-none active:scale-95">
                     <Download size={20} />
                     Download PDF
                  </button>
                  <button onClick={() => handleReprint(viewBill)} className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-950/30 active:scale-95">
                     <Printer size={20} />
                     Print Receipt
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Payment Modal */}
      {editingPaymentBill && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="glass-modal rounded-3xl w-full max-w-sm shadow-2xl dark:shadow-black/40 overflow-hidden flex flex-col max-h-[90vh] border border-white/20 dark:border-slate-700/50">
            <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/80 dark:bg-slate-800/60 backdrop-blur-sm">
              <h3 className="font-bold text-lg text-gray-800 dark:text-slate-100">Update Payment</h3>
              <button onClick={() => setEditingPaymentBill(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors text-gray-500 dark:text-slate-400" title="Close">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <div className="text-sm font-bold text-gray-500 dark:text-slate-400 mb-1">Total Bill Amount</div>
                <div className="text-3xl font-black text-gray-800 dark:text-slate-100">₹{editingPaymentBill.total.toFixed(2)}</div>
              </div>
              <div className="flex flex-col gap-3 mb-6">
                <label className="text-sm font-bold text-gray-700 dark:text-slate-300">Select Method:</label>
                <select 
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                  title="Select Payment Method"
                  className="w-full p-3 rounded-xl border-2 border-gray-200 dark:border-slate-600 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 font-bold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 transition-colors"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Credit">Credit (Udhar)</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Split">Split Payment</option>
                </select>
              </div>

              {/* Conditional Customer Info Inputs inside the modal */}
              {(newPaymentMethod === 'Credit' || (newPaymentMethod === 'Split' && (Number(splitCredit) || 0) > 0)) && (
                <div className="mb-4 p-4 border border-orange-200 dark:border-orange-950/30 rounded-2xl bg-orange-50/20 dark:bg-orange-950/10 flex flex-col gap-3">
                  <div className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1">
                    👤 Customer Details Required (Credit)
                  </div>
                  <div>
                    <label htmlFor="editBillCustomerName" className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase cursor-pointer">Customer Name</label>
                    <input 
                      id="editBillCustomerName"
                      name="editBillCustomerName"
                      type="text" 
                      value={tempCustomerName}
                      onChange={(e) => setTempCustomerName(e.target.value)}
                      placeholder="Enter Customer Name"
                      className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="editBillCustomerPhone" className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase cursor-pointer">Mobile Number</label>
                    <input 
                      id="editBillCustomerPhone"
                      name="editBillCustomerPhone"
                      type="text" 
                      value={tempCustomerPhone}
                      onChange={(e) => setTempCustomerPhone(e.target.value)}
                      placeholder="Enter Mobile Number"
                      className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {newPaymentMethod === 'Split' && (
                <div className="mb-6">
                  <div className="flex gap-2.5 mb-4">
                    <div className="flex-1">
                      <label htmlFor="splitCashAmount" className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase cursor-pointer">Cash</label>
                      <input 
                        id="splitCashAmount"
                        name="splitCashAmount"
                        type="number" 
                        value={splitCash}
                        onClick={() => setActiveInput('cash')}
                        onChange={(e) => { setActiveInput('cash'); setSplitCash(e.target.value); }}
                        placeholder="₹0"
                        className={`w-full mt-1 p-2.5 rounded-xl border-2 focus:outline-none font-bold transition-all text-sm ${activeInput === 'cash' ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-gray-800 dark:text-slate-100' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200'}`}
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="splitUpiAmount" className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase cursor-pointer">UPI</label>
                      <input 
                        id="splitUpiAmount"
                        name="splitUpiAmount"
                        type="number" 
                        value={splitUpi}
                        onClick={() => setActiveInput('upi')}
                        onChange={(e) => { setActiveInput('upi'); setSplitUpi(e.target.value); }}
                        placeholder="₹0"
                        className={`w-full mt-1 p-2.5 rounded-xl border-2 focus:outline-none font-bold transition-all text-sm ${activeInput === 'upi' ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-gray-800 dark:text-slate-100' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200'}`}
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="splitCreditAmount" className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase cursor-pointer">Credit</label>
                      <input 
                        id="splitCreditAmount"
                        name="splitCreditAmount"
                        type="number" 
                        value={splitCredit}
                        onClick={() => setActiveInput('credit')}
                        onChange={(e) => { setActiveInput('credit'); setSplitCredit(e.target.value); }}
                        placeholder="₹0"
                        className={`w-full mt-1 p-2.5 rounded-xl border-2 focus:outline-none font-bold transition-all text-sm ${activeInput === 'credit' ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-gray-800 dark:text-slate-100' : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200'}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {['1','2','3','4','5','6','7','8','9','00','0'].map(num => (
                      <button 
                        key={num}
                        onClick={() => handleNumpad(num)}
                        className="p-3 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl font-black text-xl text-gray-800 dark:text-slate-200 transition-colors shadow-sm border border-gray-100 dark:border-slate-700 active:scale-95"
                      >
                        {num}
                      </button>
                    ))}
                    <button 
                      onClick={() => handleNumpad('backspace')}
                      className="p-3 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-500 dark:text-red-400 rounded-xl font-black text-xl flex items-center justify-center transition-colors shadow-sm border border-red-100 dark:border-red-900/30 active:scale-95"
                    >
                      ⌫
                    </button>
                  </div>
                </div>
              )}

              <button 
                onClick={handleUpdatePayment}
                className="w-full py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-indigo-950/30 transition-all active:scale-95"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal for modifying bill discount */}
      {discountingBill && (
        <DiscountModal
          initialAmount={discountingBill.discount ? discountingBill.discount.toString() : ''}
          initialType="amount" // We always set flat amount for existing bills because we don't store percentage type in DB
          onSave={handleSaveBillDiscount}
          onClose={() => setDiscountingBill(null)}
        />
      )}

      {/* Customer Modal for modifying bill customer info */}
      {customerBill && (
        <CustomerModal
          initialName={customerBill.customerName || ''}
          initialPhone={customerBill.customerPhone || ''}
          onSave={handleSaveCustomerInfo}
          onClose={() => setCustomerBill(null)}
        />
      )}

      {/* WhatsApp Status Popup Modal */}
      {whatsappStatusPopup && whatsappStatusPopup.show && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-gray-100 dark:border-slate-800 flex flex-col items-center text-center animate-in scale-in duration-200">
            <div className="mb-4">
              {whatsappStatusPopup.success ? (
                <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-500 dark:text-green-400 rounded-full animate-bounce">
                  <CheckCircle2 size={48} />
                </div>
              ) : (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 rounded-full animate-pulse">
                  <XCircle size={48} />
                </div>
              )}
            </div>
            
            <h4 className="text-xl font-black text-gray-800 dark:text-slate-100 mb-2">
              {whatsappStatusPopup.success ? 'Message Sent!' : 'Delivery Failed'}
            </h4>
            
            <p className="text-sm font-bold text-gray-600 dark:text-slate-400 mb-6 leading-relaxed">
              {whatsappStatusPopup.message}
            </p>
            
            <button
              onClick={() => setWhatsappStatusPopup(null)}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-base shadow-lg shadow-orange-200 dark:shadow-none transition-all active:scale-95"
            >
              OK
            </button>
          </div>
        </div>
      )}




    </div>
  );
}
