import { useState, useEffect, useRef } from 'react';
import { db, initDb, setupRealtime, addSyncStatusListener, getSyncStatus, processPrintQueue } from '../db';
import { supabase } from '../supabase';
import { ThermalPrinter } from '../printer';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../components/Toast';
import { usePremium } from './usePremium';
import { parseAndValidateLicense } from '../utils/license';
import { logger } from '../utils/logger';

// Module-level reusable AudioContext to avoid resource leaks (H-10)
let _sharedAudioCtx: AudioContext | null = null;
export function getSharedAudioContext(): AudioContext {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return _sharedAudioCtx;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';
export type PrinterToastType = 'connected' | 'disconnected' | 'error';
export interface PrinterToast {
  show: boolean;
  type: PrinterToastType;
  message: string;
}

export function useAppSetup() {
  const { user, activeTab, setActiveTab } = useApp();
  const { showToast } = useToast();
  const premiumState = usePremium();
  const isAppLocked = premiumState.isExpired;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [announcement, setAnnouncement] = useState('');
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [blockedUntilEpoch, setBlockedUntilEpoch] = useState(0);
  const [blockWarningCount, setBlockWarningCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [printerToast, setPrinterToast] = useState<PrinterToast>({ show: false, type: 'connected', message: '' });
  const printerToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Online/Offline ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Sync status listener ---
  useEffect(() => {
    const removeSyncListener = addSyncStatusListener((status) => {
      setSyncStatus(status);
    });
    return removeSyncListener;
  }, []);

  // --- Block status ---
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

  useEffect(() => {
    if (user?.id) checkBlockStatus(user.id);
  }, [user?.id]);

  useEffect(() => {
    const handleRateLimit = () => { if (user?.id) handleRateLimitError(); };
    const handleBlocked = () => { if (user?.id) checkBlockStatus(user.id); };
    window.addEventListener('supabase-rate-limit-exceeded', handleRateLimit);
    window.addEventListener('supabase-account-blocked', handleBlocked);
    return () => {
      window.removeEventListener('supabase-rate-limit-exceeded', handleRateLimit);
      window.removeEventListener('supabase-account-blocked', handleBlocked);
    };
  }, [user?.id]);

  // --- Force subscription tab if locked ---
  useEffect(() => {
    if (isAppLocked && activeTab !== 'subscription') {
      setActiveTab('subscription');
    }
  }, [isAppLocked, activeTab, setActiveTab]);

  // --- New user trial setup ---
  useEffect(() => {
    const checkSubscriptionOnLoad = async () => {
      if (!premiumState.loading && premiumState.settings) {
        const settings = premiumState.settings;
        if (!settings.activationDate) {
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

  // --- License verification ---
  useEffect(() => {
    const verifyLicenseOnLoad = async () => {
      if (!premiumState.loading && premiumState.settings) {
        const settings = premiumState.settings;
        if (settings.subscriptionStatus === 'premium') {
          const licenseKey = settings.licenseKey || '';
          const restaurantCode = settings.restaurantCode || '';

          if (!licenseKey) {
            if (supabase && isOnline && user?.id) {
              try {
                const { data, error } = await supabase
                  .from('restaurant_profile')
                  .select('subscription_status, subscription_expiry, referral_claimed, referred_by')
                  .eq('app_user_id', user.id)
                  .maybeSingle();
                if (!error && data && data.subscription_status === 'premium' && Number(data.subscription_expiry) > Date.now()) {
                  if (settings.subscriptionStatus !== 'premium' || settings.subscriptionExpiry !== Number(data.subscription_expiry)) {
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
            logger.warn('[Subscription] No license key found and cloud verification failed.');
            await db.restaurantProfile.update('global', {
              subscriptionStatus: 'trial',
              subscriptionExpiry: Date.now() - 1000,
              licenseKey: ''
            }, true);
            showToast('Premium status could not be verified online. Please connect to the internet.', 'error');
            return;
          }

          const validation = await parseAndValidateLicense(licenseKey, restaurantCode);
          if (!validation.isValid) {
            if (validation.message.toLowerCase().includes('expired')) {
              if (settings.subscriptionExpiry > Date.now()) {
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
                  return;
                }
              }
            }
            logger.warn('[Subscription] Premium license validation failed:', validation.message);
            await db.restaurantProfile.update('global', {
              subscriptionStatus: 'trial',
              subscriptionExpiry: Date.now() - 1000,
              licenseKey: ''
            }, true);
            showToast(`License Invalid: ${validation.message}`, 'error');
          }
        }
      }
    };
    verifyLicenseOnLoad();
  }, [premiumState.loading, premiumState.settings, isOnline, user?.id]);

  // --- Global announcement polling ---
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
    const interval = setInterval(fetchAnnouncement, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // --- DB init and realtime setup ---
  useEffect(() => {
    if (user) {
      const setup = async () => {
        await initDb();
        if (user.id) setupRealtime(user.id);
      };
      setup();
    }
  }, [user]);

  // --- Printer toast helper ---
  const showPrinterToast = (type: PrinterToastType, message: string) => {
    if (printerToastTimerRef.current) clearTimeout(printerToastTimerRef.current);
    setPrinterToast({ show: true, type, message });
    printerToastTimerRef.current = setTimeout(() => {
      setPrinterToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // --- Printer auto-connect & events ---
  useEffect(() => {
    ThermalPrinter.autoConnect().then((ok) => {
      if (ok) showPrinterToast('connected', '🖨️ Printer auto-connected successfully!');
    });
    const handleConnect = () => {
      ThermalPrinter.autoConnect().then((ok) => {
        if (ok) {
          showPrinterToast('connected', '🖨️ Printer Connected! Ready to print.');
          processPrintQueue();
        } else {
          showPrinterToast('error', '⚠️ Printer detected but could not connect.');
        }
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

  return {
    isOnline,
    announcement,
    setAnnouncement,
    isUserBlocked,
    blockedUntilEpoch,
    blockWarningCount,
    setIsUserBlocked,
    setBlockedUntilEpoch,
    syncStatus,
    printerToast,
    setPrinterToast,
    showPrinterToast,
    premiumState,
    isAppLocked,
    handleRateLimitError,
    checkBlockStatus,
  };
}
