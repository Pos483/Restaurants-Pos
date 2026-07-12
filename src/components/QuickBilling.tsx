import { useState, useEffect, useRef } from 'react';
import { DBMenuItem, db, getNextKotNumber, deductStockForBill, recordCustomerCredit, normalizePhone, getNextBillNumber, upsertPosCustomer } from '../db';
import { useLiveQuery } from '../db';
import { Plus, Minus, Printer, Save, UserPlus, Tag, Star, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ThermalPrinter } from '../printer';
import CustomerModal from './CustomerModal';
import DiscountModal from './DiscountModal';
import CustomItemModal from './CustomItemModal';
import ConfirmModal from './ConfirmModal';
import { useApp } from '../contexts/AppContext';
import { useToast } from './Toast';

export default function QuickBilling() {
  const { cart, setCart, categoryLayout } = useApp();
  const { showToast } = useToast();
  const categories = useLiveQuery(() => db.categories.toArray(), [], 'categories');
  const menuItems = useLiveQuery(() => db.menuItems.toArray(), [], 'menu_items');
  const stockItems = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items');
  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);
  
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [showMobileCart, setShowMobileCart] = useState<boolean>(false);

  useEffect(() => {
    if (cart.length === 0) {
      setShowMobileCart(false);
    }
  }, [cart.length]);

  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [orderType, setOrderType] = useState<string>('Takeaway');
  const [variantModalItem, setVariantModalItem] = useState<DBMenuItem | null>(null);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountType, setDiscountType] = useState<'amount'|'percentage'>('amount');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [showCustomer, setShowCustomer] = useState<boolean>(false);

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
  const [showDiscount, setShowDiscount] = useState<boolean>(false);
  const [showCustomItem, setShowCustomItem] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const isPrintingRef = useRef(false);
  const [showKdsConfirm, setShowKdsConfirm] = useState<boolean>(false);
  const [pendingKdsData, setPendingKdsData] = useState<{ newItemsToPrint: any[], kotNum: string } | null>(null);

  const isSettleInProgress = useRef(false);
  const isSettleInProgressRef = useRef(false);
  const categoryContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (categories && categories.length > 0 && !activeCategory) {
      setActiveCategory('Favorites'); // Default to Favorites or first category
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    const el = categoryContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const isSidebar = categoryLayout === 'sidebar';
      if (isSidebar && window.innerWidth >= 640) return; // Keep vertical scrolling on desktop sidebar
      
      if (e.deltaY === 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [categories, categoryLayout]);

  const toggleFavorite = async (item: DBMenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.menuItems.update(item.id, { isFavorite: !item.isFavorite });
  };

  const isOutOfStock = (item: any) => {
    if (!item.stockItemId) return false;
    const stockItem = stockItems?.find(s => s.id === item.stockItemId);
    if (!stockItem) return false;
    const qtyPerUnit = item.stockQtyPerUnit || 1;
    
    // M-8 Fix: Aggregate all items in cart that share the same stock item (e.g. variants)
    const totalQtyNeededInCart = cart
      .filter(c => c.menuItem.stockItemId === item.stockItemId)
      .reduce((sum, c) => sum + (c.quantity * (c.menuItem.stockQtyPerUnit || 1)), 0);
      
    const totalQtyNeeded = totalQtyNeededInCart + (1 * qtyPerUnit);
    return stockItem.quantity < totalQtyNeeded;
  };

  const isBaseOutOfStock = (item: any) => {
    if (!item.stockItemId) return false;
    const stockItem = stockItems?.find(s => s.id === item.stockItemId);
    if (!stockItem) return false;
    return stockItem.quantity < (item.stockQtyPerUnit || 1);
  };

  const isMenuItemFullyOutOfStock = (item: any) => {
    if (item.variants && item.variants.length > 0) {
      return item.variants.every((v: any) => {
        const stockId = v.stockItemId !== undefined && v.stockItemId !== '' ? v.stockItemId : item.stockItemId;
        if (!stockId) return false;
        const stockItem = stockItems?.find(s => s.id === stockId);
        if (!stockItem) return false;
        const qtyPerUnit = v.stockQtyPerUnit !== undefined && v.stockQtyPerUnit !== null ? Number(v.stockQtyPerUnit) : (item.stockQtyPerUnit || 1);
        return stockItem.quantity < qtyPerUnit;
      });
    }
    return isBaseOutOfStock(item);
  };

  const handleAddItem = (menuItem: any) => {
    if (isOutOfStock(menuItem)) {
      showToast(`${menuItem.name} out of stock hai!`, 'error');
      return;
    }
    const existing = cart.find(item => item.menuItem.id === menuItem.id);
    if (existing) {
      setCart(cart.map(item => item.menuItem.id === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { menuItem, quantity: 1 }]);
    }
  };

  const handleAddCustomItem = (name: string, price: number, quantity: number) => {
    const customItem = {
      id: `custom-${Date.now()}`,
      name: name,
      price: price,
      category: 'Custom'
    };
    setCart([...cart, { menuItem: customItem, quantity }]);
    setShowCustomItem(false);
  };

  const handleRemoveItem = (menuItemId: string) => {
    const existing = cart.find(item => item.menuItem.id === menuItemId);
    if (!existing) return;
    if (existing.quantity === 1) {
      setCart(cart.filter(item => item.menuItem.id !== menuItemId));
    } else {
      setCart(cart.map(item => item.menuItem.id === menuItemId ? { ...item, quantity: item.quantity - 1 } : item));
    }
  };

  const handleDeleteItem = (menuItemId: string) => {
    setCart(cart.filter(item => item.menuItem.id !== menuItemId));
  };

  const handleSaveToKdsOnly = async () => {
    if (!pendingKdsData) return;
    const { newItemsToPrint, kotNum } = pendingKdsData;
    try {
      const isCloudPrintSendingEnabled = localStorage.getItem('enableCloudPrintSending') !== 'false';
      await db.kdsOrders.add({
        id: Date.now().toString() + (isCloudPrintSendingEnabled ? '' : '-nocp'),
        tableOrType: `${orderType} (Quick)`,
        items: [...newItemsToPrint],
        timestamp: Date.now(),
        status: 'pending',
        kotNumber: kotNum
      });

      // Update local cart to track printed quantities
      setCart(cart.map(o => ({
        ...o,
        printedQuantity: o.quantity
      })));
      showToast('Saved to Digital KDS');
    } catch (err) {
      console.error(err);
      showToast('Failed to save to KDS', 'error');
    } finally {
      setShowKdsConfirm(false);
      setPendingKdsData(null);
    }
  };

  const handlePrintKOT = async () => {
    if (isPrintingRef.current) return;

    // Pre-check item quantity limit
    for (const item of cart) {
      const qty = item.quantity || 0;
      if (qty > 10000) {
        const name = item.menuItem?.name || item.name || 'Item';
        showToast(`${name} quantity ${qty} exceeds the allowed limit`, 'error');
        return;
      }
    }

    isPrintingRef.current = true;
    if (cart.length === 0 || isPrinting) { isPrintingRef.current = false; return; }
    setIsPrinting(true);
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        oscillator.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {}
    
    try {
      // Only print items that haven't been printed yet
      const newItemsToPrint = cart.map(o => ({
        ...o,
        quantity: o.quantity - (o.printedQuantity || 0)
      })).filter(o => o.quantity > 0);

      if (newItemsToPrint.length === 0) {
        showToast('All items have already been printed. Use KDS to re-print.', 'info');
        setIsPrinting(false);
        return;
      }

      const kotNum = await getNextKotNumber();
      const printSuccess = await ThermalPrinter.printKOT(orderType, newItemsToPrint, kotNum);
      
      if (printSuccess) {
        showToast(`KOT #${kotNum} Sent to Kitchen`);
        
        const isCloudPrintSendingEnabled = localStorage.getItem('enableCloudPrintSending') !== 'false';
        await db.kdsOrders.add({
          id: Date.now().toString() + (isCloudPrintSendingEnabled ? '' : '-nocp'),
          tableOrType: `${orderType} (Quick)`,
          items: [...newItemsToPrint],
          timestamp: Date.now(),
          status: 'pending',
          kotNumber: kotNum
        });

        // Update local cart to track printed quantities
        setCart(cart.map(o => ({
          ...o,
          printedQuantity: o.quantity
        })));
      } else {
        setPendingKdsData({ newItemsToPrint, kotNum });
        setShowKdsConfirm(true);
      }
    } catch (error) {
      console.error('KOT Print Error:', error);
      showToast('KOT failed to save', 'error');
    } finally {
      isPrintingRef.current = false;
      setIsPrinting(false);
    }
  };

  const handleSettleBill = async (shouldPrint: boolean = true) => {
    if (isSettleInProgressRef.current) return;

    // Pre-check item quantity limit
    for (const item of cart) {
      const qty = item.quantity || 0;
      if (qty > 10000) {
        const name = item.menuItem?.name || item.name || 'Item';
        showToast(`${name} quantity ${qty} exceeds the allowed limit`, 'error');
        return;
      }
    }

    isSettleInProgressRef.current = true;
    if (paymentMethod === 'Credit' && (!customerName.trim() || !customerPhone.trim())) {
      showToast('Customer name and phone number are required for Credit (Udhar) bills!', 'error');
      setShowCustomer(true);
      isSettleInProgressRef.current = false;
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + ((item.menuItem?.price || 0) * (item.quantity || 0)), 0);
    const rawDiscount = Number(discountAmount) || 0;
    const discountVal = discountType === 'percentage' ? (subtotal * (rawDiscount / 100)) : rawDiscount;
    const taxableAmount = Math.max(0, subtotal - discountVal);
    const gstPerc = globalSettings?.gstPercentage ?? 5;
    const tax = taxableAmount * (gstPerc / 100);
    const total = taxableAmount + tax;

    if (isSettleInProgress.current) { isSettleInProgressRef.current = false; return; }
    isSettleInProgress.current = true;
    setIsPrinting(true);
    try {
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
        tableId: 'Quick',
        items: cart,
        subtotal,
        tax,
        total,
        paymentMethod: paymentMethod === 'Credit' ? 'Credit' : paymentMethod,
        timestamp: billTimestamp,
        billNumber: currentSeq,
        discount: discountVal,
        customerName,
        customerPhone,
        data: { orderType }
      });

      await deductStockForBill(billId, cart, currentSeq);

      // Save/update customer in POS customer directory
      if (customerName.trim() && customerPhone.trim()) {
        await upsertPosCustomer(customerName.trim(), customerPhone.trim(), total);
      }

      if (paymentMethod === 'Credit') {
        await recordCustomerCredit(customerName, customerPhone, total, billId, currentSeq);
      }

      if (shouldPrint) {
        try {
          await ThermalPrinter.printReceipt('Quick', cart, subtotal, tax, total, paymentMethod, currentSeq, globalSettings, discountVal, customerName, customerPhone, billTimestamp);
          showToast(`Bill #${currentSeq} Printed Successfully`);
        } catch (printErr) {
          showToast('Bill Saved but Printing Failed', 'error');
        }
      } else {
        showToast(`Bill #${currentSeq} Saved Successfully`);
      }



      setCart([]);
      setDiscountAmount('');
      setCustomerName('');
      setCustomerPhone('');
      setShowCustomer(false);
      setShowDiscount(false);
    } catch (error) {
      console.error('Settle Bill Error:', error);
      showToast('Failed to save bill', 'error');
    } finally {
      isSettleInProgress.current = false;
      isSettleInProgressRef.current = false;
      setIsPrinting(false);
    }
  };

  const handleItemClick = (item: DBMenuItem) => {
    if (isMenuItemFullyOutOfStock(item)) {
      showToast(`${item.name} out of stock hai!`, 'error');
      return;
    }
    if (item.variants && item.variants.length > 0) {
      setVariantModalItem(item);
    } else {
      handleAddItem(item);
    }
  };

  const handleVariantSelect = (variant: any) => {
    if (!variantModalItem) return;
    const variantItem = {
      ...variantModalItem,
      id: `${variantModalItem.id}-${variant.name}`,
      name: `${variantModalItem.name} (${variant.name})`,
      price: variant.price,
      stockItemId: variant.stockItemId !== undefined && variant.stockItemId !== '' ? variant.stockItemId : variantModalItem.stockItemId,
      stockQtyPerUnit: variant.stockQtyPerUnit !== undefined && variant.stockQtyPerUnit !== null ? Number(variant.stockQtyPerUnit) : variantModalItem.stockQtyPerUnit
    };
    handleAddItem(variantItem);
    setVariantModalItem(null);
  };

  if (!categories || !menuItems) return <div className="p-8 font-bold text-gray-500 dark:text-slate-400 flex items-center gap-2"><span className="inline-block w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />Loading Quick Billing...</div>;

  const filteredItems = (activeCategory === 'Favorites'
    ? menuItems.filter((item: any) => item.isFavorite && item.isActive !== false)
    : menuItems.filter((item: any) => item.category === activeCategory && item.isActive !== false)).sort((a: any, b: any) => a.name.localeCompare(b.name));
  
  const sortedCategories = categories.slice().sort((a: any, b: any) => a.name.localeCompare(b.name));
  const subtotal = cart.reduce((sum, item) => sum + ((item.menuItem?.price || 0) * (item.quantity || 0)), 0);
  const rawDiscount = Number(discountAmount) || 0;
  const discountVal = discountType === 'percentage' ? (subtotal * (rawDiscount / 100)) : rawDiscount;
  const taxableAmount = Math.max(0, subtotal - discountVal);
  const gstPercDisplay = globalSettings?.gstPercentage ?? 5;
  const tax = taxableAmount * (gstPercDisplay / 100);
  const total = taxableAmount + tax;

  const isSidebarLayout = categoryLayout === 'sidebar';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full relative overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
      {/* Left: Categories + Menu */}
      <div className={`flex-1 flex flex-col lg:overflow-hidden min-h-[60vh] lg:min-h-0 ${isSidebarLayout ? 'sm:flex-row bg-white dark:bg-[#0f172a] rounded-2xl border border-gray-100 dark:border-slate-800/80 p-3' : 'gap-3'}`}>
        {isSidebarLayout ? (
          /* Sidebar Layout */
          <div 
            ref={categoryContainerRef}
            className="w-full sm:w-32 md:w-40 flex sm:flex-col overflow-x-auto sm:overflow-y-auto p-2 gap-2 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-slate-900 bg-gray-50 dark:bg-slate-900/10 scrollbar-hide shrink-0 rounded-l-2xl scroll-smooth"
          >
            <button
              onClick={() => setActiveCategory('Favorites')}
              className={`w-28 sm:w-full h-10 sm:h-auto px-2 sm:px-4 py-2 sm:py-3.5 min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center sm:justify-start gap-1.5 whitespace-nowrap shrink-0 min-w-0
                ${activeCategory === 'Favorites' 
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-md shadow-yellow-250 dark:from-yellow-600 dark:to-amber-600 dark:shadow-none' 
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 dark:bg-[#1e293b]/45 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800/60'}`}
            >
              <Star size={13} fill={activeCategory === 'Favorites' ? "currentColor" : "none"} className="shrink-0" />
              <span className="truncate">Favorites</span>
            </button>
            {sortedCategories.map((cat: any) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.name)}
                className={`w-28 sm:w-full h-10 sm:h-auto px-2 sm:px-4 py-2 sm:py-3.5 min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center sm:justify-start transition-colors shrink-0 min-w-0
                  ${activeCategory === cat.name 
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-255 dark:from-indigo-600 dark:to-violet-600 dark:shadow-none' 
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 dark:bg-[#1e293b]/45 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800/60'}`}
                title={cat.name}
              >
                <span className="truncate">{cat.name}</span>
              </button>
            ))}
            <div className="hidden sm:block flex-1"></div>
            <button
              onClick={() => setShowCustomItem(true)}
              className="w-28 sm:w-full h-10 sm:h-auto px-2 sm:px-4 py-2 sm:py-3.5 min-h-[44px] rounded-xl text-xs font-bold transition-all duration-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 sm:mt-2 flex items-center justify-center gap-1.5 shrink-0 min-w-0 dark:bg-indigo-950/30 dark:text-indigo-400 dark:hover:bg-indigo-900/40 dark:border-indigo-900/60"
            >
              <Plus size={13} className="shrink-0" />
              <span className="truncate">Custom</span>
            </button>
          </div>
        ) : (
          /* Top Tabs Layout */
          <div className="relative group/cat shrink-0 flex items-center">
            {/* Scroll Left Button */}
            <button 
              type="button"
              onClick={() => {
                categoryContainerRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
              }}
              className="absolute left-0 z-10 p-2 bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800 rounded-full shadow-md text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/cat:opacity-100 transition-opacity duration-200 hidden md:flex items-center justify-center -translate-x-3 w-8 h-8 cursor-pointer hover:scale-105"
              title="Scroll Left"
            >
              <ChevronLeft size={16} />
            </button>

            <div 
              ref={categoryContainerRef}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 pb-0.5 scroll-smooth"
            >
              <button
                onClick={() => setActiveCategory('Favorites')}
                className={`w-28 sm:w-32 h-10 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shrink-0 min-w-0
                  ${activeCategory === 'Favorites' 
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-md shadow-yellow-250 dark:from-yellow-600 dark:to-amber-600 dark:shadow-none' 
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 hover:border-yellow-300 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:border-slate-700 dark:hover:border-yellow-700'}`}
              >
                <Star size={13} fill={activeCategory === 'Favorites' ? "currentColor" : "none"} className="shrink-0" /> 
                <span className="truncate">Favorites</span>
              </button>
              {sortedCategories.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`w-28 sm:w-32 h-10 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center shrink-0 min-w-0
                    ${activeCategory === cat.name 
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-255 dark:from-indigo-600 dark:to-violet-600 dark:shadow-none' 
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 hover:border-indigo-300 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:border-slate-700 dark:hover:border-indigo-700'}`}
                  title={cat.name}
                >
                  <span className="truncate px-1">{cat.name}</span>
                </button>
              ))}
              <button
                onClick={() => setShowCustomItem(true)}
                className="w-28 sm:w-32 h-10 rounded-xl text-xs font-bold transition-all duration-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 dark:bg-indigo-950/30 dark:text-indigo-400 dark:hover:bg-indigo-900/40 dark:border-indigo-800/60 dark:hover:bg-indigo-650 flex items-center justify-center gap-1 shrink-0 min-w-0"
              >
                <Plus size={13} className="shrink-0" />
                <span className="truncate">Custom</span>
              </button>
            </div>

            {/* Scroll Right Button */}
            <button 
              type="button"
              onClick={() => {
                categoryContainerRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
              }}
              className="absolute right-0 z-10 p-2 bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800 rounded-full shadow-md text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/cat:opacity-100 transition-opacity duration-200 hidden md:flex items-center justify-center translate-x-3 w-8 h-8 cursor-pointer hover:scale-105"
              title="Scroll Right"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Menu Items Grid */}
        <div className={`flex-1 overflow-auto ${isSidebarLayout ? 'p-2' : 'glass-card-solid rounded-2xl p-3 dark:bg-[#0f172a]/80'} ${cart.length > 0 ? 'pb-40 lg:pb-2' : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredItems.map((item: any) => {
              const outOfStock = isMenuItemFullyOutOfStock(item);
              return (
                <div 
                  key={item.id} 
                  onClick={() => handleItemClick(item)}
                  className={`border rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between min-h-[7.5rem] group relative overflow-hidden ${outOfStock ? 'opacity-50 cursor-not-allowed select-none bg-gray-50/50 border-gray-100 dark:bg-slate-900/20 dark:border-slate-800/40' : 'cursor-pointer bg-white border-gray-100 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-100 hover:-translate-y-0.5 dark:bg-slate-800/40 dark:border-slate-700/50 dark:hover:border-indigo-500/60 dark:hover:bg-slate-800/70 dark:hover:shadow-indigo-950/20'}`}
                >
                  {outOfStock && (
                    <span className="absolute top-2 left-2 bg-red-100 border border-red-200 text-red-600 text-xs font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse z-10 dark:bg-red-950/40 dark:border-red-900/40 dark:text-red-400">
                      Out of Stock
                    </span>
                  )}
                  <button 
                    onClick={(e) => toggleFavorite(item, e)}
                    title="Toggle Favorite"
                    className={`absolute top-2 right-2 p-1.5 rounded-full transition-all duration-200 ${item.isFavorite ? 'text-yellow-500 bg-yellow-50 scale-110 dark:bg-yellow-500/15 dark:text-yellow-400' : 'text-gray-300 hover:text-yellow-500 hover:bg-yellow-50 dark:text-slate-500 dark:hover:text-yellow-400 dark:hover:bg-yellow-500/10'}`}
                  >
                    <Star size={16} fill={item.isFavorite ? "currentColor" : "none"} />
                  </button>
                  <div className={`font-bold text-gray-700 group-hover:text-indigo-600 transition-colors leading-tight text-sm pr-7 dark:text-slate-200 dark:group-hover:text-indigo-400 line-clamp-2 ${outOfStock ? 'pt-5' : ''}`} title={item.name}>{item.name}</div>
                  {item.variants && item.variants.filter((v: any) => v.isActive !== false).length > 0 ? (
                    <div className="flex flex-wrap gap-x-1.5 gap-y-1 mt-1.5">
                      {item.variants.filter((v: any) => v.isActive !== false).map((v: any, idx: number) => (
                        <div key={idx} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full truncate max-w-[100px] dark:text-indigo-400 dark:bg-indigo-950/40" title={v.name}>
                          {v.name}: ₹{v.price.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 font-black text-base mt-1.5 dark:text-slate-400">₹{(item.price ?? 0).toFixed(2)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Cart Overlay Backdrop */}
      {showMobileCart && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setShowMobileCart(false)}
        />
      )}

      {/* Right: Compact Cart Sidebar */}
      <div className={`
        overflow-hidden
        ${showMobileCart 
          ? 'fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-white dark:bg-[#0f172a] z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 lg:relative lg:right-auto lg:top-auto lg:bottom-auto lg:w-96 lg:glass-card-solid lg:rounded-2xl lg:shadow-none lg:z-0 lg:flex lg:min-h-0 lg:dark:bg-[#0f172a]/90 lg:dark:border-slate-700/50' 
          : 'hidden lg:flex w-full lg:w-96 glass-card-solid rounded-2xl flex flex-col shrink-0 min-h-[50vh] lg:min-h-0 dark:bg-[#0f172a]/90 dark:border-slate-700/50'}
      `}>
        {/* Header */}
        <div className="p-3 px-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50 flex justify-between items-center dark:from-slate-800/60 dark:to-indigo-950/30 dark:border-slate-700/50">
          <div className="flex items-center gap-2">
            {showMobileCart && (
              <button
                type="button"
                onClick={() => setShowMobileCart(false)}
                className="lg:hidden p-1.5 -ml-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors mr-1"
                title="Close Cart"
              >
                <X size={18} />
              </button>
            )}
            <h2 className="text-base font-black text-indigo-900 dark:text-indigo-300">Cart</h2>
            {cart.length > 0 && (
              <span className="text-xs font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full dark:bg-indigo-950/50 dark:text-indigo-400">{cart.reduce((s, o) => s + o.quantity, 0)}</span>
            )}
            {cart.length > 0 && (
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="p-1 text-red-500 hover:bg-red-100 rounded-lg transition-all duration-200 dark:text-red-400 dark:hover:bg-red-950/30"
                title="Clear Cart"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            title="Order Type"
            className="px-2.5 py-1.5 rounded-lg text-[13px] font-black bg-white border border-indigo-200 text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer transition-colors dark:bg-slate-800 dark:border-slate-600 dark:text-indigo-300 dark:focus:ring-indigo-900"
          >
            <option value="Takeaway">🛍️ Takeaway</option>
            <option value="Parcel">📦 Parcel</option>
            <option value="Table">🍽️ Table</option>
          </select>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-auto p-2.5">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-slate-600 gap-2">
              <Printer size={36} className="opacity-20" />
              <span className="font-bold text-sm">Empty Cart</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cart.map(order => (
                <div key={order.menuItem.id} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 px-2.5 py-2 rounded-xl group transition-colors duration-150 dark:bg-slate-800/40 dark:hover:bg-slate-800/70 dark:border dark:border-slate-700/30">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-gray-900 text-[14px] truncate dark:text-slate-200">{order.menuItem.name}</div>
                  </div>
                  <div className="flex items-center gap-1 bg-white px-1 py-1 rounded-lg border border-gray-200 shrink-0 shadow-sm dark:bg-slate-800 dark:border-slate-600">
                    <button onClick={() => handleRemoveItem(order.menuItem.id)} className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors dark:text-slate-500 dark:hover:text-red-400" aria-label="Decrease quantity"><Minus size={13} /></button>
                    <span className="font-black text-xs w-5 text-center text-gray-800 dark:text-slate-200">{order.quantity}</span>
                    <button onClick={() => handleAddItem(order.menuItem)} className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-colors dark:text-slate-500 dark:hover:text-emerald-400" aria-label="Increase quantity"><Plus size={13} /></button>
                  </div>
                  <span className="font-black text-indigo-600 text-xs w-20 text-right shrink-0 dark:text-indigo-400">₹{(order.menuItem.price * order.quantity).toFixed(2)}</span>
                  <button onClick={() => handleDeleteItem(order.menuItem.id)} className="text-gray-400 hover:text-red-500 transition-all shrink-0 dark:text-slate-500 dark:hover:text-red-400" title="Delete Item"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Totals + Actions */}
        <div className="p-4 border-t border-gray-100 bg-gradient-to-t from-gray-50 to-white flex flex-col gap-3 dark:from-slate-900/60 dark:to-transparent dark:border-slate-700/50">
          <div className="flex gap-2">
            <button 
              onClick={() => setShowCustomer(true)}
              className={`flex-1 py-2.5 px-3 min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all duration-200 min-w-0 ${customerName ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300 dark:shadow-none' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:border-indigo-700'}`}
            >
              <UserPlus size={13} className="shrink-0" /> <span className="truncate">{customerName ? customerName.split(' ')[0] : 'Customer'}</span>
            </button>
            <button 
              onClick={() => setShowDiscount(true)}
              className={`flex-1 py-2.5 px-3 min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all duration-200 min-w-0 ${Number(discountAmount) > 0 ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300 dark:shadow-none' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:border-indigo-700'}`}
            >
              <Tag size={13} className="shrink-0" /> <span className="truncate">{Number(discountAmount) > 0 ? `${discountAmount}${discountType === 'percentage' ? '%' : '₹'}` : 'Discount'}</span>
            </button>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-5 bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1 shrink-0">
            {['Cash', 'UPI', 'Card', 'Credit', 'Unpaid'].map((pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => setPaymentMethod(pm)}
                className={`py-2.5 min-h-[44px] rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap px-1 text-center flex items-center justify-center ${
                  paymentMethod === pm
                    ? pm === 'Credit' || pm === 'Unpaid'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                {pm === 'Credit' ? 'Credit' : pm === 'Unpaid' ? 'Unpaid' : pm}
              </button>
            ))}
          </div>

          <div className="flex justify-between text-[13px] font-bold text-gray-500 dark:text-slate-400">
            <span>Sub: ₹{subtotal.toFixed(2)}</span>
            {discountVal > 0 && <span className="text-emerald-600 dark:text-emerald-400">-₹{discountVal.toFixed(2)}</span>}
            <span>Tax: ₹{tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center border-t border-gray-200 pt-2.5 dark:border-slate-700/50">
            <span className="font-black text-gray-800 text-base dark:text-slate-300">Total</span>
            <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 text-2xl dark:from-indigo-400 dark:to-violet-400">₹{total.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handlePrintKOT}
              disabled={cart.length === 0 || isPrinting}
              className="px-5 py-3 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-200 text-white rounded-xl font-bold text-xs transition-all duration-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600 dark:disabled:bg-slate-800 dark:disabled:opacity-40"
            >
              KOT
            </button>
            <button 
              onClick={() => handleSettleBill(false)}
              disabled={cart.length === 0 || isPrinting}
              className="px-5 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white rounded-xl font-bold text-xs flex items-center gap-1 transition-all duration-200 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Save size={14} /> Save
            </button>
            <button 
              onClick={() => handleSettleBill(true)}
              disabled={cart.length === 0 || isPrinting}
              className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-200 transition-all duration-200 flex items-center justify-center gap-1.5 disabled:shadow-none dark:shadow-indigo-950/30 dark:disabled:from-slate-700 dark:disabled:to-slate-700"
            >
              <Printer size={15} /> {isPrinting ? '...' : 'Print Bill'}
            </button>
          </div>
        </div>
      </div>

      {/* Variant Selection Modal */}
      {variantModalItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center rounded-2xl p-4 dark:bg-black/60">
          <div className="glass-modal bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900/95 dark:border dark:border-slate-700/60">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-black text-xl text-gray-800 dark:text-slate-100">{variantModalItem.name}</h3>
              <button onClick={() => setVariantModalItem(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors dark:hover:bg-slate-800 dark:text-slate-500" title="Close"><X size={20} /></button>
            </div>
            <div className="text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Select Variant:</div>
            <div className="flex flex-col gap-2.5">
              {variantModalItem.variants?.filter((v: any) => v.isActive !== false).map((v: any, idx: number) => {
                const variantItem = {
                  ...variantModalItem,
                  id: `${variantModalItem.id}-${v.name}`,
                  name: `${variantModalItem.name} (${v.name})`,
                  price: v.price,
                  stockItemId: v.stockItemId !== undefined && v.stockItemId !== '' ? v.stockItemId : variantModalItem.stockItemId,
                  stockQtyPerUnit: v.stockQtyPerUnit !== undefined && v.stockQtyPerUnit !== null ? Number(v.stockQtyPerUnit) : variantModalItem.stockQtyPerUnit
                };
                const outOfStock = isOutOfStock(variantItem);
                return (
                  <button 
                    key={idx}
                    disabled={outOfStock}
                    onClick={() => handleVariantSelect(v)}
                    className={`w-full flex justify-between items-center p-4 rounded-xl border-2 transition-all duration-200 group ${
                      outOfStock
                        ? 'border-red-100 bg-red-50/40 cursor-not-allowed dark:border-red-950/20 dark:bg-red-950/10'
                        : 'border-gray-100 hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md hover:shadow-indigo-100 dark:border-slate-700/60 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/30 dark:hover:shadow-indigo-950/20'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className={`font-bold ${outOfStock ? 'text-red-400 dark:text-red-500 line-through' : 'text-gray-700 group-hover:text-indigo-700 dark:text-slate-300 dark:group-hover:text-indigo-400'}`}>{v.name}</span>
                      {outOfStock && <span className="text-[10px] font-black text-red-500 dark:text-red-400 uppercase tracking-wider">Out of Stock</span>}
                    </div>
                    <span className={`font-black ${outOfStock ? 'text-gray-400 dark:text-slate-600' : 'text-indigo-600 dark:text-indigo-400'}`}>₹{v.price.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customer Info Modal */}
      {showCustomer && (
        <CustomerModal
          initialName={customerName}
          initialPhone={customerPhone}
          onSave={(name, phone) => {
            setCustomerName(name);
            setCustomerPhone(phone);
            setShowCustomer(false);
          }}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {/* Discount Modal */}
      {showDiscount && (
        <DiscountModal
          initialAmount={discountAmount}
          initialType={discountType}
          onSave={(amount, type) => {
            setDiscountAmount(amount);
            setDiscountType(type);
            setShowDiscount(false);
          }}
          onClose={() => setShowDiscount(false)}
        />
      )}

      {/* Custom Item Modal */}
      {showCustomItem && (
        <CustomItemModal
          onSave={handleAddCustomItem}
          onClose={() => setShowCustomItem(false)}
        />
      )}

      {/* Clear Cart Confirm Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Cart"
        message="Are you sure you want to clear the entire cart?"
        onConfirm={() => {
          setCart([]);
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* KOT Printer failure Confirm Modal */}
      <ConfirmModal
        isOpen={showKdsConfirm}
        title="KOT Printer Failed"
        message="KOT Printer was not detected. Would you like to save the order to the digital KDS screen without printing?"
        onConfirm={handleSaveToKdsOnly}
        onCancel={() => {
          setShowKdsConfirm(false);
          setPendingKdsData(null);
        }}
      />

      {/* Floating Bottom Bar for Mobile */}
      {cart.length > 0 && !showMobileCart && (
        <div className="fixed bottom-[64px] left-0 right-0 z-30 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200 dark:border-slate-800/80 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgb(0,0,0,0.5)] flex items-center justify-between lg:hidden px-6 animate-in fade-in duration-200">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-400 dark:text-slate-400">
              {cart.reduce((s, o) => s + o.quantity, 0)} Items
            </span>
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
              ₹{total.toFixed(2)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMobileCart(true)}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black text-sm rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2"
          >
            View Cart 🛒
          </button>
        </div>
      )}
    </div>
  );
}
