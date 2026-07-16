import { useState, useEffect, lazy, Suspense } from 'react';
import { useApp } from './contexts/AppContext';
import { useTheme } from './contexts/ThemeContext';
import { useLiveQuery, db } from './db';
import { useAppSetup, getSharedAudioContext } from './hooks/useAppSetup';
import { AppLayout } from './components/AppLayout';
import { OrderItem } from './types';
import { Unplug } from 'lucide-react';
import { logger } from './utils/logger';
import PageLoader from './components/PageLoader';

// ── Eager imports (needed on first render) ───────────────────────────────────
import Dashboard from './components/Dashboard';
import OrderMenu from './components/OrderMenu';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import BlockedScreen from './components/BlockedScreen';
import PublicOrdering from './components/PublicOrdering';

// ── Lazy imports (loaded on first tab visit) ─────────────────────────────────
const QuickBilling       = lazy(() => import('./components/QuickBilling'));
const Menu               = lazy(() => import('./components/Menu'));
const RestaurantProfile  = lazy(() => import('./components/RestaurantProfile'));
const RestaurantSettings = lazy(() => import('./components/RestaurantSettings'));
const Reports            = lazy(() => import('./components/Reports'));
const KhataBook          = lazy(() => import('./components/KhataBook'));
const Customers          = lazy(() => import('./components/Customers'));
const StockManagement    = lazy(() => import('./components/StockManagement'));
const KOTManagement      = lazy(() => import('./components/KOTManagement'));
const HelpSupport        = lazy(() => import('./components/HelpSupport'));
const OnlineOrdersView   = lazy(() => import('./components/OnlineOrdersView'));
const Subscription       = lazy(() => import('./components/Subscription'));

export default function App() {
  const { user, activeTab, setActiveTab, loading, isRecoveryMode } = useApp();
  const { } = useTheme(); // keep ThemeProvider in context

  const setup = useAppSetup();
  const {
    isOnline, announcement, setAnnouncement,
    isUserBlocked, blockedUntilEpoch, blockWarningCount,
    setIsUserBlocked, setBlockedUntilEpoch,
    syncStatus, printerToast, setPrinterToast, showPrinterToast,
    premiumState, isAppLocked,
    handleRateLimitError, checkBlockStatus,
  } = setup;

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  const tables = useLiveQuery(() => db.activeOrders.toArray(), [], 'active_orders') || [];

  // Automatically assign a random 3-digit PIN to any table that doesn't have one
  useEffect(() => {
    tables.forEach(async (t) => {
      if (!t.tablePin) {
        try {
          await db.activeOrders.update(t.id, {
            tablePin: Math.floor(100 + Math.random() * 900).toString()
          });
        } catch (e) {
          console.error('Failed to set table pin:', e);
        }
      }
    });
  }, [tables]);

  const stockItemsList = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items') || [];
  const hasLowStock = stockItemsList.some(item => item.quantity < item.minThreshold);

  // ── Order handlers ───────────────────────────────────────────────────────

  const handleUpdateOrder = async (tableId: number, newOrders: OrderItem[]) => {
    try {
      await db.activeOrders.update(tableId, { orders: newOrders });
    } catch (err) {
      console.error('Failed to update order:', err);
    }
  };

  const handlePlaceOrder = async (tableId: number) => {
    try {
      await db.activeOrders.update(tableId, { status: 'occupied' });
      setActiveTab('tables');
    } catch (err) {
      console.error('Failed to place order:', err);
    }
  };

  const handleSettleBill = async (tableId: number, _paymentMethod: string) => {
    // Beep sound on settle — reuses shared AudioContext (H-10)
    try {
      const audioContext = getSharedAudioContext();
      if (audioContext.state === 'suspended') await audioContext.resume();
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      logger.warn('Beep sound failed:', e);
    }

    try {
      const result = await db.activeOrders.update(tableId, {
        status: 'available',
        orders: [],
        tablePin: Math.floor(100 + Math.random() * 900).toString()
      });
      if (!result) {
        console.error('Settle bill: update returned falsy — bill may not have been saved.');
      }
    } catch (err: any) {
      console.error('Failed to settle bill:', err);
      if (err?.message?.includes('RATE_LIMIT_EXCEEDED') && user?.id) {
        await handleRateLimitError();
        return;
      }
      if (err?.message?.includes('ACCOUNT_BLOCKED') && user?.id) {
        await checkBlockStatus(user.id);
      }
    }
  };

  // ── Early returns ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FAFBFC] dark:bg-[#0B0F19] transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-gray-500 dark:text-slate-400 font-bold text-lg">Loading Siya Bill...</div>
        </div>
      </div>
    );
  }

  // Check if we are on a customer ordering route using query params (avoiding relative path asset issues)
  const urlParams = new URLSearchParams(window.location.search);
  const qRestaurantCode = urlParams.get('r') || '';
  const qTableId = urlParams.get('t') || '';

  if (qRestaurantCode) {
    return (
      <PublicOrdering 
        restaurantCode={qRestaurantCode} 
        tableId={qTableId} 
        isOnline={isOnline}
      />
    );
  }

  // Handle old path redirection for backwards compatibility (will redirect to clean query params URL)
  if (window.location.pathname.startsWith('/order/')) {
    const parts = window.location.pathname.split('/').filter(Boolean); // ['order', 'restaurantCode', 'tableId']
    const restaurantCode = parts[1] || '';
    const tableId = parts[2] || '';
    if (restaurantCode) {
      const redirectUrl = tableId ? `/?r=${restaurantCode}&t=${tableId}` : `/?r=${restaurantCode}`;
      window.location.replace(redirectUrl);
      return null;
    }
  }

  if (!isOnline) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FAFBFC] dark:bg-[#0B0F19] p-6 text-center select-none transition-colors duration-300">
        <div className="max-w-md flex flex-col items-center gap-6 animate-fadeInUp">
          <div className="relative">
            <div className="w-24 h-24 bg-red-50 dark:bg-red-950/30 text-red-500 rounded-3xl flex items-center justify-center border border-red-100 dark:border-red-900/30 shadow-lg shadow-red-100 dark:shadow-none animate-pulse">
              <Unplug size={48} />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-black tracking-tight text-gray-800 dark:text-slate-100 uppercase">No Internet Connection</h1>
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400 leading-relaxed">
              Siya Bill system operates strictly in **Online-Only** mode. Active billing, cloud sync, and local POS services are currently suspended.
            </p>
          </div>
          <div className="w-full bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-800/60 p-4 rounded-2xl flex items-center justify-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            <span className="text-xs font-bold text-gray-600 dark:text-slate-400">Waiting for internet connection to restore...</span>
          </div>
        </div>
      </div>
    );
  }

  if (isRecoveryMode) return <ResetPasswordScreen />;
  if (!user) return <LoginScreen onLoginSuccess={() => {}} />;

  // ── Main App ─────────────────────────────────────────────────────────────

  return (
    <AppLayout
      isAppLocked={isAppLocked}
      isOnline={isOnline}
      announcement={announcement}
      setAnnouncement={setAnnouncement}
      syncStatus={syncStatus}
      printerToast={printerToast}
      setPrinterToast={setPrinterToast}
      showPrinterToast={showPrinterToast}
      premiumState={premiumState}
      hasLowStock={hasLowStock}
    >
      {/* BlockedScreen overlay — eager (critical) */}
      {isUserBlocked && blockedUntilEpoch > 0 && (
        <BlockedScreen
          blockedUntilEpoch={blockedUntilEpoch}
          warningCount={blockWarningCount}
          userId={user?.id || ''}
          onUnblocked={() => { setIsUserBlocked(false); setBlockedUntilEpoch(0); }}
        />
      )}

      {/* Eager tabs — always in initial bundle */}
      {activeTab === 'dashboard' && <Dashboard />}
      {activeTab === 'tables' && (
        <OrderMenu
          tables={tables}
          selectedTableId={selectedTableId}
          onSelectTable={setSelectedTableId}
          onUpdateOrder={handleUpdateOrder}
          onPlaceOrder={handlePlaceOrder}
          onSettleBill={handleSettleBill}
        />
      )}

      {/* Lazy tabs — loaded on first visit */}
      <Suspense fallback={<PageLoader />}>
        {activeTab === 'quick'        && <QuickBilling />}
        {activeTab === 'menu'         && <Menu />}
        {activeTab === 'profile'      && <RestaurantProfile />}
        {activeTab === 'settings'     && <RestaurantSettings />}
        {activeTab === 'reports'      && <Reports />}
        {activeTab === 'khata'        && <KhataBook />}
        {activeTab === 'customers'    && <Customers />}
        {activeTab === 'stock'        && <StockManagement />}
        {activeTab === 'kot'          && <KOTManagement />}
        {activeTab === 'help'         && <HelpSupport />}
        {activeTab === 'online_orders' && <OnlineOrdersView />}
        {activeTab === 'subscription' && (
          <Subscription
            subscriptionState={premiumState}
            onActivationSuccess={() => setActiveTab('dashboard')}
          />
        )}
      </Suspense>
    </AppLayout>
  );
}

