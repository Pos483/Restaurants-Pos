import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid, Utensils, BookOpen, HelpCircle, Crown, Sun, Moon,
  Zap, LayoutDashboard, BarChart3, Printer, Package, ChefHat, Eye,
  Settings, Store, User as UserIcon, LogOut, CheckCircle2, XCircle,
  Unplug, AlertTriangle, Megaphone, Users, Bell, Globe
} from 'lucide-react';
import { db, useLiveQuery, notifyGlobalChange, getNextKotNumber } from '../db';
// ThermalPrinter loaded dynamically on button click to keep printer.ts out of initial bundle
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { SyncStatus, PrinterToast } from '../hooks/useAppSetup';
import type { PremiumState } from '../hooks/usePremium';

interface AppLayoutProps {
  isAppLocked: boolean;
  isOnline: boolean;
  announcement: string;
  setAnnouncement: (v: string) => void;
  syncStatus: SyncStatus;
  printerToast: PrinterToast;
  setPrinterToast: React.Dispatch<React.SetStateAction<PrinterToast>>;
  showPrinterToast: (type: 'connected' | 'disconnected' | 'error', message: string) => void;
  premiumState: PremiumState;
  hasLowStock: boolean;
  children: React.ReactNode;
}

export function AppLayout({
  isAppLocked,
  isOnline,
  announcement,
  setAnnouncement,
  syncStatus,
  printerToast,
  setPrinterToast,
  showPrinterToast,
  premiumState,
  hasLowStock,
  children,
}: AppLayoutProps) {
  const { user, activeTab, setActiveTab, logout } = useApp();
  const { toggleTheme, isDark } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);

  const [showPendingOrdersModal, setShowPendingOrdersModal] = useState(false);
  const selfOrders = useLiveQuery(() => db.selfOrders.toArray(), [], 'self_orders') || [];
  const pendingOrders = selfOrders.filter(o => o.status === 'pending');

  const [showOnlineOrdersModal, setShowOnlineOrdersModal] = useState(false);
  const [onlineTab, setOnlineTab] = useState<'pending' | 'active'>('pending');
  const onlineOrders = useLiveQuery(() => db.onlineOrders.toArray(), [], 'online_orders') || [];
  const pendingOnlineOrders = onlineOrders.filter(o => o.status === 'pending');
  const activeOnlineOrders = onlineOrders.filter(o => ['accepted', 'preparing', 'dispatched'].includes(o.status));

  const lastPendingCountRef = useRef(0);
  const lastOnlinePendingCountRef = useRef(0);
  
  useEffect(() => {
    const totalNewOrders = pendingOrders.length + pendingOnlineOrders.length;
    const lastTotalCount = lastPendingCountRef.current + lastOnlinePendingCountRef.current;

    if (totalNewOrders > lastTotalCount) {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const playBeep = (freq: number, duration: number, delay: number) => {
          setTimeout(() => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioContext.currentTime);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start();
            osc.stop(audioContext.currentTime + duration);
          }, delay * 1000);
        };

        if (pendingOnlineOrders.length > lastOnlinePendingCountRef.current) {
          // Double chirp for Online Delivery Order
          playBeep(880, 0.1, 0);
          playBeep(880, 0.1, 0.15);
        } else {
          // Single beep for Table Dine-in self order
          playBeep(600, 0.15, 0);
        }
      } catch (e) {
        console.warn('Alert sound failed:', e);
      }
    }
    lastPendingCountRef.current = pendingOrders.length;
    lastOnlinePendingCountRef.current = pendingOnlineOrders.length;
  }, [pendingOrders.length, pendingOnlineOrders.length]);

  const handleApproveOrder = async (order: any) => {
    try {
      // 1. Get the current active table orders
      const activeTable = await db.activeOrders.get(Number(order.tableId));
      const existingOrders = activeTable?.orders || [];
      const mergedOrders = [...existingOrders];

      for (const selfItem of order.items) {
        const existingItem = mergedOrders.find(o => o.menuItem.id === selfItem.menuItem.id);
        if (existingItem) {
          existingItem.quantity += selfItem.quantity;
        } else {
          mergedOrders.push(selfItem);
        }
      }

      // 2. Update table active orders & status
      await db.activeOrders.put({
        id: Number(order.tableId),
        status: 'occupied',
        orders: mergedOrders,
        tablePin: activeTable?.tablePin || Math.floor(100 + Math.random() * 900).toString(),
        customerName: order.customerName || undefined,
        customerPhone: order.customerPhone || undefined
      } as any);

      // 3. Mark the self order as approved
      await db.selfOrders.update(order.id, { status: 'approved' });

      // 4. Trigger KOT printing automatically
      try {
        const { ThermalPrinter } = await import('../printer');
        const kotNum = await getNextKotNumber();
        await ThermalPrinter.printKOT(Number(order.tableId), order.items, kotNum);
      } catch (printErr) {
        console.error('KOT auto-print failed:', printErr);
      }

      notifyGlobalChange('active_orders');
    } catch (err) {
      console.error('Failed to approve order:', err);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    try {
      await db.selfOrders.update(orderId, { status: 'rejected' });
    } catch (err) {
      console.error('Failed to reject order:', err);
    }
  };

  const handleAcceptOnlineOrder = async (order: any) => {
    try {
      // 1. Update order status and payment status in DB
      await db.onlineOrders.update(order.id, { 
        status: 'accepted',
        paymentStatus: 'paid'
      });

      // 2. Add customer to loyalty list if details exist
      if (order.customerName && order.customerPhone) {
        const { upsertPosCustomer } = await import('../db/customers');
        const totalAmt = order.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
        await upsertPosCustomer(order.customerName, order.customerPhone, totalAmt);
      }

      // 3. Print KOT & Delivery Slip
      try {
        const { ThermalPrinter } = await import('../printer');
        const kotNum = await getNextKotNumber();

        // Print Kitchen KOT
        await ThermalPrinter.printKOT(99, order.items, kotNum);

        // Print Delivery Slip
        const globalSettings = await db.restaurantSettings.get('global');
        const profile = await db.restaurantProfile.get('global');
        const printerSettings = { ...(profile || {}), ...(globalSettings || {}) };
        await ThermalPrinter.printDeliverySlip(order, printerSettings);
      } catch (printErr) {
        console.error('KOT/Delivery printing failed:', printErr);
      }

      notifyGlobalChange('online_orders');
    } catch (err) {
      console.error('Failed to accept online order:', err);
    }
  };

  const handleRejectOnlineOrder = async (orderId: string) => {
    try {
      await db.onlineOrders.update(orderId, { status: 'rejected' });
      notifyGlobalChange('online_orders');
    } catch (err) {
      console.error('Failed to reject online order:', err);
    }
  };

  const handleUpdateOnlineOrderStatus = async (orderId: string, newStatus: 'preparing' | 'dispatched' | 'delivered') => {
    try {
      await db.onlineOrders.update(orderId, { status: newStatus });
      notifyGlobalChange('online_orders');
    } catch (err) {
      console.error('Failed to update online order status:', err);
    }
  };
  const profileMenuRef = React.useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  React.useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleLogout = async () => { await logout(); };

  const profile = useLiveQuery(() => db.restaurantProfile.get('global'), [], 'restaurant_profile');
  const restaurantName = profile?.restaurantName || 'SIYA BILL';

  return (
    <div className="flex h-screen bg-[#FAFBFC] dark:bg-[#0B0F19] font-sans text-gray-900 dark:text-slate-100 overflow-hidden transition-colors duration-300">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-[88px] glass-sidebar flex-col items-center py-4 z-10 transition-colors duration-300">
        <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-2.5 rounded-xl text-white mb-4 shadow-lg shadow-orange-200/50 dark:shadow-orange-900/30 shrink-0 glow-orange">
          <Utensils size={18} />
        </div>
        <nav className="flex flex-col gap-1 w-full px-2 overflow-y-auto scrollbar-hide pb-4">
          {isAppLocked ? (
            <NavItem icon={<Crown size={16} className="text-red-500 animate-pulse" />} label="Premium" active={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')} />
          ) : (
            <>
              <NavItem icon={<LayoutDashboard size={16} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
              <NavItem icon={<LayoutGrid size={16} />} label="Dine-In" active={activeTab === 'tables'} onClick={() => setActiveTab('tables')} />
              <NavItem
                icon={
                  <div className="relative">
                    <Globe size={16} />
                    {(pendingOrders.length + pendingOnlineOrders.length) > 0 && (
                      <span className="absolute -top-1 -right-1.5 flex h-3.5 w-3.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-450 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-orange-500 text-[8px] font-black text-white items-center justify-center">
                          {pendingOrders.length + pendingOnlineOrders.length}
                        </span>
                      </span>
                    )}
                  </div>
                }
                label="Self & Online"
                active={activeTab === 'online_orders'}
                onClick={() => setActiveTab('online_orders')}
              />
              <NavItem icon={<Zap size={16} />} label="Quick" active={activeTab === 'quick'} onClick={() => setActiveTab('quick')} />
              <NavItem icon={<ChefHat size={16} />} label="Kitchen" active={activeTab === 'kot'} onClick={() => setActiveTab('kot')} />
              <NavItem icon={<BarChart3 size={16} />} label="Reports" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
              <NavItem icon={<Users size={16} />} label="Khata" active={activeTab === 'khata'} onClick={() => setActiveTab('khata')} />
              <NavItem icon={<UserIcon size={16} />} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
              <NavItem
                icon={
                  <div className="relative">
                    <Package size={16} />
                    {hasLowStock && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                      </span>
                    )}
                  </div>
                }
                label="Stock" active={activeTab === 'stock'} onClick={() => setActiveTab('stock')}
              />
              <NavItem icon={<Store size={16} />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
              <NavItem icon={<Settings size={16} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
              <NavItem icon={<BookOpen size={16} />} label="Menu" active={activeTab === 'menu'} onClick={() => setActiveTab('menu')} />
              <NavItem icon={<HelpCircle size={16} />} label="Help" active={activeTab === 'help'} onClick={() => setActiveTab('help')} />
              <NavItem icon={<Crown size={16} className="text-amber-500" />} label="Premium" active={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')} />
            </>
          )}
        </nav>
        <div className="mt-auto pt-4 border-t border-gray-100 dark:border-slate-800 w-full flex justify-center">
          <span className="text-xs font-black text-gray-300 dark:text-slate-600 tracking-tighter">V{import.meta.env.VITE_APP_VERSION}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative pb-[64px] md:pb-0">
        {/* Global Announcement Banner */}
        {announcement && (
          <div className="bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 text-white px-6 py-3 flex items-center justify-between shadow-lg text-xs md:text-sm font-bold tracking-wide border-b border-orange-500/20 shrink-0 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/10 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="bg-white/20 p-1.5 rounded-xl animate-bounce shadow-sm shrink-0">
                <Megaphone size={16} className="text-white" />
              </div>
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                <span className="font-sans tracking-normal leading-relaxed text-slate-50 line-clamp-2 flex-1 min-w-0">{announcement}</span>
              </span>
            </div>
            <button onClick={() => setAnnouncement('')} className="hover:bg-white/25 bg-white/10 text-white text-xs font-black rounded-xl transition-all font-sans border border-white/20 px-3 py-1 relative z-10 active:scale-95 shrink-0 cursor-pointer shadow-sm hover:shadow">
              Dismiss
            </button>
          </div>
        )}

        {/* Header */}
        <header className="glass-header px-4 md:px-8 py-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 z-10 transition-colors duration-300">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl font-black text-gray-800 dark:text-slate-100 tracking-tight transition-colors truncate max-w-[240px] sm:max-w-[450px] lg:max-w-[600px]">
              {restaurantName.toUpperCase()}
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs font-bold text-orange-500 tracking-widest uppercase">SIYA BILL SYSTEM</p>
              {syncStatus === 'synced' && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/40 transition-colors" title="Online: All data is backed up and synced to the cloud.">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />Online
                </div>
              )}
              {syncStatus === 'syncing' && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40 animate-pulse transition-colors" title="Syncing: Syncing local edits to the cloud...">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />Syncing to Cloud
                </div>
              )}
              {syncStatus === 'error' && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/40 transition-colors" title="Sync Error: Could not sync local edits.">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" />Sync Error
                </div>
              )}
              {(syncStatus === 'offline' || !isOnline) && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/40 transition-colors" title="Offline: Using local cached data.">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />Offline
                </div>
              )}
              {premiumState.isTrial && !premiumState.isExpired && (
                <button onClick={() => setActiveTab('subscription')} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 transition-colors cursor-pointer active:scale-95" title="Click to activate premium">
                  <Crown size={10} className="text-amber-500 fill-amber-500 animate-bounce" />
                  {premiumState.daysLeft} {premiumState.daysLeft === 1 ? 'Day' : 'Days'} Trial Left
                </button>
              )}
              {premiumState.isPremium && !premiumState.isTrial && (
                <button onClick={() => setActiveTab('subscription')} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40 transition-all cursor-pointer active:scale-95" title="Click to view subscription details">
                  <Crown size={10} className="text-indigo-500 fill-indigo-500 animate-pulse" />Premium Active
                </button>
              )}
            </div>
          </div>

          {/* Quick Billing shortcut */}
          <div className="hidden md:flex flex-1 justify-center">
            <button
              onClick={() => setActiveTab('quick')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-xs uppercase tracking-wider transition-all duration-300 shadow-md border active:scale-95 ${
                activeTab === 'quick'
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-orange-500 shadow-orange-200/50'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <Zap size={14} className={activeTab === 'quick' ? 'animate-bounce' : ''} />
              Quick Billing
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-4 w-full sm:w-auto justify-end">
            <button
              onClick={async () => { const { ThermalPrinter } = await import('../printer'); ThermalPrinter.connect(true).then(() => showPrinterToast('connected', '🖨️ Printer switched successfully!')).catch(() => showPrinterToast('error', '⚠️ Printer switch failed!')); }}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-full font-bold border border-purple-100 dark:border-purple-900/30 transition-colors text-xs shadow-sm"
              title="View & Switch Printers"
            >
              <Eye size={14} /><span className="hidden lg:inline">View Printers</span>
            </button>
            <button
              onClick={async () => { const { ThermalPrinter } = await import('../printer'); ThermalPrinter.connect().then(() => showPrinterToast('connected', '🖨️ Printer Connected Successfully!')).catch(() => showPrinterToast('error', '⚠️ Printer connect failed! Check connection.')); }}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-full font-bold border border-blue-100 dark:border-blue-900/30 transition-colors text-xs shadow-sm"
            >
              <Printer size={14} /><span className="hidden md:inline">Connect Printer</span>
            </button>

            {/* Self-Orders Notification Bell */}
            <button
              onClick={() => setShowPendingOrdersModal(true)}
              className="relative p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all duration-300 text-gray-600 dark:text-slate-300 hover:text-indigo-500 dark:hover:text-indigo-400 border border-gray-200/50 dark:border-slate-700/50 shadow-sm cursor-pointer"
              title="Dine-in Self Orders"
            >
              <Bell size={16} className={pendingOrders.length > 0 ? 'animate-bounce text-indigo-650 dark:text-indigo-400' : ''} />
              {pendingOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] font-black text-white items-center justify-center">
                    {pendingOrders.length}
                  </span>
                </span>
              )}
            </button>

            {/* Online Orders Notification Bell */}
            <button
              onClick={() => setShowOnlineOrdersModal(true)}
              className="relative p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all duration-300 text-gray-600 dark:text-slate-300 hover:text-orange-500 dark:hover:text-orange-400 border border-gray-200/50 dark:border-slate-700/50 shadow-sm cursor-pointer"
              title="Online Orders (Home Delivery & Takeaway)"
            >
              <Globe size={16} className={pendingOnlineOrders.length > 0 ? 'animate-pulse text-orange-500 dark:text-orange-400' : ''} />
              {pendingOnlineOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 text-[9px] font-black text-white items-center justify-center">
                    {pendingOnlineOrders.length}
                  </span>
                </span>
              )}
            </button>

            {/* Theme Toggle */}
            <button onClick={toggleTheme} className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all duration-300 text-gray-600 dark:text-slate-300 hover:text-orange-500 dark:hover:text-orange-400 border border-gray-200/50 dark:border-slate-700/50 shadow-sm" title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center border border-indigo-200 dark:border-indigo-800/60 cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors shadow-sm" title={user?.email || 'User'} onClick={() => setShowProfileMenu(!showProfileMenu)}>
                <span className="font-bold text-indigo-700 dark:text-indigo-300 text-sm">{user?.email ? user.email.charAt(0).toUpperCase() : 'U'}</span>
              </div>
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#0f172a] rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden z-50 transition-colors">
                  <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">Signed in as</p>
                    <p className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate mt-0.5">{user?.email}</p>
                  </div>
                  <div className="p-2">
                    <button onClick={() => { setActiveTab('profile'); setShowProfileMenu(false); }} className="w-full text-left px-3 py-2 text-sm font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2">
                      <UserIcon size={16} /> Restaurant Profile
                    </button>
                    <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors flex items-center gap-2 mt-1">
                      <LogOut size={16} /> Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 pt-6 pb-0 md:pb-6 overflow-y-auto h-full bg-[#FAFBFC] dark:bg-[#0B0F19] transition-colors duration-300">
          {children}
        </main>

        {/* Printer Toast */}
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] transition-all duration-500 ease-out ${printerToast.show ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`}>
          <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border-2 min-w-[280px] w-[90vw] max-w-[420px] backdrop-blur-xl transition-colors ${
            printerToast.type === 'connected' ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/60 dark:to-emerald-950/60 border-green-200 dark:border-green-800/50'
            : printerToast.type === 'disconnected' ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/60 dark:to-orange-950/60 border-red-200 dark:border-red-800/50'
            : 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/60 dark:to-yellow-950/60 border-amber-200 dark:border-amber-800/50'
          }`}>
            <div className={`p-3 rounded-xl transition-colors ${
              printerToast.type === 'connected' ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
              : printerToast.type === 'disconnected' ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
            }`}>
              {printerToast.type === 'connected' ? <CheckCircle2 size={28} /> : printerToast.type === 'disconnected' ? <Unplug size={28} /> : <AlertTriangle size={28} />}
            </div>
            <div className="flex-1">
              <p className={`font-black text-sm transition-colors ${
                printerToast.type === 'connected' ? 'text-green-800 dark:text-green-300'
                : printerToast.type === 'disconnected' ? 'text-red-800 dark:text-red-300'
                : 'text-amber-800 dark:text-amber-300'
              }`}>
                {printerToast.type === 'connected' ? 'Printer Connected' : printerToast.type === 'disconnected' ? 'Printer Disconnected' : 'Printer Error'}
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-400 font-medium mt-0.5 transition-colors">{printerToast.message}</p>
            </div>
            <button onClick={() => setPrinterToast(prev => ({ ...prev, show: false }))} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors p-1" title="Close" aria-label="Close">
              <XCircle size={20} />
            </button>
          </div>
          {printerToast.show && (
            <div className="mt-1 h-1 rounded-full overflow-hidden bg-gray-200/50 dark:bg-slate-700/50 mx-4">
              <div className={`h-full rounded-full animate-shrink ${printerToast.type === 'connected' ? 'bg-green-400' : printerToast.type === 'disconnected' ? 'bg-red-400' : 'bg-amber-400'}`} />
            </div>
          )}
        </div>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-slate-800/60 flex items-center justify-around py-2 px-1 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.3)] transition-colors duration-300">
          <MobileNavItem icon={<LayoutDashboard size={20} />} label="Dash" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setShowMobileMenu(false); }} />
          <MobileNavItem icon={<Zap size={20} />} label="Quick" active={activeTab === 'quick'} onClick={() => { setActiveTab('quick'); setShowMobileMenu(false); }} />
          <MobileNavItem icon={<LayoutGrid size={20} />} label="Dine-In" active={activeTab === 'tables'} onClick={() => { setActiveTab('tables'); setShowMobileMenu(false); }} />
          <MobileNavItem icon={<ChefHat size={20} />} label="KOT" active={activeTab === 'kot'} onClick={() => { setActiveTab('kot'); setShowMobileMenu(false); }} />
          <MobileNavItem icon={<Store size={20} />} label="More" active={showMobileMenu} onClick={() => setShowMobileMenu(!showMobileMenu)} />
        </div>

        {/* Mobile "More" modal */}
        {showMobileMenu && (
          <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
            <div className="bg-white dark:bg-[#0f172a] rounded-t-3xl pb-[80px] pt-4 px-4 w-full relative animate-in slide-in-from-bottom-10 shadow-2xl transition-colors border-t border-gray-100 dark:border-slate-800">
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full mx-auto mb-4" />
              <h3 className="font-bold text-gray-800 dark:text-slate-100 px-2 mb-2">More Options</h3>
              <div className="grid grid-cols-4 gap-2">
                <MobileMenuButton
                  icon={
                    <div className="relative">
                      <Globe size={20} />
                      {(pendingOrders.length + pendingOnlineOrders.length) > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                        </span>
                      )}
                    </div>
                  }
                  label="Online/Self"
                  active={activeTab === 'online_orders'}
                  onClick={() => { setActiveTab('online_orders'); setShowMobileMenu(false); }}
                />
                <MobileMenuButton icon={<BarChart3 size={20} />} label="Reports" active={activeTab === 'reports'} onClick={() => { setActiveTab('reports'); setShowMobileMenu(false); }} />
                <MobileMenuButton icon={<Users size={20} />} label="Khata" active={activeTab === 'khata'} onClick={() => { setActiveTab('khata'); setShowMobileMenu(false); }} />
                <MobileMenuButton icon={<UserIcon size={20} />} label="Customers" active={activeTab === 'customers'} onClick={() => { setActiveTab('customers'); setShowMobileMenu(false); }} />
                <MobileMenuButton icon={<BookOpen size={20} />} label="Menu" active={activeTab === 'menu'} onClick={() => { setActiveTab('menu'); setShowMobileMenu(false); }} />
                <MobileMenuButton
                  icon={<div className="relative"><Package size={20} />{hasLowStock && (<span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>)}</div>}
                  label="Stock" active={activeTab === 'stock'} onClick={() => { setActiveTab('stock'); setShowMobileMenu(false); }}
                />
                <MobileMenuButton icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setShowMobileMenu(false); }} />
                <MobileMenuButton icon={<Store size={20} />} label="Profile" active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setShowMobileMenu(false); }} />
                <MobileMenuButton icon={<HelpCircle size={20} />} label="Help" active={activeTab === 'help'} onClick={() => { setActiveTab('help'); setShowMobileMenu(false); }} />
              </div>
            </div>
          </div>
        )}

        {/* Dine-in Self Orders Approval Modal */}
        {showPendingOrdersModal && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl animate-fade-in text-gray-800 dark:text-slate-100">
              
              {/* Modal Header */}
              <div className="px-6 py-4.5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 rounded-xl">
                    <Bell size={16} className="animate-bounce" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-gray-850 dark:text-slate-200">Dine-in Self Orders</h2>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5 tracking-wider">Pending Cashier Approval</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPendingOrdersModal(false)}
                  className="text-xs font-bold text-gray-400 hover:text-gray-650 dark:hover:text-slate-350 cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 max-h-[30rem] scrollbar-hide">
                {pendingOrders.length === 0 ? (
                  <div className="text-center py-12 flex flex-col items-center gap-2">
                    <CheckCircle2 size={32} className="text-green-500" />
                    <p className="text-xs font-bold text-gray-400 dark:text-slate-500">All caught up! No pending self orders.</p>
                  </div>
                ) : (
                  pendingOrders.map((ord) => (
                    <div key={ord.id} className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-gray-150 dark:border-slate-800/80 rounded-2xl flex flex-col gap-3">
                      <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-2.5">
                        <div>
                          <span className="font-extrabold text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-0.5 rounded-full border border-orange-200/20">
                            Table {ord.tableId}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold ml-2">
                            {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-[10px] font-black text-gray-500 dark:text-slate-400">
                          {ord.customerName} ({ord.customerPhone})
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="flex flex-col gap-1.5 pl-1.5">
                        {ord.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] font-bold text-gray-650 dark:text-slate-300">
                            <span>{item.menuItem?.name || item.name} <span className="text-indigo-650 dark:text-indigo-400 font-black">x{item.quantity}</span></span>
                            <span>₹{((item.menuItem?.price || item.price || 0) * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2.5 mt-2 pt-2.5 border-t border-gray-100 dark:border-slate-800">
                        <button
                          onClick={() => handleRejectOrder(ord.id)}
                          className="flex-1 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/10 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-extrabold text-[10px] rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1 border border-red-200/10"
                        >
                          <XCircle size={12} />
                          Reject
                        </button>
                        <button
                          onClick={() => handleApproveOrder(ord)}
                          className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-extrabold text-[10px] rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1 shadow-md shadow-green-500/10"
                        >
                          <CheckCircle2 size={12} />
                          Approve & KOT
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        )}

        {/* Online Orders Approval & Status tracking Modal */}
        {showOnlineOrdersModal && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden flex flex-col shadow-2xl animate-fade-in text-gray-800 dark:text-slate-100">
              
              {/* Modal Header with tabs */}
              <div className="px-6 pt-4.5 pb-0 border-b border-gray-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-orange-50 dark:bg-orange-950/30 text-orange-500 dark:text-orange-400 rounded-xl">
                      <Globe size={16} className="animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-gray-850 dark:text-slate-200">Online Orders Panel</h2>
                      <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5 tracking-wider">Home Delivery & Takeaway</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowOnlineOrdersModal(false)}
                    className="text-xs font-black text-gray-400 hover:text-gray-650 dark:hover:text-slate-350 cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-4 border-t border-gray-100 dark:border-slate-800/60 pt-1">
                  <button
                    onClick={() => setOnlineTab('pending')}
                    className={`pb-2.5 text-xs font-black uppercase tracking-wider relative transition-all cursor-pointer ${
                      onlineTab === 'pending'
                        ? 'text-orange-650 dark:text-orange-400 border-b-2 border-orange-500'
                        : 'text-gray-400 hover:text-gray-650 dark:hover:text-slate-450'
                    }`}
                  >
                    Pending Orders ({pendingOnlineOrders.length})
                  </button>
                  <button
                    onClick={() => setOnlineTab('active')}
                    className={`pb-2.5 text-xs font-black uppercase tracking-wider relative transition-all cursor-pointer ${
                      onlineTab === 'active'
                        ? 'text-orange-650 dark:text-orange-400 border-b-2 border-orange-500'
                        : 'text-gray-400 hover:text-gray-650 dark:hover:text-slate-450'
                    }`}
                  >
                    Active & Tracking ({activeOnlineOrders.length})
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 max-h-[30rem] scrollbar-hide">
                {onlineTab === 'pending' ? (
                  pendingOnlineOrders.length === 0 ? (
                    <div className="text-center py-16 flex flex-col items-center gap-2">
                      <CheckCircle2 size={32} className="text-emerald-500" />
                      <p className="text-xs font-bold text-gray-400 dark:text-slate-500">No pending online orders right now.</p>
                    </div>
                  ) : (
                    pendingOnlineOrders.map((ord) => {
                      const totalAmt = ord.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
                      return (
                        <div key={ord.id} className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-gray-150 dark:border-slate-800/80 rounded-2xl flex flex-col gap-3">
                          <div className="flex justify-between items-start border-b border-gray-100 dark:border-slate-800 pb-2.5">
                            <div>
                              <span className={`font-black text-[9px] uppercase px-2.5 py-0.5 rounded-full border ${
                                ord.orderType === 'delivery'
                                  ? 'bg-blue-50 text-blue-650 border-blue-200/20 dark:bg-blue-950/25 dark:text-blue-400'
                                  : 'bg-amber-50 text-amber-700 border-amber-200/20 dark:bg-amber-950/25 dark:text-amber-400'
                              }`}>
                                {ord.orderType === 'delivery' ? 'Home Delivery' : 'Takeaway'}
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold ml-2">
                                {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                              ₹{totalAmt.toFixed(2)}
                            </span>
                          </div>

                          {/* Customer info & Delivery location */}
                          <div className="text-xs font-bold text-gray-600 dark:text-slate-350 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/50 p-2.5 rounded-xl flex flex-col gap-1">
                            <p><span className="text-gray-400">Name:</span> {ord.customerName} ({ord.customerPhone})</p>
                            {ord.orderType === 'delivery' ? (
                              <p><span className="text-gray-400">Address:</span> {ord.deliveryAddress}</p>
                            ) : (
                              <p><span className="text-gray-400">Pickup Time:</span> {ord.pickupTime}</p>
                            )}
                          </div>

                          {/* Items List */}
                          <div className="flex flex-col gap-1.5 pl-1.5">
                            {ord.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-[11px] font-bold text-gray-650 dark:text-slate-300">
                                <span>{item.menuItem?.name || item.name} <span className="text-indigo-600 dark:text-indigo-400 font-black">x{item.quantity}</span></span>
                                <span>₹{((item.menuItem?.price || item.price || 0) * item.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Verification Alert Info */}
                          <p className="text-[9px] text-orange-600 bg-orange-50 dark:bg-orange-950/30 border border-orange-200/20 px-2 py-1.5 rounded-xl font-bold">
                            ⚠️ Verify exact UPI amount (₹{totalAmt.toFixed(2)}) is received before confirming!
                          </p>

                          {/* Action Buttons */}
                          <div className="flex gap-2.5 mt-1 pt-2.5 border-t border-gray-100 dark:border-slate-800">
                            <button
                              onClick={() => handleRejectOnlineOrder(ord.id)}
                              className="flex-1 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/10 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-extrabold text-[10px] rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1 border border-red-200/10"
                            >
                              <XCircle size={12} />
                              Reject
                            </button>
                            <button
                              onClick={() => handleAcceptOnlineOrder(ord)}
                              className="flex-1 py-2 bg-green-650 hover:bg-green-755 text-white font-extrabold text-[10px] rounded-xl transition-all cursor-pointer flex justify-center items-center gap-1 shadow-md shadow-green-500/10 border border-white/5"
                            >
                              <CheckCircle2 size={12} />
                              Confirm & Print
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : (
                  activeOnlineOrders.length === 0 ? (
                    <div className="text-center py-16 flex flex-col items-center gap-2">
                      <p className="text-xs font-bold text-gray-400 dark:text-slate-500">No active delivery or takeaway orders.</p>
                    </div>
                  ) : (
                    activeOnlineOrders.map((ord) => {
                      const totalAmt = ord.items.reduce((sum: number, item: any) => sum + ((item.menuItem?.price || item.price || 0) * item.quantity), 0);
                      return (
                        <div key={ord.id} className="p-4 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 rounded-2xl flex flex-col gap-3.5 shadow-sm">
                          <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800/50 pb-2">
                            <div className="flex items-center gap-2">
                              <span className={`font-black text-[9px] uppercase px-2.5 py-0.5 rounded-full border ${
                                ord.orderType === 'delivery'
                                  ? 'bg-blue-50 text-blue-650 border-blue-200/20 dark:bg-blue-950/25 dark:text-blue-400'
                                  : 'bg-amber-50 text-amber-700 border-amber-200/20 dark:bg-amber-950/25 dark:text-amber-400'
                              }`}>
                                {ord.orderType === 'delivery' ? 'Home Delivery' : 'Takeaway'}
                              </span>
                              <span className={`font-black text-[9px] uppercase px-2.5 py-0.5 rounded-full border ${
                                ord.status === 'accepted' ? 'bg-yellow-50 text-yellow-600 border-yellow-200/25 dark:bg-yellow-950/25 dark:text-yellow-400' :
                                ord.status === 'preparing' ? 'bg-indigo-50 text-indigo-650 border-indigo-200/25 dark:bg-indigo-950/25 dark:text-indigo-400' :
                                'bg-blue-50 text-blue-600 border-blue-200/25 dark:bg-blue-950/25 dark:text-blue-400'
                              }`}>
                                {ord.status === 'accepted' ? 'Accepted' :
                                 ord.status === 'preparing' ? 'Preparing' :
                                 'Out for Delivery'}
                              </span>
                            </div>
                            <span className="text-xs font-black text-gray-800 dark:text-slate-200">₹{totalAmt.toFixed(2)}</span>
                          </div>

                          <div className="text-xs font-bold text-gray-650 dark:text-slate-350">
                            <p><span className="text-gray-400 font-medium">Customer:</span> {ord.customerName} ({ord.customerPhone})</p>
                            {ord.orderType === 'delivery' ? (
                              <p><span className="text-gray-400 font-medium">Address:</span> {ord.deliveryAddress}</p>
                            ) : (
                              <p><span className="text-gray-400 font-medium">Pickup Time:</span> {ord.pickupTime}</p>
                            )}
                          </div>

                          {/* Quick Workflow Action button to advance status */}
                          <div className="flex gap-2 justify-end mt-1">
                            {ord.status === 'accepted' && (
                              <button
                                onClick={() => handleUpdateOnlineOrderStatus(ord.id, 'preparing')}
                                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 text-indigo-650 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-indigo-100 dark:border-indigo-900/20"
                              >
                                👨‍🍳 Start Preparing
                              </button>
                            )}
                            {ord.status === 'preparing' && (
                              <button
                                onClick={() => handleUpdateOnlineOrderStatus(ord.id, 'dispatched')}
                                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-blue-650 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-blue-100 dark:border-blue-900/20"
                              >
                                🚚 Dispatch Order
                              </button>
                            )}
                            {(ord.status === 'dispatched' || (ord.orderType === 'takeaway' && ['accepted', 'preparing'].includes(ord.status))) && (
                              <button
                                onClick={() => handleUpdateOnlineOrderStatus(ord.id, 'delivered')}
                                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-650 dark:text-emerald-450 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-emerald-100 dark:border-emerald-900/20"
                              >
                                ✓ {ord.orderType === 'delivery' ? 'Mark Delivered' : 'Mark Picked Up'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick, disabled = false }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={() => { if (!disabled) onClick(); }}
      className={`relative flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all duration-300 shrink-0 group ${disabled
        ? 'opacity-40 cursor-not-allowed grayscale'
        : 'cursor-pointer ' + (active
          ? 'bg-gradient-to-r from-orange-500/10 to-orange-600/5 dark:from-orange-500/20 dark:to-orange-600/10 text-orange-600 dark:text-orange-400 shadow-sm'
          : 'text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800/50 hover:text-gray-600 dark:hover:text-slate-200')
      }`}
      title={disabled ? 'Available only when online' : ''}
    >
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-orange-500 to-orange-600 shadow-sm shadow-orange-500/30" />}
      <div className={`transition-all duration-300 ${active ? 'scale-110 -translate-y-0.5' : 'group-hover:scale-110 group-hover:-translate-y-0.5'}`}>{icon}</div>
      <span className={`text-[10px] mt-1 font-bold uppercase tracking-wider transition-all duration-300 ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{label}</span>
    </div>
  );
}

function MobileNavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`relative flex flex-col items-center justify-center w-14 sm:w-16 py-1 rounded-xl transition-all duration-300 cursor-pointer ${active ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}>
      <div className={`transition-all duration-300 ${active ? '-translate-y-1 scale-110 drop-shadow-md' : ''}`}>{icon}</div>
      <span className="text-xs mt-0.5 font-bold tracking-tight transition-all duration-300 opacity-90">{label}</span>
      {active && <div className="w-1 h-1 bg-orange-600 rounded-full mt-0.5 absolute bottom-1.5" />}
    </div>
  );
}

function MobileMenuButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200 cursor-pointer ${active ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30' : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 border border-transparent dark:border-slate-800'}`}>
      {icon}
      <span className="text-xs mt-1.5 font-bold text-center">{label}</span>
    </div>
  );
}
