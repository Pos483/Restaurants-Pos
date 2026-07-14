import { useState, useEffect, useRef } from 'react';
import { Table, OrderItem, MenuItem } from '../types';
import { DBMenuItem, DBCategory, db, localDb, getNextKotNumber, deductStockForBill, recordCustomerCredit, DBCustomer, normalizePhone, getNextBillNumber, upsertPosCustomer } from '../db';
import { useLiveQuery } from '../db';
import { Plus, Minus, Star, UserPlus, Tag, Printer, ArrowLeft, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ThermalPrinter } from '../printer';
import { useToast } from './Toast';
import { useApp } from '../contexts/AppContext';
import TableGrid from './TableGrid';
import CustomerModal from './CustomerModal';
import DiscountModal from './DiscountModal';
import CustomItemModal from './CustomItemModal';
import ConfirmModal from './ConfirmModal';

interface Props {
  tables: Table[];
  selectedTableId: number | null;
  onSelectTable: (id: number | null) => void;
  onUpdateOrder: (tableId: number, orders: OrderItem[]) => void;
  onPlaceOrder: (tableId: number) => void;
  onSettleBill: (tableId: number, paymentMethod: string) => void;
}

export default function OrderMenu({ tables, selectedTableId, onSelectTable, onUpdateOrder, onPlaceOrder, onSettleBill }: Props) {
  const { showToast } = useToast();
  const { categoryLayout } = useApp();
  const table = selectedTableId ? tables.find(t => t.id === selectedTableId) || null : null;
  const categories = useLiveQuery(() => db.categories.toArray(), [], 'categories');
  const menuItems = useLiveQuery(() => db.menuItems.toArray(), [], 'menu_items');
  const stockItems = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items');
  
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [variantModalItem, setVariantModalItem] = useState<DBMenuItem | null>(null);
  const [showMobileCart, setShowMobileCart] = useState<boolean>(false);

  // Billing states
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountType, setDiscountType] = useState<'amount'|'percentage'>('amount');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [showCustomer, setShowCustomer] = useState<boolean>(false);
  const [showDiscount, setShowDiscount] = useState<boolean>(false);
  const [showCustomItem, setShowCustomItem] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Credit' | 'Unpaid'>('Cash');
  const [creditCustomerPhone, setCreditCustomerPhone] = useState('');
  const [creditCustomerName, setCreditCustomerName] = useState('');
  const [activeCreditCustomerField, setActiveCreditCustomerField] = useState<'name' | 'phone'>('name');
  const [creditCustomerSuggestions, setCreditCustomerSuggestions] = useState<DBCustomer[]>([]);

  useEffect(() => {
    const autofillCredit = async () => {
      const clean = normalizePhone(creditCustomerPhone);
      if (clean.length === 10) {
        const match = await db.customers.where('phone').equals(clean).first();
        if (match) {
          setCreditCustomerName(match.name);
        }
      }
    };
    autofillCredit();
  }, [creditCustomerPhone]);

  useEffect(() => {
    const autofillStandard = async () => {
      const clean = normalizePhone(customerPhone);
      if (clean.length === 10) {
        const match = await db.customers.where('phone').equals(clean).first();
        if (match) {
          setCustomerName(match.name);
        }
      }
    };
    autofillStandard();
  }, [customerPhone]);

  useEffect(() => {
    if (paymentMethod !== 'Credit') {
      setCreditCustomerSuggestions([]);
      return;
    }
    const fetchSuggestions = async () => {
      try {
        const query = activeCreditCustomerField === 'name' ? creditCustomerName.trim().toLowerCase() : creditCustomerPhone.trim();
        if (!query) {
          const list = await localDb.table<DBCustomer>('customers').orderBy('timestamp').reverse().limit(5).toArray();
          setCreditCustomerSuggestions(list);
          return;
        }

        let list: DBCustomer[] = [];
        const customersTable = localDb.table<DBCustomer>('customers');
        if (activeCreditCustomerField === 'name') {
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
        setCreditCustomerSuggestions(list);
      } catch (err) {
        console.error('Error fetching credit customer suggestions:', err);
      }
    };

    fetchSuggestions();
  }, [creditCustomerName, creditCustomerPhone, activeCreditCustomerField, paymentMethod]);
  const [showKdsConfirm, setShowKdsConfirm] = useState<boolean>(false);
  const [pendingKdsData, setPendingKdsData] = useState<{ newItemsToPrint: OrderItem[], kotNum: string } | null>(null);
  const [localOrders, setLocalOrders] = useState<OrderItem[]>([]);

  useEffect(() => {
    if (localOrders.length === 0) {
      setShowMobileCart(false);
    }
  }, [localOrders.length]);

  const lastTableIdRef = useRef<number | null>(null);
  const isPrintingRef = useRef(false);
  const categoryContainerRef = useRef<HTMLDivElement>(null);

  const pendingUpdateRef = useRef<{ tableId: number; orders: OrderItem[] } | null>(null);
  const debouncedUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingUpdate = () => {
    if (debouncedUpdateRef.current) {
      clearTimeout(debouncedUpdateRef.current);
      debouncedUpdateRef.current = null;
    }
    if (pendingUpdateRef.current) {
      onUpdateOrder(pendingUpdateRef.current.tableId, pendingUpdateRef.current.orders);
      pendingUpdateRef.current = null;
    }
  };

  const queueUpdateOrder = (tableId: number, newOrders: OrderItem[]) => {
    pendingUpdateRef.current = { tableId, orders: newOrders };
    if (debouncedUpdateRef.current) {
      clearTimeout(debouncedUpdateRef.current);
    }
    debouncedUpdateRef.current = setTimeout(() => {
      if (pendingUpdateRef.current) {
        onUpdateOrder(pendingUpdateRef.current.tableId, pendingUpdateRef.current.orders);
        pendingUpdateRef.current = null;
      }
    }, 600); // 600ms debounce
  };

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current);
      }
      if (pendingUpdateRef.current) {
        onUpdateOrder(pendingUpdateRef.current.tableId, pendingUpdateRef.current.orders);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedTableId !== lastTableIdRef.current) {
      flushPendingUpdate();
      lastTableIdRef.current = selectedTableId;
      if (table) {
        setLocalOrders(table.orders || []);
      } else {
        setLocalOrders([]);
      }
    } else if (table) {
      if (pendingUpdateRef.current) return;

      // M-3 Fix: Compare JSON of items and quantities instead of fragile length heuristic
      const localStr = JSON.stringify(localOrders.map(o => ({ id: o.menuItem?.id, q: o.quantity })));
      const remoteStr = JSON.stringify((table.orders || []).map(o => ({ id: o.menuItem?.id, q: o.quantity })));
      if (localStr !== remoteStr) {
        setLocalOrders(table.orders);
      }
    }
  }, [selectedTableId, table, localOrders]);

  // Reset all billing parameters and modal controls on table switch
  useEffect(() => {
    setDiscountAmount('');
    setDiscountType('amount');
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('Cash');
    setCreditCustomerName('');
    setCreditCustomerPhone('');
    setShowCustomer(false);
    setShowDiscount(false);
    setShowCustomItem(false);
    setShowClearConfirm(false);
    setShowKdsConfirm(false);
    setVariantModalItem(null);
    setPendingKdsData(null);
    setIsPrinting(false);
    isPrintingRef.current = false;
    setShowMobileCart(false);
  }, [selectedTableId]);

  const isSettleInProgress = useRef(false);

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

  // Set initial category when loaded
  useEffect(() => {
    if (categories && categories.length > 0 && !activeCategory) {
      setActiveCategory('Favorites');
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    const el = categoryContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const isSidebar = categoryLayout !== 'top';
      if (isSidebar && window.innerWidth >= 640) return; // Keep vertical scrolling on desktop sidebar
      if (e.deltaY === 0) return;
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

  const handleAddTable = async () => {
    // Find max table id
    const maxId = tables.reduce((max, t) => Math.max(max, t.id), 0);
    const newId = maxId + 1;
    await db.activeOrders.add({
      id: newId,
      status: 'available',
      orders: []
    });
  };

  // Ensure tables are sorted by ID numerically
  const sortedTables = [...tables].sort((a, b) => a.id - b.id);

  if (!table) {
    return <TableGrid tables={sortedTables} onSelectTable={onSelectTable} onAddTable={handleAddTable} />;
  }

  const subtotal = localOrders.reduce((sum, item) => sum + ((item.menuItem?.price || 0) * (item.quantity || 0)), 0);
  const rawDiscount = Number(discountAmount) || 0;
  const discountVal = discountType === 'percentage' ? (subtotal * (rawDiscount / 100)) : rawDiscount;
  const taxableAmount = Math.max(0, subtotal - discountVal);
  const gstPerc = globalSettings?.gstPercentage ?? 5;
  const tax = taxableAmount * (gstPerc / 100);
  const finalTotal = taxableAmount + tax;

  const handlePrintAndSettle = async (shouldPrint: boolean = true) => {
    flushPendingUpdate();
    if (paymentMethod === 'Credit' && (!creditCustomerName.trim() || !creditCustomerPhone.trim())) {
      showToast('Credit customer name and phone are required.', 'error');
      return;
    }
    if (isSettleInProgress.current) return;
    isSettleInProgress.current = true;
    setIsPrinting(true);
    try {
      // Pre-check item quantity limit
      for (const item of localOrders) {
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
      if (paymentMethod === 'Credit') {
        const creditPhone = normalizePhone(creditCustomerPhone);
        const existingCustomers = await db.customers.where('phone').equals(creditPhone).toArray();
        if (existingCustomers.length > 0) {
          const existing = existingCustomers[0];
          const limit = existing.creditLimit !== undefined ? existing.creditLimit : 10000;
          const projectedBalance = (existing.balance || 0) + finalTotal;
          if (projectedBalance > limit) {
            showToast(`Credit limit exceeded! Current balance: ₹${existing.balance || 0}, Limit: ₹${limit}`, 'error');
            return;
          }
        } else {
          if (finalTotal > 10000) {
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
      const isCredit = paymentMethod === 'Credit';
      const actualCustomerName = isCredit ? creditCustomerName : customerName;
      const actualCustomerPhone = isCredit ? creditCustomerPhone : customerPhone;

      await db.bills.add({
        id: billId,
        tableId: table.id,
        items: localOrders,
        subtotal,
        tax,
        total: finalTotal,
        paymentMethod: paymentMethod,
        timestamp: billTimestamp,
        billNumber: currentSeq,
        discount: discountVal,
        customerName: actualCustomerName,
        customerPhone: actualCustomerPhone
      });

      await deductStockForBill(billId, localOrders, currentSeq);

      // Save/update customer in POS customer directory
      if (actualCustomerName.trim() && actualCustomerPhone.trim()) {
        await upsertPosCustomer(actualCustomerName.trim(), actualCustomerPhone.trim(), finalTotal);
      }

      if (paymentMethod === 'Credit') {
        await recordCustomerCredit(
          creditCustomerName,
          creditCustomerPhone,
          finalTotal,
          billId,
          currentSeq
        );
      }

      if (shouldPrint) {
        try {
          await ThermalPrinter.printReceipt(table.id, localOrders, subtotal, tax, finalTotal, paymentMethod, currentSeq, globalSettings, discountVal, actualCustomerName, actualCustomerPhone, billTimestamp);
        } catch (printErr) {
          console.error('Printing failed, but saving/settling bill:', printErr);
        }
      }



      onSettleBill(table.id, paymentMethod);
      setLocalOrders([]);
      setDiscountAmount('');
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('Cash');
      setCreditCustomerPhone('');
      setCreditCustomerName('');
    } catch (error) {
      console.error('Print/Settle Error:', error);
      showToast('Settlement failed. Please try again.', 'error');
    } finally {
      isSettleInProgress.current = false;
      setIsPrinting(false);
    }
  };

  const handleSaveToKdsOnly = async () => {
    flushPendingUpdate();
    if (!pendingKdsData) return;
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    const { newItemsToPrint, kotNum } = pendingKdsData;
    try {
      const isCloudPrintSendingEnabled = localStorage.getItem('enableCloudPrintSending') !== 'false';
      await db.kdsOrders.add({
        id: Date.now().toString() + (isCloudPrintSendingEnabled ? '' : '-nocp'),
        tableOrType: `Table ${table.id}`,
        items: newItemsToPrint,
        timestamp: Date.now(),
        status: 'pending',
        kotNumber: kotNum
      });
      
      const updatedOrders = localOrders.map(o => ({
        ...o,
        printedQuantity: o.quantity
      }));

      setLocalOrders(updatedOrders);

      const updates: any = { orders: updatedOrders };
      if (table.status !== 'occupied') {
        updates.status = 'occupied';
      }
      
      await db.activeOrders.update(table.id, updates);
      showToast('Saved to Digital KDS');
    } catch (e) {
      console.error(e);
      showToast('Failed to save to KDS', 'error');
    } finally {
      setShowKdsConfirm(false);
      setPendingKdsData(null);
      isPrintingRef.current = false;
    }
  };

  const handlePrintKOT = async () => {
    flushPendingUpdate();
    if (localOrders.length === 0 || isPrintingRef.current) return;

    // Pre-check item quantity limit
    for (const item of localOrders) {
      const qty = item.quantity || 0;
      if (qty > 10000) {
        const name = item.menuItem?.name || item.name || 'Item';
        showToast(`${name} ki quantity ${qty} limit se zyada`, 'error');
        return;
      }
    }

    isPrintingRef.current = true;
    setIsPrinting(true);
    try {
      // Only print items that haven't been printed yet
      const newItemsToPrint = localOrders.map(o => ({
        ...o,
        quantity: o.quantity - (o.printedQuantity || 0)
      })).filter(o => o.quantity > 0);

      if (newItemsToPrint.length > 0) {
        const kotNum = await getNextKotNumber();
        const printSuccess = await ThermalPrinter.printKOT(table.id, newItemsToPrint, kotNum);
        
        if (printSuccess) {
          showToast(`KOT #${kotNum} Sent to Kitchen`);
          
          // Add to Live Kitchen Display (KDS)
          const isCloudPrintSendingEnabled = localStorage.getItem('enableCloudPrintSending') !== 'false';
          await db.kdsOrders.add({
            id: Date.now().toString() + (isCloudPrintSendingEnabled ? '' : '-nocp'),
            tableOrType: `Table ${table.id}`,
            items: newItemsToPrint,
            timestamp: Date.now(),
            status: 'pending',
            kotNumber: kotNum
          });
          
          // Update printed quantities and status
          const updatedOrders = localOrders.map(o => ({
            ...o,
            printedQuantity: o.quantity
          }));

          // Update local state and background database
          setLocalOrders(updatedOrders);

          const updates: any = { orders: updatedOrders };
          if (table.status !== 'occupied') {
            updates.status = 'occupied';
          }
          
          await db.activeOrders.update(table.id, updates);
        } else {
          setPendingKdsData({ newItemsToPrint, kotNum });
          setShowKdsConfirm(true);
        }
      } else {
        showToast('All items have already been printed. Use KDS to re-print.', 'info');
      }
    } catch (e) {
      console.error('KOT Error:', e);
    } finally {
      setIsPrinting(false);
      isPrintingRef.current = false;
    }
  };

  const isOutOfStock = (item: MenuItem) => {
    if (!item.stockItemId) return false;
    const stockItem = stockItems?.find(s => s.id === item.stockItemId);
    if (!stockItem) return false;
    const qtyPerUnit = item.stockQtyPerUnit || 1;
    
    // M-8 Fix: Aggregate all items in cart that share the same stock item (e.g. variants)
    const totalQtyNeededInCart = localOrders
      .filter(o => o.menuItem.stockItemId === item.stockItemId)
      .reduce((sum, o) => sum + (o.quantity * (o.menuItem.stockQtyPerUnit || 1)), 0);
      
    const totalQtyNeeded = totalQtyNeededInCart + (1 * qtyPerUnit);
    return stockItem.quantity < totalQtyNeeded;
  };

  const isBaseOutOfStock = (item: MenuItem) => {
    if (!item.stockItemId) return false;
    const stockItem = stockItems?.find(s => s.id === item.stockItemId);
    if (!stockItem) return false;
    return stockItem.quantity < (item.stockQtyPerUnit || 1);
  };

  const isMenuItemFullyOutOfStock = (item: MenuItem) => {
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

  const handleAddItem = (menuItem: MenuItem) => {
    if (isOutOfStock(menuItem)) {
      showToast(`${menuItem.name} out of stock hai!`, 'error');
      return;
    }
    const existingItem = localOrders.find(o => o.menuItem.id === menuItem.id);
    let newOrders;
    if (existingItem) {
      newOrders = localOrders.map(o => 
        o.menuItem.id === menuItem.id ? { ...o, quantity: o.quantity + 1 } : o
      );
    } else {
      newOrders = [...localOrders, { menuItem, quantity: 1 }];
    }
    setLocalOrders(newOrders);
    queueUpdateOrder(table.id, newOrders);
  };

  const handleAddCustomItem = (name: string, price: number, quantity: number) => {
    const customItem = {
      id: `custom-${Date.now()}`,
      name: name,
      price: price,
      category: 'Custom'
    };
    const newOrders = [...localOrders, { menuItem: customItem, quantity }];
    setLocalOrders(newOrders);
    queueUpdateOrder(table.id, newOrders);
    setShowCustomItem(false);
  };

  const handleRemoveItem = (menuItemId: string) => {
    const existingItem = localOrders.find(o => o.menuItem.id === menuItemId);
    if (!existingItem) return;

    let newOrders;
    if (existingItem.quantity === 1) {
      newOrders = localOrders.filter(o => o.menuItem.id !== menuItemId);
    } else {
      newOrders = localOrders.map(o => {
        if (o.menuItem.id === menuItemId) {
          const newQty = o.quantity - 1;
          return { 
            ...o, 
            quantity: newQty,
            printedQuantity: o.printedQuantity ? Math.min(o.printedQuantity, newQty) : 0
          };
        }
        return o;
      });
    }
    setLocalOrders(newOrders);
    queueUpdateOrder(table.id, newOrders);
  };

  if (!categories || !menuItems) return <div className="p-8 text-gray-500 dark:text-slate-400 font-bold">Loading Menu...</div>;

  const filteredItems = (activeCategory === 'Favorites'
    ? menuItems.filter((item: DBMenuItem) => item.isFavorite && item.isActive !== false)
    : menuItems.filter((item: DBMenuItem) => item.category === activeCategory && item.isActive !== false)).sort((a: DBMenuItem, b: DBMenuItem) => a.name.localeCompare(b.name));
  
  const sortedCategories = categories.slice().sort((a: DBCategory, b: DBCategory) => a.name.localeCompare(b.name));
  const totalAmount = localOrders.reduce((sum, item) => sum + ((item.menuItem?.price || 0) * (item.quantity || 0)), 0);

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

  const handleVariantSelect = (variant: { name: string; price: number; stockItemId?: string; stockQtyPerUnit?: number }) => {
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
  const isSidebarLayout = categoryLayout !== 'top';

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full relative overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
      {/* Menu Section */}
      <div className={`flex-1 flex ${isSidebarLayout ? 'flex-col sm:flex-row' : 'flex-col'} bg-white rounded-2xl shadow-sm border border-gray-100 lg:overflow-hidden min-h-[60vh] lg:min-h-0 dark:bg-[#0f172a] dark:border-slate-800/80`}>
        {isSidebarLayout ? (
          /* Categories Sidebar Layout */
          <div 
            ref={categoryContainerRef}
            className="w-full sm:w-32 md:w-40 flex sm:flex-col overflow-x-auto sm:overflow-y-auto p-2 sm:p-3 gap-2 border-b sm:border-b-0 sm:border-r border-gray-100 bg-gray-50 scrollbar-hide shrink-0 dark:bg-[#0f172a] dark:border-slate-900 scroll-smooth"
          >
            <button
              onClick={() => setActiveCategory('Favorites')}
              className={`w-28 sm:w-full h-10 sm:h-auto px-2 sm:px-5 py-2 sm:py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 min-w-0
                ${activeCategory === 'Favorites' 
                  ? 'bg-yellow-500 text-white shadow-md shadow-yellow-250 dark:bg-yellow-600 dark:shadow-none' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 dark:bg-[#1e293b]/45 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
            >
              <Star size={14} fill={activeCategory === 'Favorites' ? "currentColor" : "none"} className="shrink-0" />
              <span className="truncate">Favorites</span>
            </button>
            {sortedCategories.map((cat: DBCategory) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.name)}
                className={`w-28 sm:w-full h-10 sm:h-auto px-2 sm:px-5 py-2 sm:py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center sm:justify-start transition-colors shrink-0 min-w-0
                  ${activeCategory === cat.name 
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-300 dark:bg-orange-600 dark:shadow-none' 
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 dark:bg-[#1e293b]/45 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
                title={cat.name}
              >
                <span className="truncate">{cat.name}</span>
              </button>
            ))}
            
            <div className="hidden sm:block flex-1"></div>
            
            <button
              onClick={() => setShowCustomItem(true)}
              className="w-28 sm:w-full h-10 sm:h-auto px-2 sm:px-5 py-2 sm:py-3.5 rounded-xl text-xs sm:text-sm font-bold text-center transition-colors bg-indigo-50 text-indigo-650 hover:bg-indigo-100 border border-indigo-200 sm:mt-2 flex items-center justify-center gap-1.5 sm:gap-2 shrink-0 min-w-0 dark:bg-indigo-950/40 dark:text-indigo-400 dark:hover:bg-indigo-900/40 dark:border-indigo-900/60"
            >
              <Plus size={14} className="shrink-0" />
              <span className="truncate">Custom Item</span>
            </button>
          </div>
        ) : (
          /* Categories Top Tabs Layout */
          <div className="relative group/cat shrink-0 flex items-center border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/10 p-2.5">
            <button 
              type="button"
              onClick={() => {
                categoryContainerRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
              }}
              className="absolute left-0 z-10 p-2 bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800 rounded-full shadow-md text-gray-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 opacity-0 group-hover/cat:opacity-100 transition-opacity duration-200 hidden md:flex items-center justify-center -translate-x-3 w-8 h-8 cursor-pointer hover:scale-105"
              title="Scroll Left"
            >
              <ChevronLeft size={16} />
            </button>

            <div 
              ref={categoryContainerRef}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 scroll-smooth"
            >
              <button
                onClick={() => setActiveCategory('Favorites')}
                className={`w-28 sm:w-32 h-10 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shrink-0 min-w-0
                  ${activeCategory === 'Favorites' 
                    ? 'bg-yellow-500 text-white shadow-md shadow-yellow-250 dark:bg-yellow-600 dark:shadow-none' 
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 dark:bg-[#1e293b]/45 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
              >
                <Star size={14} fill={activeCategory === 'Favorites' ? "currentColor" : "none"} className="shrink-0" />
                <span className="truncate">Favorites</span>
              </button>
              {sortedCategories.map((cat: DBCategory) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`w-28 sm:w-32 h-10 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center shrink-0 min-w-0
                    ${activeCategory === cat.name 
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-300 dark:bg-orange-600 dark:shadow-none' 
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 dark:bg-[#1e293b]/45 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
                  title={cat.name}
                >
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
              <button
                onClick={() => setShowCustomItem(true)}
                className="w-28 sm:w-32 h-10 rounded-xl text-xs font-bold transition-all duration-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 dark:bg-indigo-950/30 dark:text-indigo-400 dark:hover:bg-indigo-900/40 dark:border-indigo-800/60 flex items-center justify-center gap-1.5 shrink-0 min-w-0"
              >
                <Plus size={14} className="shrink-0" />
                <span className="truncate">Custom Item</span>
              </button>
            </div>

            <button 
              type="button"
              onClick={() => {
                categoryContainerRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
              }}
              className="absolute right-0 z-10 p-2 bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800 rounded-full shadow-md text-gray-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 opacity-0 group-hover/cat:opacity-100 transition-opacity duration-200 hidden md:flex items-center justify-center translate-x-3 w-8 h-8 cursor-pointer hover:scale-105"
              title="Scroll Right"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Menu Items Grid */}
        <div className={`flex-1 overflow-auto p-4 ${localOrders.length > 0 ? 'pb-24 lg:pb-4' : ''}`}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredItems.map((item: DBMenuItem) => {
              const outOfStock = isMenuItemFullyOutOfStock(item);
              return (
                <div 
                  key={item.id} 
                  onClick={() => handleItemClick(item)}
                  className={`border border-gray-200 rounded-2xl p-4 transition-all flex flex-col justify-between min-h-[7rem] h-auto pb-4 bg-white group relative dark:bg-[#1e293b]/45 dark:border-slate-800/50 ${outOfStock ? 'opacity-50 cursor-not-allowed select-none bg-gray-50/50 dark:bg-slate-900/20' : 'cursor-pointer hover:border-orange-500 hover:shadow-md dark:hover:border-orange-500/60 dark:hover:bg-[#1e293b]/70'}`}
                >
                  {outOfStock && (
                    <span className="absolute top-2 left-2 bg-red-100 border border-red-200 text-red-600 text-xs font-black px-2 py-0.5 rounded-md uppercase tracking-wider animate-pulse z-10 dark:bg-red-950/40 dark:border-red-900/40 dark:text-red-400">
                      Out of Stock
                    </span>
                  )}
                  <button 
                    onClick={(e) => toggleFavorite(item, e)}
                    title="Toggle Favorite"
                    className={`absolute top-2 right-2 p-1.5 rounded-full transition-colors ${item.isFavorite ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20' : 'text-gray-300 hover:text-yellow-500 hover:bg-gray-55 dark:text-slate-600 dark:hover:text-yellow-500 dark:hover:bg-slate-800'}`}
                  >
                    <Star size={16} fill={item.isFavorite ? "currentColor" : "none"} />
                  </button>
                  <div className="font-bold text-gray-700 group-hover:text-orange-600 transition-colors leading-tight pr-5 dark:text-slate-200 dark:group-hover:text-orange-400 line-clamp-2" title={item.name}>{item.name}</div>
                  {item.variants && item.variants.filter((v: any) => v.isActive !== false).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {item.variants.filter((v: any) => v.isActive !== false).map((v: { name: string; price: number }, idx: number) => (
                        <div key={idx} className="text-xs font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-100 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-900/40 truncate max-w-[100px]" title={`${v.name}: ₹${v.price.toFixed(2)}`}>
                          {v.name}: ₹{v.price.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 font-black text-lg dark:text-slate-400">₹{item.price.toFixed(2)}</div>
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

      {/* Order Summary Section */}
      <div className={`
        overflow-hidden
        ${showMobileCart 
          ? 'fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-white dark:bg-[#0f172a] z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 lg:relative lg:right-auto lg:top-auto lg:bottom-auto lg:w-96 lg:bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-gray-100 lg:z-0 lg:flex lg:overflow-hidden lg:min-h-0 lg:dark:bg-[#0f172a] lg:dark:border-slate-800/80' 
          : 'hidden lg:flex w-full lg:w-96 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col shrink-0 min-h-[50vh] lg:min-h-0 dark:bg-[#0f172a] dark:border-slate-800/80'}
      `}>
        <div className="p-4 border-b bg-gray-55 flex justify-between items-center dark:bg-[#1e293b]/60 dark:border-slate-800/80 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button 
              onClick={() => {
                if (showMobileCart) {
                  setShowMobileCart(false);
                } else {
                  onSelectTable(null);
                }
              }} 
              className="p-2 -ml-2 text-gray-500 hover:bg-gray-200 rounded-full transition-colors dark:text-slate-400 dark:hover:bg-slate-800 shrink-0" 
              title={showMobileCart ? "Close Cart" : "Go Back"}
            >
              {showMobileCart ? <X size={20} /> : <ArrowLeft size={20} />}
            </button>
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 truncate flex-1" title={`Table ${table.id}`}>Table {table.id}</h2>
            {localOrders.length > 0 && (
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="p-1.5 text-red-500 hover:bg-red-55 rounded-lg transition-colors ml-1 dark:text-red-400 dark:hover:bg-red-950/30 shrink-0"
                title="Clear Cart"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
          <span className={`px-2 py-1 rounded-md text-xs font-bold shrink-0 ml-2 ${table.status === 'occupied' ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/45 dark:text-orange-400 dark:border dark:border-orange-900/40' : 'bg-green-100 text-green-600 dark:bg-green-950/45 dark:text-green-400 dark:border dark:border-green-900/40'}`}>
            {table.status.toUpperCase()}
          </span>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {localOrders.length === 0 ? (
            <div className="text-gray-400 text-center mt-10 font-medium dark:text-slate-500">No items added yet.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {localOrders.map(order => (
                <div key={order.menuItem.id} className="flex justify-between items-center min-w-0 gap-2">
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="font-bold text-gray-700 dark:text-slate-200 truncate" title={order.menuItem.name}>{order.menuItem.name}</div>
                    <div className="text-sm text-gray-400 font-medium dark:text-slate-400">₹{order.menuItem.price.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => handleRemoveItem(order.menuItem.id)} className="p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" title="Decrease quantity">
                      <Minus size={16} />
                    </button>
                    <span className="font-bold w-4 text-center dark:text-slate-200">{order.quantity}</span>
                    <button onClick={() => handleAddItem(order.menuItem)} className="p-1.5 bg-orange-100 rounded-lg hover:bg-orange-200 text-orange-600 transition-colors dark:bg-orange-950/40 dark:text-orange-400 dark:hover:bg-orange-900/60" title="Increase quantity">
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="w-20 text-right font-bold text-gray-800 dark:text-slate-100 shrink-0">
                    ₹{(order.menuItem.price * order.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 dark:bg-[#1e293b]/30 dark:border-slate-800/80">
          {table.status === 'occupied' && (
            <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-slate-800">
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowCustomer(true)}
                  className={`flex-1 py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 border-2 transition-all ${customerName || customerPhone ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-950/45 dark:text-orange-400' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-[#1e293b] dark:text-slate-300 dark:hover:bg-slate-800/65'}`}
                >
                  <UserPlus size={14} /> {customerName ? customerName.split(' ')[0] : 'Customer Info'}
                </button>
                <button 
                  onClick={() => setShowDiscount(true)}
                  className={`flex-1 py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 border-2 transition-all ${Number(discountAmount) > 0 ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-950/45 dark:text-orange-400' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-[#1e293b] dark:text-slate-300 dark:hover:bg-slate-800/65'}`}
                >
                  <Tag size={14} /> {Number(discountAmount) > 0 ? `${discountAmount}${discountType === 'percentage' ? '%' : '₹'} Off` : 'Discount'}
                </button>
              </div>
              <div className="flex justify-between text-sm font-bold text-gray-500 dark:text-slate-400">
                <span>Subtotal</span>
                <span className="dark:text-slate-300">₹{subtotal.toFixed(2)}</span>
              </div>
              {discountVal > 0 && (
                <div className="flex justify-between text-sm font-bold text-green-600 dark:text-green-400">
                  <span>Discount</span>
                  <span>-₹{discountVal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-500 dark:text-slate-400">
                <span>GST ({gstPerc}%)</span>
                <span className="dark:text-slate-300">₹{tax.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center mb-4 text-xl font-black text-gray-800 dark:text-slate-200">
            <span>Total:</span>
            <span className="text-orange-600 dark:text-orange-400">₹{table.status === 'occupied' ? finalTotal.toFixed(2) : totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex gap-2 mb-2">
            <button 
              onClick={handlePrintKOT}
              disabled={localOrders.length === 0 || isPrinting}
              className="px-4 py-3 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white rounded-xl font-bold flex flex-col items-center justify-center transition-all disabled:opacity-50 text-xs dark:bg-slate-800 dark:hover:bg-slate-700 dark:disabled:bg-slate-900"
            >
              <Printer size={18} className="mb-1" />
              KOT
            </button>
            <button 
              onClick={() => onPlaceOrder(table.id)}
              disabled={localOrders.length === 0 || isPrinting}
              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-xl font-bold text-base shadow-lg shadow-orange-200 transition-all disabled:shadow-none dark:bg-orange-600 dark:hover:bg-orange-700 dark:shadow-none whitespace-nowrap"
            >
              {table.status === 'occupied' ? 'Update Order' : 'Place Order'}
            </button>
          </div>
          {table.status === 'occupied' && (
            <>
              {/* Payment Method Selector */}
              <div className="grid grid-cols-5 gap-1 mb-3">
                {(['Cash', 'UPI', 'Card', 'Credit', 'Unpaid'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`py-3 rounded-lg text-[10px] sm:text-xs font-semibold transition-colors whitespace-nowrap text-center flex items-center justify-center px-1 ${
                      paymentMethod === m
                        ? m === 'Credit' || m === 'Unpaid'
                          ? 'bg-red-500 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {paymentMethod === 'Credit' && (
                <div className="flex flex-col gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={creditCustomerName}
                    onChange={e => {
                      setCreditCustomerName(e.target.value);
                      setActiveCreditCustomerField('name');
                    }}
                    onFocus={() => setActiveCreditCustomerField('name')}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  <input
                    type="tel"
                    placeholder="Customer Phone (10 digits)"
                    value={creditCustomerPhone}
                    onChange={e => {
                      setCreditCustomerPhone(e.target.value);
                      setActiveCreditCustomerField('phone');
                    }}
                    onFocus={() => setActiveCreditCustomerField('phone')}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  
                  {/* Suggestions List inline */}
                  {creditCustomerSuggestions.length > 0 && (
                    <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col bg-gray-50 dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800 max-h-[140px] overflow-y-auto shadow-inner mt-1">
                      <div className="px-2.5 py-1 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest bg-gray-100 dark:bg-slate-900">
                        {creditCustomerName || creditCustomerPhone ? 'Matching Saved Customers' : 'Recent Customers (Quick Select)'}
                      </div>
                      {creditCustomerSuggestions.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCreditCustomerName(c.name);
                            setCreditCustomerPhone(c.phone);
                            setCreditCustomerSuggestions([]);
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
              <div className="flex gap-2 w-full">
                <button
                   onClick={() => handlePrintAndSettle(false)}
                   disabled={isPrinting || localOrders.length === 0}
                   className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs text-center flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md"
                >
                   Save Bill
                </button>
                <button
                   onClick={() => handlePrintAndSettle(true)}
                   disabled={isPrinting || localOrders.length === 0}
                   className="flex-[2] py-3.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 dark:bg-green-600 dark:hover:bg-green-700"
                >
                   <Printer size={14} /> {isPrinting ? 'Printing...' : 'Settle & Print'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Variant Selection Modal */}
      {variantModalItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 dark:bg-black/60">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 dark:bg-[#0f172a] dark:border dark:border-slate-800/80">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-black text-xl text-gray-800 dark:text-slate-100">{variantModalItem.name}</h3>
              <button onClick={() => setVariantModalItem(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full dark:hover:bg-slate-800 dark:text-slate-500" title="Close"><X size={20} /></button>
            </div>
            <div className="text-sm font-bold text-gray-500 dark:text-slate-400 mb-2">Select Variant:</div>
            <div className="flex flex-col gap-3">
              {variantModalItem.variants?.filter((v: any) => v.isActive !== false).map((v: { name: string; price: number; stockItemId?: string; stockQtyPerUnit?: number }, idx: number) => {
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
                    className={`w-full flex justify-between items-center p-4 rounded-xl border-2 transition-all group ${
                      outOfStock
                        ? 'border-red-150 bg-red-50/40 cursor-not-allowed dark:border-red-950/20 dark:bg-red-950/10'
                        : 'border-gray-100 hover:border-orange-500 hover:bg-orange-50 dark:border-slate-800 dark:hover:border-orange-600 dark:hover:bg-orange-950/30'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className={`font-bold ${outOfStock ? 'text-red-400 dark:text-red-500 line-through' : 'text-gray-700 group-hover:text-orange-700 dark:text-slate-300 dark:group-hover:text-orange-400'}`}>{v.name}</span>
                      {outOfStock && <span className="text-[10px] font-black text-red-500 dark:text-red-400 uppercase tracking-wider">Out of Stock</span>}
                    </div>
                    <span className={`font-black ${outOfStock ? 'text-gray-400 dark:text-slate-600' : 'text-orange-600 dark:text-orange-400'}`}>₹{v.price.toFixed(2)}</span>
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
        title="Clear Order"
        message="Are you sure you want to clear the entire order for this table?"
        onConfirm={() => {
          setLocalOrders([]);
          onUpdateOrder(table.id, []);
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
      {localOrders.length > 0 && !showMobileCart && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-150 dark:border-slate-850 shadow-2xl flex items-center justify-between lg:hidden px-6 animate-in fade-in duration-200">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-400 dark:text-slate-400">
              {localOrders.reduce((s, o) => s + o.quantity, 0)} Items (Table {table.id})
            </span>
            <span className="text-lg font-black text-orange-600 dark:text-orange-400">
              ₹{table.status === 'occupied' ? finalTotal.toFixed(2) : totalAmount.toFixed(2)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMobileCart(true)}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-650 text-white font-black text-sm rounded-xl shadow-md shadow-orange-200 dark:shadow-none transition-all flex items-center gap-2"
          >
            View Order 🍽️
          </button>
        </div>
      )}
    </div>
  );
}
