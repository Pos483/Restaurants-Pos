import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid, Utensils, BookOpen, HelpCircle, Crown, Sun, Moon } from 'lucide-react';
import OrderMenu from './components/OrderMenu';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import Menu from './components/Menu';
import QuickBilling from './components/QuickBilling';
import RestaurantProfile from './components/RestaurantProfile';
import RestaurantSettings from './components/RestaurantSettings';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import StockManagement from './components/StockManagement';
import KOTManagement from './components/KOTManagement';
import HelpSupport from './components/HelpSupport';
import Subscription from './components/Subscription';
import BlockedScreen from './components/BlockedScreen';
import KhataBook from './components/KhataBook';
import Customers from './components/Customers';
import { OrderItem } from './types';
import { Zap, LayoutDashboard, BarChart3, Printer, Package, ChefHat, Eye, Settings, Store, User as UserIcon, LogOut, CheckCircle2, XCircle, Unplug, AlertTriangle, Megaphone, Users } from 'lucide-react';
import { useLiveQuery, db, initDb, setupRealtime, addSyncStatusListener, getSyncStatus, processPrintQueue } from './db';
import { supabase } from './supabase';
import { ThermalPrinter } from './printer';
import { useApp } from './contexts/AppContext';
import { useTheme } from './contexts/ThemeContext';
import { usePremium } from './hooks/usePremium';
import { useToast } from './components/Toast';
import { parseAndValidateLicense } from './utils/license';
import { logger } from './utils/logger';

// Module-level reusable AudioContext to avoid resource leaks (H-10)
let _sharedAudioCtx: AudioContext | null = null;
function getSharedAudioContext(): AudioContext {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return _sharedAudioCtx;
}

export default function App() {
  const { 
    user, 
    activeTab, setActiveTab, 
    logout,
    loading,
    isRecoveryMode
  } = useApp();

  const { toggleTheme, isDark } = useTheme();
  const { showToast } = useToast();

  const premiumState = usePremium();
  const isAppLocked = premiumState.isExpired;

  const [announcement, setAnnouncement] = useState('');

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Block system state
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [blockedUntilEpoch, setBlockedUntilEpoch] = useState(0);
  const [blockWarningCount, setBlockWarningCount] = useState(0);

  const checkBlockStatus = async (userId: string) => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('user_rate_violations')
        .select('blocked_until, warning_count')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.blocked_until) {
        const epoch = Math.floor(new Date(data.blocked_until).getTime() / 1000);
        if (epoch > Math.floor(Date.now() / 1000)) {
          setIsUserBlocked(true);
          setBlockedUntilEpoch(epoch);
          setBlockWarningCount(data.warning_count || 5);
          return;
        }
      }
      setIsUserBlocked(false);
      setBlockedUntilEpoch(0);
    } catch (_) {
      // No violations record = not blocked
    }
  };

  const handleRateLimitError = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.rpc('record_rate_violation');
      if (data?.is_blocked) {
        setIsUserBlocked(true);
        setBlockedUntilEpoch(data.blocked_until_epoch || 0);
        setBlockWarningCount(data.warning_count || 5);
      } else if (data?.warning_count) {
        showToast(
          `⚠️ Warning ${data.warning_count}/5: Bill rate limit exceed hui. 5 violations ke baad account 2 ghante block hoga.`,
          'error'
        );
      }
    } catch (_) {}
  };

  // Load and poll global announcements
  useEffect(() => {
    const fetchAnnouncement = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('data')
          .eq('app_user_id', 'global')
          .eq('id', 'announcement')
          .maybeSingle();

        if (!error && data && data.data && data.data.message) {
          setAnnouncement(data.data.message);
        } else {
          setAnnouncement('');
        }
      } catch (err) {
        console.error('Failed to load global announcement:', err);
      }
    };

    fetchAnnouncement();
    
    // Poll for new broadcast announcements every 2 minutes
    const interval = setInterval(fetchAnnouncement, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Check block status on startup / user change
  useEffect(() => {
    if (user?.id) {
      checkBlockStatus(user.id);
    }
  }, [user?.id]);

  // Listen to background sync rate limit or block events
  useEffect(() => {
    const handleRateLimit = () => {
      if (user?.id) {
        handleRateLimitError();
      }
    };
    const handleBlocked = () => {
      if (user?.id) {
        checkBlockStatus(user.id);
      }
    };

    window.addEventListener('supabase-rate-limit-exceeded', handleRateLimit);
    window.addEventListener('supabase-account-blocked', handleBlocked);

    return () => {
      window.removeEventListener('supabase-rate-limit-exceeded', handleRateLimit);
      window.removeEventListener('supabase-account-blocked', handleBlocked);
    };
  }, [user?.id]);

  // Force active tab to subscription if expired
  useEffect(() => {
    if (isAppLocked && activeTab !== 'subscription') {
      setActiveTab('subscription');
    }
  }, [isAppLocked, activeTab, setActiveTab]);

  // New user 3-day Free Trial setup
  useEffect(() => {
    const checkSubscriptionOnLoad = async () => {
      if (!premiumState.loading && premiumState.settings) {
        const settings = premiumState.settings;
        if (!settings.activationDate) {
          // Initialize 3-day Trial for all new setups
          await db.restaurantProfile.update('global', {
            subscriptionStatus: 'trial',
            subscriptionPlan: 'free-trial',
            subscriptionExpiry: Date.now() + 3 * 24 * 60 * 60 * 1000,
            activationDate: Date.now(),
            licenseKey: ''
          });
          logger.log('🎁 New user trial initialized (3 days)!');
        }
      }
    };
    checkSubscriptionOnLoad();
  }, [premiumState.loading, premiumState.settings]);

  // License key verification on app load
  useEffect(() => {
    const verifyLicenseOnLoad = async () => {
      if (!premiumState.loading && premiumState.settings) {
        const settings = premiumState.settings;
        if (settings.subscriptionStatus === 'premium') {
          const licenseKey = settings.licenseKey || '';
          const restaurantCode = settings.restaurantCode || '';

          // If there is no license key, we must verify the premium status directly with Supabase
          if (!licenseKey) {
            if (supabase && isOnline && user?.id) {
              try {
                const { data, error } = await supabase
                  .from('restaurant_profile')
                  .select('subscription_status, subscription_expiry, referral_claimed, referred_by')
                  .eq('app_user_id', user.id)
                  .maybeSingle();

                if (!error && data && data.subscription_status === 'premium' && Number(data.subscription_expiry) > Date.now()) {
                  // Trust server, update local db if they differ
                  if (
                    settings.subscriptionStatus !== 'premium' ||
                    settings.subscriptionExpiry !== Number(data.subscription_expiry)
                  ) {
                    await db.restaurantProfile.update('global', {
                      subscriptionStatus: 'premium',
                      subscriptionExpiry: Number(data.subscription_expiry),
                      referralClaimed: !!data.referral_claimed,
                      referredBy: data.referred_by || undefined
                    }, true);
                  }
                  return;
                }
              } catch (err) {
                logger.error('[Subscription] Failed to verify premium status with cloud:', err);
              }
            }

            // If offline, or not premium on server, degrade to trial/expired locally
            logger.warn('[Subscription] No license key found and cloud verification failed.');
            await db.restaurantProfile.update('global', {
              subscriptionStatus: 'trial',
              subscriptionExpiry: Date.now() - 1000,
              licenseKey: ''
            }, true); // skipSync = true to prevent offline write failure or overwriting server
            showToast('Premium status could not be verified online. Please connect to the internet.', 'error');
            return;
          }

          // If there is a license key, validate its signature
          const validation = await parseAndValidateLicense(licenseKey, restaurantCode);
          if (!validation.isValid) {
            // If the license key itself expired, but the overall subscriptionExpiry was extended
            // (e.g. by a referral reward), check if it's still valid
            if (validation.message.toLowerCase().includes('expired')) {
              if (settings.subscriptionExpiry > Date.now()) {
                // Verify online if possible to prevent local tampering
                if (supabase && isOnline && user?.id) {
                  try {
                    const { data, error } = await supabase
                      .from('restaurant_profile')
                      .select('subscription_status, subscription_expiry')
                      .eq('app_user_id', user.id)
                      .maybeSingle();

                    if (!error && data && data.subscription_status === 'premium' && Number(data.subscription_expiry) > Date.now()) {
                      return;
                    }
                  } catch (err) {
                    logger.error('[Subscription] Failed to verify extended premium status with cloud:', err);
                  }
                } else {
                  // Offline, trust the local subscriptionExpiry for now
                  return;
                }
              }
            }

            logger.warn('[Subscription] Premium license validation failed:', validation.message);
            // Degrade status to trial with expired timestamp to lock access
            await db.restaurantProfile.update('global', {
              subscriptionStatus: 'trial',
              subscriptionExpiry: Date.now() - 1000,
              licenseKey: ''
            }, true); // skipSync = true
            showToast(`License Invalid: ${validation.message}`, 'error');
          }
        }
      }
    };
    verifyLicenseOnLoad();
  }, [premiumState.loading, premiumState.settings, isOnline, user?.id]);

  
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // H-9: Close profile dropdown on outside click
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>(getSyncStatus());




  useEffect(() => {
    const removeSyncListener = addSyncStatusListener((status) => {
      setSyncStatus(status);
    });
    return removeSyncListener;
  }, []);

  const [printerToast, setPrinterToast] = useState<{ show: boolean; type: 'connected' | 'disconnected' | 'error'; message: string }>({ show: false, type: 'connected', message: '' });
  const printerToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPrinterToast = (type: 'connected' | 'disconnected' | 'error', message: string) => {
    if (printerToastTimerRef.current) clearTimeout(printerToastTimerRef.current);
    setPrinterToast({ show: true, type, message });
    printerToastTimerRef.current = setTimeout(() => {
      setPrinterToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  useEffect(() => {
    if (user) {
      const setup = async () => {
        await initDb();
        if (user.id) {
          setupRealtime(user.id);
          
        }
      };
      setup();
    }
  }, [user]);



  const tables = useLiveQuery(() => db.activeOrders.toArray(), [], 'active_orders') || [];
  const stockItemsList = useLiveQuery(() => db.stockItems.toArray(), [], 'stock_items') || [];
  const hasLowStock = stockItemsList.some(item => item.quantity < item.minThreshold);

  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);
  const restaurantName = globalSettings?.restaurantName || 'SIYA BILL';

  useEffect(() => {
    ThermalPrinter.autoConnect().then((ok) => {
      if (ok) showPrinterToast('connected', '🖨️ Printer auto-connected successfully!');
    });
    const handleConnect = () => {
      ThermalPrinter.autoConnect().then((ok) => {
        if (ok) {
          showPrinterToast('connected', '🖨️ Printer Connected! Ready to print.');
          processPrintQueue();
        }
        else showPrinterToast('error', '⚠️ Printer detected but could not connect.');
      });
    };
    const handleDisconnect = () => {
      showPrinterToast('disconnected', '🔌 Printer Disconnected! Please reconnect.');
    };

    if ('serial' in navigator) {
      (navigator as any).serial.addEventListener('connect', handleConnect);
      (navigator as any).serial.addEventListener('disconnect', handleDisconnect);
    }

    return () => {
      if ('serial' in navigator) {
        (navigator as any).serial.removeEventListener('connect', handleConnect);
        (navigator as any).serial.removeEventListener('disconnect', handleDisconnect);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth state and session recovery are managed directly in AppContext.tsx



  const handleUpdateOrder = async (tableId: number, newOrders: OrderItem[]) => {
    try {
      await db.activeOrders.update(tableId, { orders: newOrders });
    } catch (err) {
      console.error('Failed to update order:', err);
      showToast('Failed to update order. Please try again.', 'error');
    }
  };

  const handlePlaceOrder = async (tableId: number) => {
    try {
      await db.activeOrders.update(tableId, { status: 'occupied' });
      setActiveTab('tables'); // Go back to tables view after placing order
    } catch (err) {
      console.error('Failed to place order:', err);
      showToast('Failed to place order. Please try again.', 'error');
    }
  };

  const handleSettleBill = async (tableId: number, _paymentMethod: string) => {
    // Generate beep sound for printing (optional) — reuses shared AudioContext (H-10)
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

    // H-7: Verify bill was saved before clearing orders
    try {
      const result = await db.activeOrders.update(tableId, { status: 'available', orders: [] });
      if (!result) {
        console.error('Settle bill: update returned falsy — bill may not have been saved.');
        showToast('Could not settle bill. Save could not be verified. Please try again.', 'error');
      }
    } catch (err: any) {
      console.error('Failed to settle bill:', err);
      if (err?.message?.includes('RATE_LIMIT_EXCEEDED') && user?.id) {
        await handleRateLimitError();
        return;
      }
      if (err?.message?.includes('ACCOUNT_BLOCKED') && user?.id) {
        await checkBlockStatus(user.id);
        return;
      }
      showToast('Failed to settle bill. Please try again.', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FAFBFC] dark:bg-[#0B0F19] transition-colors">
         <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-gray-500 dark:text-slate-400 font-bold text-lg">Loading Siya Bill...</div>
         </div>
      </div>
    );
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
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
            </span>
          </div>
          
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-black tracking-tight text-gray-800 dark:text-slate-100 uppercase">
              No Internet Connection
            </h1>
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400 leading-relaxed">
              Siya Bill system operates strictly in **Online-Only** mode. Active billing, cloud sync, and local POS services are currently suspended.
            </p>
          </div>

          <div className="w-full bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-800/60 p-4 rounded-2xl flex items-center justify-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></div>
            <span className="text-xs font-bold text-gray-600 dark:text-slate-400">
              Waiting for internet connection to restore...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (isRecoveryMode) {
    return <ResetPasswordScreen />;
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={() => {}} />;
  }

  return (
    <div className="flex h-screen bg-[#FAFBFC] dark:bg-[#0B0F19] font-sans text-gray-900 dark:text-slate-100 overflow-hidden transition-colors duration-300">
      {/* BlockedScreen overlay — takes priority over everything */}
      {isUserBlocked && blockedUntilEpoch > 0 && (
        <BlockedScreen
          blockedUntilEpoch={blockedUntilEpoch}
          warningCount={blockWarningCount}
          userId={user?.id || ''}
          onUnblocked={() => {
            setIsUserBlocked(false);
            setBlockedUntilEpoch(0);
          }}
        />
      )}
      {/* Desktop Sidebar (Hidden on Mobile) */}
      <div className="hidden md:flex w-[88px] glass-sidebar flex-col items-center py-4 z-10 transition-colors duration-300">
        <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-2.5 rounded-xl text-white mb-4 shadow-lg shadow-orange-200/50 dark:shadow-orange-900/30 shrink-0 glow-orange">
          <Utensils size={18} />
        </div>

        <nav className="flex flex-col gap-1 w-full px-2 overflow-y-auto scrollbar-hide pb-4">
          {isAppLocked ? (
            <NavItem icon={<Crown size={16} className="text-red-500 animate-pulse" />} label="Premium" active={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')} disabled={false} />
          ) : (
            <>
              <NavItem icon={<LayoutDashboard size={16} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} disabled={false} />
              <NavItem icon={<LayoutGrid size={16} />} label="Dine-In" active={activeTab === 'tables'} onClick={() => setActiveTab('tables')} disabled={false} />
              <NavItem icon={<Zap size={16} />} label="Quick" active={activeTab === 'quick'} onClick={() => setActiveTab('quick')} disabled={false} />
              <NavItem icon={<ChefHat size={16} />} label="Kitchen" active={activeTab === 'kot'} onClick={() => setActiveTab('kot')} disabled={false} />
              <NavItem icon={<BarChart3 size={16} />} label="Reports" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} disabled={false} />
              <NavItem icon={<Users size={16} />} label="Khata" active={activeTab === 'khata'} onClick={() => setActiveTab('khata')} disabled={false} />
              <NavItem icon={<UserIcon size={16} />} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} disabled={false} />
              <NavItem 
                icon={
                  <div className="relative">
                    <Package size={16} />
                    {hasLowStock && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                  </div>
                } 
                label="Stock" 
                active={activeTab === 'stock'} 
                onClick={() => setActiveTab('stock')} 
                disabled={false} 
              />
              <NavItem icon={<Store size={16} />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} disabled={false} />
              <NavItem icon={<Settings size={16} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} disabled={false} />
              <NavItem icon={<BookOpen size={16} />} label="Menu" active={activeTab === 'menu'} onClick={() => setActiveTab('menu')} disabled={false} />
              <NavItem icon={<HelpCircle size={16} />} label="Help" active={activeTab === 'help'} onClick={() => setActiveTab('help')} disabled={false} />
              <NavItem icon={<Crown size={16} className="text-amber-500" />} label="Premium" active={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')} disabled={false} />
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
            {/* Soft decorative background glow */}
            <div className="absolute inset-0 bg-white/10 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none"></div>
            
            <div className="flex items-center gap-3 relative z-10">
              <div className="bg-white/20 p-1.5 rounded-xl animate-bounce shadow-sm shrink-0">
                <Megaphone size={16} className="text-white" />
              </div>
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <span className="font-sans tracking-normal leading-relaxed text-slate-50 line-clamp-2 flex-1 min-w-0">{announcement}</span>
              </span>
            </div>
            
            <button 
              onClick={() => setAnnouncement('')} 
              className="hover:bg-white/25 bg-white/10 text-white text-xs font-black rounded-xl transition-all font-sans border border-white/20 px-3 py-1 relative z-10 active:scale-95 shrink-0 cursor-pointer shadow-sm hover:shadow"
            >
              Dismiss
            </button>
          </div>
        )}
        <header className="glass-header px-4 md:px-8 py-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 z-10 transition-colors duration-300">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl font-black text-gray-800 dark:text-slate-100 tracking-tight transition-colors truncate max-w-[240px] sm:max-w-[450px] lg:max-w-[600px]">{restaurantName.toUpperCase()}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs font-bold text-orange-500 tracking-widest uppercase">SIYA BILL SYSTEM</p>
              {syncStatus === 'synced' && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/40 transition-colors" title="Online: All data is backed up and synced to the cloud.">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                  Online
                </div>
              )}
              {syncStatus === 'syncing' && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40 animate-pulse transition-colors" title="Syncing: Syncing local edits to the cloud...">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></div>
                  Syncing to Cloud
                </div>
              )}

              {syncStatus === 'error' && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/40 transition-colors" title="Sync Error: Could not sync local edits. Please check your network or re-authenticate.">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce"></div>
                  Sync Error
                </div>
              )}

              {(syncStatus === 'offline' || !isOnline) && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/40 transition-colors" title="Offline: Using local cached data. Writes are disabled until connected.">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                  Offline
                </div>
              )}

              {premiumState.isTrial && !premiumState.isExpired && (
                <button 
                  onClick={() => setActiveTab('subscription')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 transition-colors cursor-pointer active:scale-95"
                  title="Click to activate premium"
                >
                  <Crown size={10} className="text-amber-500 fill-amber-500 animate-bounce" />
                  {premiumState.daysLeft} {premiumState.daysLeft === 1 ? 'Day' : 'Days'} Trial Left
                </button>
              )}

              {premiumState.isPremium && !premiumState.isTrial && (
                <button
                  onClick={() => setActiveTab('subscription')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter border shadow-sm bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40 transition-all cursor-pointer active:scale-95"
                  title="Click to view subscription details"
                >
                  <Crown size={10} className="text-indigo-500 fill-indigo-500 animate-pulse" />
                  Premium Active
                </button>
              )}
            </div>
          </div>

          {/* Centered Quick Billing Shortcut */}
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
              onClick={() => ThermalPrinter.connect(true).then(() => showPrinterToast('connected', '🖨️ Printer switched successfully!')).catch(() => showPrinterToast('error', '⚠️ Printer switch failed!'))}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-full font-bold border border-purple-100 dark:border-purple-900/30 transition-colors text-xs shadow-sm"
              title="View & Switch Printers"
            >
              <Eye size={14} />
              <span className="hidden lg:inline">View Printers</span>
            </button>
            <button
              onClick={() => ThermalPrinter.connect().then(() => showPrinterToast('connected', '🖨️ Printer Connected Successfully!')).catch(() => showPrinterToast('error', '⚠️ Printer connect failed! Check connection.'))}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-full font-bold border border-blue-100 dark:border-blue-900/30 transition-colors text-xs shadow-sm"
            >
              <Printer size={14} />
              <span className="hidden md:inline">Connect Printer</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all duration-300 text-gray-600 dark:text-slate-300 hover:text-orange-500 dark:hover:text-orange-400 border border-gray-200/50 dark:border-slate-700/50 shadow-sm"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="relative" ref={profileMenuRef}>
              <div
                className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center border border-indigo-200 dark:border-indigo-800/60 cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors shadow-sm"
                title={user?.email || 'User'}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                <span className="font-bold text-indigo-700 dark:text-indigo-300 text-sm">
                  {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </span>
              </div>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#0f172a] rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden z-50 transition-colors">
                  <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">Signed in as</p>
                    <p className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate mt-0.5">{user?.email}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => { setActiveTab('profile'); setShowProfileMenu(false); }}
                      className="w-full text-left px-3 py-2 text-sm font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <UserIcon size={16} /> Restaurant Profile
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors flex items-center gap-2 mt-1"
                    >
                      <LogOut size={16} /> Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 pt-6 pb-0 md:pb-6 overflow-y-auto h-full bg-[#FAFBFC] dark:bg-[#0B0F19] transition-colors duration-300">
          {activeTab === 'dashboard' && (
            <Dashboard />
          )}

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

          {activeTab === 'quick' && (
            <QuickBilling />
          )}

          {activeTab === 'menu' && (
            <Menu />
          )}

          {activeTab === 'profile' && (
            <RestaurantProfile />
          )}

          {activeTab === 'settings' && (
            <RestaurantSettings />
          )}

          {activeTab === 'reports' && (
            <Reports />
          )}

          {activeTab === 'khata' && (
            <KhataBook />
          )}

          {activeTab === 'customers' && (
            <Customers />
          )}

          {activeTab === 'stock' && (
            <StockManagement />
          )}

          {activeTab === 'kot' && (
            <KOTManagement />
          )}

          {activeTab === 'help' && (
            <HelpSupport />
          )}

          {activeTab === 'subscription' && (
            <Subscription 
              subscriptionState={premiumState} 
              onActivationSuccess={() => {
                setActiveTab('dashboard');
              }}
            />
          )}
        </main>



        {/* Printer Connection Toast Notification */}
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] transition-all duration-500 ease-out ${
            printerToast.show
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
          }`}
        >
          <div
            className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border-2 min-w-[280px] w-[90vw] max-w-[420px] backdrop-blur-xl transition-colors ${
              printerToast.type === 'connected'
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/60 dark:to-emerald-950/60 border-green-200 dark:border-green-800/50 shadow-green-100/50 dark:shadow-green-900/30'
                : printerToast.type === 'disconnected'
                ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/60 dark:to-orange-950/60 border-red-200 dark:border-red-800/50 shadow-red-100/50 dark:shadow-red-900/30'
                : 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/60 dark:to-yellow-950/60 border-amber-200 dark:border-amber-800/50 shadow-amber-100/50 dark:shadow-amber-900/30'
            }`}
          >
            <div
              className={`p-3 rounded-xl transition-colors ${
                printerToast.type === 'connected'
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
                  : printerToast.type === 'disconnected'
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
              }`}
            >
              {printerToast.type === 'connected' ? (
                <CheckCircle2 size={28} />
              ) : printerToast.type === 'disconnected' ? (
                <Unplug size={28} />
              ) : (
                <AlertTriangle size={28} />
              )}
            </div>
            <div className="flex-1">
              <p
                className={`font-black text-sm transition-colors ${
                  printerToast.type === 'connected'
                    ? 'text-green-800 dark:text-green-300'
                    : printerToast.type === 'disconnected'
                    ? 'text-red-800 dark:text-red-300'
                    : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                {printerToast.type === 'connected'
                  ? 'Printer Connected'
                  : printerToast.type === 'disconnected'
                  ? 'Printer Disconnected'
                  : 'Printer Error'}
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-400 font-medium mt-0.5 transition-colors">
                {printerToast.message}
              </p>
            </div>
            <button
              onClick={() => setPrinterToast(prev => ({ ...prev, show: false }))}
              className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors p-1"
              title="Close"
              aria-label="Close"
            >
              <XCircle size={20} />
            </button>
          </div>
          {/* Auto-dismiss progress bar */}
          {printerToast.show && (
            <div className="mt-1 h-1 rounded-full overflow-hidden bg-gray-200/50 dark:bg-slate-700/50 mx-4">
              <div
                className={`h-full rounded-full animate-shrink ${
                  printerToast.type === 'connected'
                    ? 'bg-green-400'
                    : printerToast.type === 'disconnected'
                    ? 'bg-red-400'
                    : 'bg-amber-400'
                }`}
              />
            </div>
          )}
        </div>


        {/* Mobile Bottom Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-slate-800/60 flex items-center justify-around py-2 px-1 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.3)] transition-colors duration-300">
          <MobileNavItem icon={<LayoutDashboard size={20} />} label="Dash" active={activeTab === 'dashboard'} onClick={() => {setActiveTab('dashboard'); setShowMobileMenu(false);}} />
          <MobileNavItem icon={<Zap size={20} />} label="Quick" active={activeTab === 'quick'} onClick={() => {setActiveTab('quick'); setShowMobileMenu(false);}} />
          <MobileNavItem icon={<LayoutGrid size={20} />} label="Dine-In" active={activeTab === 'tables'} onClick={() => {setActiveTab('tables'); setShowMobileMenu(false);}} />
          <MobileNavItem icon={<ChefHat size={20} />} label="KOT" active={activeTab === 'kot'} onClick={() => {setActiveTab('kot'); setShowMobileMenu(false);}} />
          <MobileNavItem icon={<Store size={20} />} label="More" active={showMobileMenu} onClick={() => setShowMobileMenu(!showMobileMenu)} />
        </div>

        {/* Mobile "More" Menu Modal */}
        {showMobileMenu && (
           <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)}></div>
              <div className="bg-white dark:bg-[#0f172a] rounded-t-3xl pb-[80px] pt-4 px-4 w-full relative animate-in slide-in-from-bottom-10 shadow-2xl transition-colors border-t border-gray-100 dark:border-slate-800">
                 <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full mx-auto mb-4"></div>
                 <h3 className="font-bold text-gray-800 dark:text-slate-100 px-2 mb-2">More Options</h3>
                 <div className="grid grid-cols-4 gap-2">
                    <MobileMenuButton icon={<BarChart3 size={20} />} label="Reports" active={activeTab === 'reports'} onClick={() => {setActiveTab('reports'); setShowMobileMenu(false);}} />
                    <MobileMenuButton icon={<Users size={20} />} label="Khata" active={activeTab === 'khata'} onClick={() => {setActiveTab('khata'); setShowMobileMenu(false);}} />
                    <MobileMenuButton icon={<UserIcon size={20} />} label="Customers" active={activeTab === 'customers'} onClick={() => {setActiveTab('customers'); setShowMobileMenu(false);}} />
                    <MobileMenuButton icon={<BookOpen size={20} />} label="Menu" active={activeTab === 'menu'} onClick={() => {setActiveTab('menu'); setShowMobileMenu(false);}} />
                    <MobileMenuButton 
                        icon={
                          <div className="relative">
                            <Package size={20} />
                            {hasLowStock && (
                              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                            )}
                          </div>
                        } 
                        label="Stock" 
                        active={activeTab === 'stock'} 
                        onClick={() => {setActiveTab('stock'); setShowMobileMenu(false);}} 
                     />
                    <MobileMenuButton icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => {setActiveTab('settings'); setShowMobileMenu(false);}} />
                    <MobileMenuButton icon={<Store size={20} />} label="Profile" active={activeTab === 'profile'} onClick={() => {setActiveTab('profile'); setShowMobileMenu(false);}} />
                    <MobileMenuButton icon={<HelpCircle size={20} />} label="Help" active={activeTab === 'help'} onClick={() => {setActiveTab('help'); setShowMobileMenu(false);}} />
                 </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
}

function MobileNavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center w-14 sm:w-16 py-1 rounded-xl transition-all duration-300 cursor-pointer ${
        active ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
      }`}
    >
      <div className={`transition-all duration-300 ${active ? '-translate-y-1 scale-110 drop-shadow-md' : ''}`}>
        {icon}
      </div>
      <span className="text-xs mt-0.5 font-bold tracking-tight transition-all duration-300 opacity-90">{label}</span>
      {active && <div className="w-1 h-1 bg-orange-600 rounded-full mt-0.5 absolute bottom-1.5"></div>}
    </div>
  );
}

function MobileMenuButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200 cursor-pointer ${
        active ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30' : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 border border-transparent dark:border-slate-800'
      }`}
    >
      {icon}
      <span className="text-xs mt-1.5 font-bold text-center">{label}</span>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, disabled = false }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, disabled?: boolean }) {
  return (
    <div
      onClick={() => { if (!disabled) onClick(); }}
      className={`relative flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all duration-300 shrink-0 group ${disabled
          ? 'opacity-40 cursor-not-allowed grayscale'
          : 'cursor-pointer ' + (active 
              ? 'bg-gradient-to-r from-orange-500/10 to-orange-600/5 dark:from-orange-500/20 dark:to-orange-600/10 text-orange-600 dark:text-orange-400 shadow-sm' 
              : 'text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800/50 hover:text-gray-600 dark:hover:text-slate-200')
        }`}
      title={disabled ? "Available only when online" : ""}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-orange-500 to-orange-600 shadow-sm shadow-orange-500/30" />
      )}
      <div className={`transition-all duration-300 ${active ? 'scale-110 -translate-y-0.5' : 'group-hover:scale-110 group-hover:-translate-y-0.5'}`}>
        {icon}
      </div>
      <span className={`text-[10px] mt-1 font-bold uppercase tracking-wider transition-all duration-300 ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{label}</span>
    </div>
  );
}
