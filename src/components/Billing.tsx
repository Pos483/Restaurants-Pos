import { useState, useRef, useEffect } from 'react';
import { useLiveQuery, db, localDb, deductStockForBill, recordCustomerCredit, DBCustomer, normalizePhone, getNextBillNumber } from '../db';
import { Table } from '../types';
import { Printer, Banknote, CreditCard, Smartphone, Clock, UserPlus, Tag, AlertCircle } from 'lucide-react';
import { ThermalPrinter } from '../printer';
import { useToast } from './Toast';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  tables: Table[];
  onSettleBill: (tableId: number, paymentMethod: string) => void;
}

export default function Billing({ tables, onSettleBill }: Props) {
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(occupiedTables.length > 0 ? occupiedTables[0].id : null);
  const [billingMobileTab, setBillingMobileTab] = useState<'receipt' | 'settle'>('receipt');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountType, setDiscountType] = useState<'amount'|'percentage'>('amount');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [showCustomer, setShowCustomer] = useState<boolean>(false);
  const [showDiscount, setShowDiscount] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [activeCustomerField, setActiveCustomerField] = useState<'name' | 'phone'>('name');
  const [customerSuggestions, setCustomerSuggestions] = useState<DBCustomer[]>([]);

  useEffect(() => {
    if (!showCustomer) {
      setCustomerSuggestions([]);
      return;
    }
    const fetchSuggestions = async () => {
      try {
        const query = activeCustomerField === 'name' ? customerName.trim().toLowerCase() : customerPhone.trim();
        if (!query) {
          const list = await localDb.table<DBCustomer>('customers').orderBy('timestamp').reverse().limit(5).toArray();
          setCustomerSuggestions(list);
          return;
        }

        let list: DBCustomer[] = [];
        const customersTable = localDb.table<DBCustomer>('customers');
        if (activeCustomerField === 'name') {
          list = await customersTable
            .filter(c => c.name.toLowerCase().includes(query))
            .limit(5)
            .toArray();
        } else {
          list = await customersTable
            .filter(c => c.phone.includes(query))
            .limit(5)
            .toArray();
        }
        setCustomerSuggestions(list);
      } catch (err) {
        console.error('Error fetching customer suggestions:', err);
      }
    };

    fetchSuggestions();
  }, [customerName, customerPhone, activeCustomerField, showCustomer]);

  useEffect(() => {
    const autofill = async () => {
      const clean = normalizePhone(customerPhone);
      if (clean.length === 10) {
        const match = await db.customers.where('phone').equals(clean).first();
        if (match) {
          setCustomerName(match.name);
        }
      }
    };
    autofill();
  }, [customerPhone]);

  const isSettleInProgress = useRef(false);
  const { showToast } = useToast();


  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

  // H-3 Fix: Reset billing state when switching tables to prevent data leaks
  useEffect(() => {
    setPaymentMethod('Cash');
    setDiscountAmount('');
    setDiscountType('amount');
    setCustomerName('');
    setCustomerPhone('');
    setShowCustomer(false);
    setShowDiscount(false);
    setBillingMobileTab('receipt');
  }, [selectedTableId]);

  if (occupiedTables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-lg font-medium">
        No active orders to bill.
      </div>
    );
  }

  const selectedTable = occupiedTables.find(t => t.id === selectedTableId);
  const subtotal = selectedTable ? selectedTable.orders.reduce((sum, item) => sum + ((item?.menuItem?.price ?? 0) * (item?.quantity ?? 0)), 0) : 0;
  const rawDiscount = Math.max(0, Number(discountAmount) || 0);
  const discountVal = discountType === 'percentage' ? (subtotal * (rawDiscount / 100)) : rawDiscount;
  const taxableAmount = Math.max(0, subtotal - discountVal);
  const gstPerc = globalSettings?.gstPercentage ?? 5;
  const tax = taxableAmount * (gstPerc / 100);
  const total = taxableAmount + tax;

  const handlePrintAndSettle = async () => {
    if (paymentMethod === 'Credit' && (!customerName.trim() || !customerPhone.trim())) {
      showToast('Customer name and phone number are required for Credit (Udhar) bills!', 'error');
      setShowCustomer(true);
      return;
    }

    if (isSettleInProgress.current) return;
    isSettleInProgress.current = true;
    setIsPrinting(true);
    try {
      if (!selectedTable) return;

      // Pre-check item quantity limit
      for (const item of selectedTable.orders) {
        const qty = item.quantity || 0;
        if (qty > 10000) {
          const name = item.menuItem?.name || item.name || 'Item';
          showToast(`${name} quantity ${qty} exceeds the allowed limit`, 'error');
          isSettleInProgress.current = false;
          setIsPrinting(false);
          return;
        }
      }

      // Pre-check credit limit before committing anything
      if (paymentMethod === 'Credit' || paymentMethod === 'Udhar') {
        const creditPhone = normalizePhone(customerPhone);
        const creditName = (customerName || '').trim();
        if (!creditPhone || !creditName) {
          showToast('Customer name and phone number are required for Credit settlement', 'error');
          return;
        }
        const existingCustomers = await db.customers.where('phone').equals(creditPhone).toArray();
        if (existingCustomers.length > 0) {
          const existing = existingCustomers[0];
          const limit = existing.creditLimit !== undefined ? existing.creditLimit : 10000;
          const projectedBalance = (existing.balance || 0) + total;
          if (projectedBalance > limit) {
            showToast(`Credit limit exceeded! Current balance: ₹${existing.balance || 0}, Limit: ₹${limit}`, 'error');
            return;
          }
        } else {
          if (total > 10000) {
            showToast('New customer credit limit cannot exceed ₹10,000', 'error');
            return;
          }
        }
      }
      // Get atomic next bill number sequence
      const currentSeq = await getNextBillNumber();

      const isCloudPrintSendingEnabled = localStorage.getItem('enableCloudPrintSending') !== 'false';
      const billTimestamp = Date.now();
      const billId = billTimestamp.toString() + (isCloudPrintSendingEnabled ? '' : '-nocp');
      await db.bills.add({
        id: billId,
        tableId: selectedTable.id,
        items: selectedTable.orders,
        subtotal,
        tax,
        total,
        paymentMethod: paymentMethod === 'Credit' ? 'Credit' : paymentMethod,
        timestamp: billTimestamp,
        billNumber: currentSeq,
        discount: discountVal,
        customerName,
        customerPhone
      });

      await deductStockForBill(billId, selectedTable.orders, currentSeq);

      if (paymentMethod === 'Credit') {
        await recordCustomerCredit(customerName, customerPhone, total, billId, currentSeq);
      }

      try {
        await ThermalPrinter.printReceipt(selectedTable.id, selectedTable.orders, subtotal, tax, total, paymentMethod, currentSeq, globalSettings, discountVal, customerName, customerPhone, billTimestamp);
      } catch (printErr) {
        console.error("Printing failed, but saving/settling bill:", printErr);
      }



      onSettleBill(selectedTable.id, paymentMethod);
      setSelectedTableId(null);
      setDiscountAmount('');
      setCustomerName('');
      setCustomerPhone('');
      setShowCustomer(false);
      setShowDiscount(false);
    } catch (err) {
      console.error("Settle Bill Error:", err);
      showToast('Settlement failed. Please try again.', 'error');
    } finally {
      isSettleInProgress.current = false;
      setIsPrinting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full overflow-y-auto lg:overflow-hidden text-gray-900 dark:text-slate-100">
      {/* Active Tables List */}
      <div className="w-full lg:w-64 bg-white dark:bg-slate-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 overflow-hidden flex flex-col transition-colors lg:max-h-full shrink-0">
        <div className="p-3.5 lg:p-5 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 font-bold text-gray-855 dark:text-slate-200 text-sm lg:text-lg transition-colors flex items-center justify-between">
          <span>Active Bills</span>
          <span className="text-[10px] font-bold bg-orange-100 text-orange-705 dark:bg-orange-950/40 dark:text-orange-400 px-2 py-0.5 rounded-full lg:hidden">{occupiedTables.length} Active</span>
        </div>
        <div className="flex-1 overflow-x-auto lg:overflow-y-auto p-3 flex lg:flex-col gap-2 scrollbar-none">
          {occupiedTables.map(table => (
            <div 
              key={table.id}
              onClick={() => setSelectedTableId(table.id)}
              className={`p-3 lg:p-4 rounded-xl cursor-pointer transition-all border shrink-0 min-w-[110px] lg:min-w-0 ${selectedTableId === table.id ? 'bg-orange-50 border-orange-200 shadow-sm dark:bg-orange-950/20 dark:border-orange-900/50' : 'bg-white hover:bg-gray-50 border-gray-100 dark:border-slate-800/40 dark:bg-slate-900/40 dark:hover:bg-slate-900 dark:text-slate-300'}`}
            >
              <div className="font-bold text-gray-800 dark:text-slate-200 text-xs lg:text-sm">Table {table.id}</div>
              <div className="text-xs lg:text-sm font-semibold text-orange-600 dark:text-orange-400 mt-0.5 lg:mt-1">₹{table.orders.reduce((sum, item) => sum + ((item?.menuItem?.price ?? 0) * (item?.quantity ?? 0)), 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bill Details */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:overflow-hidden">
        {!selectedTable ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-800/80">
            <div className="text-gray-400 dark:text-slate-500 font-bold text-lg mb-2">Select a bill to view</div>
            <div className="text-gray-400 dark:text-slate-500 text-sm">Click on a table from the left menu to preview and settle the bill.</div>
          </div>
        ) : (
          <>
            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden bg-gray-100 dark:bg-slate-800 p-1 rounded-xl gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setBillingMobileTab('receipt')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all ${
                  billingMobileTab === 'receipt'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400'
                }`}
              >
                🧾 Receipt Preview
              </button>
              <button
                type="button"
                onClick={() => setBillingMobileTab('settle')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  billingMobileTab === 'settle'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400'
                }`}
              >
                💳 Settle & Payment
                <span className="text-[9px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-black">
                  ₹{total.toFixed(0)}
                </span>
              </button>
            </div>

            {/* Receipt View */}
            <div className={`flex-1 bg-white dark:bg-slate-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 overflow-hidden flex flex-col max-w-md mx-auto relative transition-colors ${billingMobileTab === 'receipt' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-6 text-center border-b-2 border-dashed border-gray-200 dark:border-slate-800">
            <h2 className="text-2xl font-black text-gray-800 dark:text-slate-100 uppercase tracking-wider">{globalSettings?.restaurantName || 'Restaurant POS'}</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">{globalSettings?.address || 'Restaurant Address'}</p>
            <p className="text-xs text-gray-400 dark:text-slate-400 mt-2 font-bold bg-gray-100 dark:bg-slate-800 inline-block px-3 py-1 rounded-full">Table {selectedTable.id} Receipt</p>
          </div>
          
          <div className="flex-1 overflow-auto p-6">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-800 text-gray-400 dark:text-slate-500">
                  <th className="w-1/2 text-left font-bold pb-3">Item</th>
                  <th className="w-1/4 text-center font-bold pb-3">Qty</th>
                  <th className="w-1/4 text-right font-bold pb-3">Price</th>
                </tr>
              </thead>
              <tbody>
                {(() => { const safeOrders = (selectedTable?.orders || []).filter(o => o && (o.menuItem || o.name)); return safeOrders.map((order, idx) => (
                  <tr key={order?.menuItem?.id ?? idx} className="border-b border-gray-50 dark:border-slate-800/40 last:border-0">
                    <td className="py-4 text-gray-800 dark:text-slate-200 font-medium truncate" title={order?.menuItem?.name ?? order?.name ?? 'Unknown Item'}>{(order?.menuItem?.name ?? order?.name ?? 'Unknown Item')}</td>
                    <td className="py-4 text-center text-gray-600 dark:text-slate-400 font-bold">{order?.quantity ?? 0}</td>
                    <td className="py-4 text-right text-gray-800 dark:text-slate-200 font-bold">₹{((order?.menuItem?.price ?? order?.price ?? 0) * (order?.quantity ?? 0)).toFixed(2)}</td>
                  </tr>
                )); })()}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-gray-50 dark:bg-slate-800/30 border-t-2 border-dashed border-gray-200 dark:border-slate-800 transition-colors">
            <div className="flex justify-between mb-3 text-gray-500 dark:text-slate-400 font-medium">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {discountVal > 0 && (
              <div className="flex justify-between mb-3 text-green-600 dark:text-green-400 font-bold text-sm">
                <span>Discount</span>
                <span>-₹{discountVal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between mb-4 font-bold text-gray-500 dark:text-slate-400">
              <span>GST ({gstPerc}%)</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-2xl font-black text-gray-800 dark:text-slate-100 pt-4 border-t border-gray-200 dark:border-slate-800">
              <span>Total</span>
              <span className="text-orange-600 dark:text-orange-400">₹{total.toFixed(2)}</span>
            </div>
            {/* UPI QR Code */}
            {globalSettings?.upiEnabled && globalSettings?.upiId && (
              <div className="flex flex-col items-center gap-2 mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-slate-800">
                <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Scan to Pay via UPI</p>
                <div className="p-2 bg-white rounded-2xl shadow-sm">
                  <QRCodeSVG
                    value={`upi://pay?pa=${globalSettings.upiId}&am=${total.toFixed(2)}&cu=INR&tn=Bill Payment`}
                    size={120}
                    level="M"
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">{globalSettings.upiId}</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Actions */}
        <div className={`w-full lg:w-72 flex flex-col gap-4 shrink-0 lg:overflow-y-auto ${billingMobileTab === 'settle' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-white dark:bg-slate-900/80 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 flex flex-col gap-3 transition-colors">
            <div className="flex gap-2">
              <button 
                onClick={() => setShowCustomer(!showCustomer)}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all ${showCustomer ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                <UserPlus size={16} /> Customer
              </button>
              <button 
                onClick={() => setShowDiscount(!showDiscount)}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all ${showDiscount ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                <Tag size={16} /> Discount
              </button>
            </div>

            {showCustomer && (
              <div className="flex flex-col gap-3 p-3 bg-white dark:bg-slate-900 border-2 border-orange-100 dark:border-orange-900/30 rounded-xl shadow-sm animate-in slide-in-from-top-2 duration-200">
                <input 
                  type="text" 
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setActiveCustomerField('name');
                  }}
                  onFocus={() => setActiveCustomerField('name')}
                  className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:outline-none focus:border-orange-500 dark:bg-slate-800 dark:text-slate-100"
                />
                <input 
                  type="text" 
                  placeholder="Phone Number"
                  value={customerPhone}
                  onChange={e => {
                    setCustomerPhone(e.target.value);
                    setActiveCustomerField('phone');
                  }}
                  onFocus={() => setActiveCustomerField('phone')}
                  className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:outline-none focus:border-orange-500 dark:bg-slate-800 dark:text-slate-100"
                />
                
                {/* Suggestions List inline */}
                {customerSuggestions.length > 0 && (
                  <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col bg-gray-50 dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800 max-h-[140px] overflow-y-auto shadow-inner mt-1">
                    <div className="px-2.5 py-1 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest bg-gray-100 dark:bg-slate-900">
                      {customerName || customerPhone ? 'Matching Saved Customers' : 'Recent Customers (Quick Select)'}
                    </div>
                    {customerSuggestions.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomerName(c.name);
                          setCustomerPhone(c.phone);
                          setCustomerSuggestions([]);
                        }}
                        className="px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-slate-800 flex justify-between items-center text-xs font-bold text-gray-700 dark:text-slate-300 transition-colors w-full"
                      >
                        <span>{c.name}</span>
                        <span className="text-gray-400 dark:text-slate-500 font-semibold">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showDiscount && (
              <div className="flex flex-col gap-3 p-3 bg-white dark:bg-slate-900 border-2 border-orange-100 dark:border-orange-900/30 rounded-xl shadow-sm animate-in slide-in-from-top-2 duration-200">
                <div className="flex gap-2">
                  <select 
                    title="Discount Type"
                    value={discountType}
                    onChange={e => {
                      setDiscountType(e.target.value as 'amount'|'percentage');
                      setDiscountAmount('');
                    }}
                    className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-black focus:outline-none focus:border-orange-500 bg-gray-50 dark:bg-slate-800 dark:text-slate-200 cursor-pointer w-2/5"
                  >
                    <option value="amount">Flat (₹)</option>
                    <option value="percentage">Percent (%)</option>
                  </select>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-3 font-bold text-gray-500 dark:text-slate-400">{discountType === 'amount' ? '₹' : '%'}</span>
                    <input 
                      type="number" 
                      placeholder="Value"
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      className="w-full pl-8 p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-black focus:outline-none focus:border-orange-500 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
                {discountType === 'percentage' && (
                  <div className="flex justify-between gap-1 pt-1">
                    {[5, 10, 15, 20, 25].map(perc => (
                      <button 
                        key={perc}
                        onClick={() => setDiscountAmount(perc.toString())}
                        className={`flex-1 py-2.5 px-1.5 rounded-lg text-xs font-bold transition-all border ${discountAmount === perc.toString() ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                      >
                        {perc}%
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900/80 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 transition-colors">
            <h3 className="font-bold text-gray-800 dark:text-slate-200 mb-4 text-lg">Payment Method</h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setPaymentMethod('Cash')}
                className={`flex flex-col items-center justify-center py-5 px-4 rounded-xl border-2 transition-all ${paymentMethod === 'Cash' ? 'border-orange-500 bg-orange-50 text-orange-600 dark:border-orange-600 dark:bg-orange-950/20 dark:text-orange-400' : 'border-gray-100 hover:border-gray-300 text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <Banknote className="mb-2" size={24} />
                <span className="text-sm font-bold">Cash</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('UPI')}
                className={`flex flex-col items-center justify-center py-5 px-4 rounded-xl border-2 transition-all ${paymentMethod === 'UPI' ? 'border-orange-500 bg-orange-50 text-orange-600 dark:border-orange-600 dark:bg-orange-950/20 dark:text-orange-400' : 'border-gray-100 hover:border-gray-300 text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <Smartphone className="mb-2" size={24} />
                <span className="text-sm font-bold">UPI</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('Card')}
                className={`flex flex-col items-center justify-center py-5 px-4 rounded-xl border-2 transition-all ${paymentMethod === 'Card' ? 'border-orange-500 bg-orange-50 text-orange-600 dark:border-orange-600 dark:bg-orange-950/20 dark:text-orange-400' : 'border-gray-100 hover:border-gray-300 text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <CreditCard className="mb-2" size={24} />
                <span className="text-sm font-bold">Card</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('Credit')}
                className={`flex flex-col items-center justify-center py-5 px-4 rounded-xl border-2 transition-all ${paymentMethod === 'Credit' ? 'border-red-500 bg-red-50 text-red-600 dark:border-red-600 dark:bg-red-950/20 dark:text-red-400' : 'border-gray-100 hover:border-gray-300 text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <Clock className="mb-2" size={24} />
                <span className="text-sm font-bold">Credit (Udhar)</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('Unpaid')}
                className={`col-span-2 flex flex-col items-center justify-center py-5 px-4 rounded-xl border-2 transition-all ${paymentMethod === 'Unpaid' ? 'border-red-500 bg-red-50 text-red-600 dark:border-red-600 dark:bg-red-950/20 dark:text-red-400' : 'border-gray-100 hover:border-gray-300 text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <AlertCircle className="mb-2" size={24} />
                <span className="text-sm font-bold">Unpaid</span>
              </button>
            </div>
          </div>

          <button 
            onClick={handlePrintAndSettle}
            disabled={isPrinting || subtotal === 0}
            className={`mt-auto py-5 text-white rounded-2xl font-bold text-xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95 ${isPrinting || subtotal === 0 ? 'bg-gray-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed shadow-none' : 'bg-green-500 hover:bg-green-600 shadow-green-200 dark:shadow-none dark:bg-green-600 dark:hover:bg-green-700'}`}
          >
            <Printer size={28} />
            {isPrinting ? 'Settling...' : 'Settle & Print'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
