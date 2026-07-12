import { useLiveQuery, db } from '../db';

export interface PremiumState {
  isPremium: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysLeft: number;
  loading: boolean;
  settings: any;
}

export function usePremium(): PremiumState {
  const globalSettings = useLiveQuery(async () => {
    const profile = await db.restaurantProfile.get('global');
    const sys = await db.restaurantSettings.get('global');
    return { ...(profile || {}), ...(sys || {}) };
  }, [], ['restaurant_profile', 'restaurant_settings']);

  if (globalSettings === undefined) {
    return {
      isPremium: false,
      isTrial: false,
      isExpired: false,
      daysLeft: 0,
      loading: true,
      settings: null,
    };
  }

  // If no settings exist at all, default to non-expired trial state (it will be initialized in App.tsx)
  if (!globalSettings || Object.keys(globalSettings).length === 0) {
    return {
      isPremium: false,
      isTrial: true,
      isExpired: false,
      daysLeft: 3,
      loading: false,
      settings: null,
    };
  }

  const status = globalSettings.subscriptionStatus || 'trial';
  const expiry = globalSettings.subscriptionExpiry || (Date.now() + 3 * 24 * 60 * 60 * 1000);
  const now = Date.now();

  const isPremium = status === 'premium' && expiry > now;
  const isTrial = status === 'trial' && expiry > now;
  const isExpired = expiry <= now;

  const msLeft = Math.max(0, expiry - now);
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  return {
    isPremium,
    isTrial,
    isExpired,
    daysLeft,
    loading: false,
    settings: globalSettings,
  };
}
