import { supabase } from '../supabase';
import { db, getUserId } from '../db';

export interface FestivalDiscountConfig {
  festivalDiscountEnabled: boolean;
  festivalDiscountName: string;
  festivalDiscountType: 'percentage' | 'amount';
  festivalDiscountValue: number | string;
  festivalDiscountMinOrder: number | string;
}

/**
 * Persists Festival & Auto Discount Offer settings both locally and to Supabase Cloud Server.
 * Uses a robust 3-tier cloud sync strategy:
 * 1. Supabase Auth user_metadata (Universal cloud server storage per restaurant account)
 * 2. Supabase 'settings' table (Persistent JSONB row under id: 'festival_discount')
 * 3. Supabase 'restaurant_profile' columns (if database schema migration has been applied)
 */
export const syncFestivalDiscountToServer = async (config: FestivalDiscountConfig): Promise<{
  success: boolean;
  serverSaved: boolean;
  message?: string;
}> => {
  const enabled = Boolean(config.festivalDiscountEnabled);
  const name = (config.festivalDiscountName || 'Festival Offer').trim();
  const type = (config.festivalDiscountType || 'percentage') as 'percentage' | 'amount';
  const numVal = Number(config.festivalDiscountValue) || 0;
  const numMin = Number(config.festivalDiscountMinOrder) || 0;

  // 1. Immediately persist locally (LocalStorage)
  try {
    localStorage.setItem('festivalDiscountEnabled', String(enabled));
    localStorage.setItem('festivalDiscountName', name);
    localStorage.setItem('festivalDiscountType', type);
    localStorage.setItem('festivalDiscountValue', String(numVal));
    localStorage.setItem('festivalDiscountMinOrder', String(numMin));
    localStorage.setItem('festivalDiscountLastSyncedAt', new Date().toISOString());
  } catch (_) {}

  // 2. Persist locally to Dexie (IndexedDB)
  try {
    const existing = (await db.restaurantProfile.get('global')) || { id: 'global' };
    await db.restaurantProfile.put({
      ...existing,
      id: 'global',
      festivalDiscountEnabled: enabled,
      festivalDiscountName: name,
      festivalDiscountType: type,
      festivalDiscountValue: numVal,
      festivalDiscountMinOrder: numMin
    } as any);
  } catch (err) {
    console.warn('[Festival] Local Dexie put note:', err);
  }

  // 3. Dispatch local event for instant UI reactivity across OrderMenu, QuickBilling, TableGrid, etc.
  window.dispatchEvent(new CustomEvent('festival-discount-changed', {
    detail: {
      enabled,
      name,
      type,
      value: numVal,
      minOrder: numMin
    }
  }));

  // 4. Cloud Server Persistence (Supabase)
  if (!supabase || !navigator.onLine) {
    localStorage.setItem('festivalDiscountServerSynced', 'false');
    return { success: true, serverSaved: false, message: 'Saved locally (Offline)' };
  }

  try {
    let userId = getUserId();
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || '';
    }

    if (!userId) {
      localStorage.setItem('festivalDiscountServerSynced', 'false');
      return { success: true, serverSaved: false, message: 'Saved locally (Not logged in)' };
    }

    const payload = {
      enabled,
      name,
      type,
      value: numVal,
      minOrder: numMin,
      updated_at: new Date().toISOString()
    };

    let serverSaved = false;

    // Strategy A: Supabase Auth user_metadata (Instant server persistence)
    try {
      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          festival_discount: payload
        }
      });
      if (!metaErr) {
        serverSaved = true;
      }
    } catch (e) {
      console.warn('[Festival] Cloud user_metadata sync note:', e);
    }

    // Strategy B: Supabase 'settings' table (JSONB record id: 'festival_discount')
    try {
      const { error: settingsErr } = await supabase
        .from('settings')
        .upsert({
          app_user_id: userId,
          id: 'festival_discount',
          data: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_user_id,id' });
      if (!settingsErr) {
        serverSaved = true;
      }
    } catch (e) {
      console.warn('[Festival] Cloud settings table sync note:', e);
    }

    // Strategy C: Supabase 'restaurant_profile' columns (if columns exist)
    try {
      const { error: profileErr } = await supabase
        .from('restaurant_profile')
        .update({
          festival_discount_enabled: enabled,
          festival_discount_name: name,
          festival_discount_type: type,
          festival_discount_value: numVal,
          festival_discount_min_order: numMin,
          updated_at: new Date().toISOString()
        })
        .eq('app_user_id', userId);
      if (!profileErr) {
        serverSaved = true;
      }
    } catch (e) {
      console.warn('[Festival] Cloud restaurant_profile table sync note:', e);
    }

    localStorage.setItem('festivalDiscountServerSynced', serverSaved ? 'true' : 'false');

    return {
      success: true,
      serverSaved,
      message: serverSaved ? 'Saved to Cloud Server' : 'Saved locally'
    };
  } catch (err: any) {
    console.error('[Festival] Cloud sync error:', err);
    return { success: true, serverSaved: false, message: err.message };
  }
};

/**
 * Fetches the active Festival & Auto Discount Offer configuration from the Supabase Cloud Server.
 * Checks settings table, restaurant_profile columns, and auth user_metadata.
 */
export const fetchFestivalDiscountFromServer = async (): Promise<FestivalDiscountConfig | null> => {
  if (!supabase || !navigator.onLine) return null;

  try {
    let userId = getUserId();
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || '';
    }
    if (!userId) return null;

    let remoteData: any = null;

    // Check 1: 'settings' table
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('app_user_id', userId)
        .eq('id', 'festival_discount')
        .maybeSingle();
      if (!error && data && data.data) {
        remoteData = data.data;
      }
    } catch (_) {}

    // Check 2: 'restaurant_profile' table columns
    if (!remoteData) {
      try {
        const { data, error } = await supabase
          .from('restaurant_profile')
          .select('festival_discount_enabled, festival_discount_name, festival_discount_type, festival_discount_value, festival_discount_min_order')
          .eq('app_user_id', userId)
          .maybeSingle();
        if (!error && data && data.festival_discount_enabled !== undefined && data.festival_discount_enabled !== null) {
          remoteData = {
            enabled: Boolean(data.festival_discount_enabled),
            name: data.festival_discount_name,
            type: data.festival_discount_type,
            value: data.festival_discount_value,
            minOrder: data.festival_discount_min_order
          };
        }
      } catch (_) {}
    }

    // Check 3: user_metadata
    if (!remoteData) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.festival_discount) {
          remoteData = user.user_metadata.festival_discount;
        }
      } catch (_) {}
    }

    if (!remoteData) return null;

    const config: FestivalDiscountConfig = {
      festivalDiscountEnabled: Boolean(remoteData.enabled),
      festivalDiscountName: remoteData.name || 'Festival Offer',
      festivalDiscountType: (remoteData.type || 'percentage') as 'percentage' | 'amount',
      festivalDiscountValue: remoteData.value !== undefined ? String(remoteData.value) : '10',
      festivalDiscountMinOrder: remoteData.minOrder !== undefined ? String(remoteData.minOrder) : '0'
    };

    // Hydrate local cache and Dexie
    localStorage.setItem('festivalDiscountEnabled', String(config.festivalDiscountEnabled));
    localStorage.setItem('festivalDiscountName', config.festivalDiscountName);
    localStorage.setItem('festivalDiscountType', config.festivalDiscountType);
    localStorage.setItem('festivalDiscountValue', String(config.festivalDiscountValue));
    localStorage.setItem('festivalDiscountMinOrder', String(config.festivalDiscountMinOrder));
    localStorage.setItem('festivalDiscountServerSynced', 'true');

    const existing = (await db.restaurantProfile.get('global')) || { id: 'global' };
    await db.restaurantProfile.put({
      ...existing,
      id: 'global',
      festivalDiscountEnabled: config.festivalDiscountEnabled,
      festivalDiscountName: config.festivalDiscountName,
      festivalDiscountType: config.festivalDiscountType,
      festivalDiscountValue: Number(config.festivalDiscountValue) || 0,
      festivalDiscountMinOrder: Number(config.festivalDiscountMinOrder) || 0
    } as any);

    window.dispatchEvent(new CustomEvent('festival-discount-changed', {
      detail: {
        enabled: config.festivalDiscountEnabled,
        name: config.festivalDiscountName,
        type: config.festivalDiscountType,
        value: Number(config.festivalDiscountValue) || 0,
        minOrder: Number(config.festivalDiscountMinOrder) || 0
      }
    }));

    return config;
  } catch (err) {
    console.error('[Festival] Error fetching from server:', err);
    return null;
  }
};
