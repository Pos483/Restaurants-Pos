import { supabase } from '../supabase';
import { localDb, notifyGlobalChange, getUserId, locallyCreatedIds } from './client';
import { getTable, db } from './hybridTable';
import { logger } from '../utils/logger';
import { handleCloudAutoPrint, startPrintQueueProcessor, stopPrintQueueProcessor } from './printQueue';

export const enqueueSync = async (_tableName: string, _action: 'put' | 'delete', _recordId: string, _recordData: Record<string, any> | null) => {
  // No-op in pure online mode
};

let currentSyncStatus: 'synced' | 'syncing' | 'offline' | 'error' = 'synced';
const syncStatusListeners = new Set<(status: 'synced' | 'syncing' | 'offline' | 'error') => void>();

export const getSyncStatus = (): 'synced' | 'syncing' | 'offline' | 'error' => {
  if (!navigator.onLine || !supabase) return 'offline';
  return currentSyncStatus;
};

export const setSyncStatus = (status: 'synced' | 'syncing' | 'offline' | 'error') => {
  currentSyncStatus = status;
  syncStatusListeners.forEach(fn => fn(status));
};

export const addSyncStatusListener = (callback: (status: 'synced' | 'syncing' | 'offline' | 'error') => void) => {
  syncStatusListeners.add(callback);
  callback(getSyncStatus());
  return () => {
    syncStatusListeners.delete(callback);
  };
};

export const processSyncQueue = async () => {
  // No-op in pure online mode
};

export const pullTable = async (tableName: string, userId: string) => {
  if (!supabase || !userId) return;
  try {
    const tableMapping = getTable(tableName);
    if (!tableMapping || tableMapping.onlineOnly) return;

    const largeTables = ['bills', 'stock_transactions', 'customer_transactions', 'expenses', 'kds_orders'];
    const isLargeTable = largeTables.includes(tableName);

    const lastSyncKey = `last_sync_${tableName}_${userId}`;
    const lastSync = isLargeTable ? localStorage.getItem(lastSyncKey) : null;
    const currentSyncTime = new Date().toISOString();

    let allRows: Record<string, any>[] = [];
    let from = 0;
    const limit = 1000;
    let hasError = false;

    while (true) {
      let query = supabase.from(tableName).select('*').eq('app_user_id', userId);
      if (lastSync) {
        query = query.gt('updated_at', lastSync);
      }
      query = query.order('updated_at', { ascending: true }).range(from, from + limit - 1);

      const { data, error } = await query;
      if (error) {
        console.error(`[pullTable] Error pulling table ${tableName}:`, error);
        hasError = true;
        break;
      }
      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
      } else {
        break;
      }
    }

    if (hasError) {
      return;
    }

    if (isLargeTable) {
      let maxUpdatedAt = lastSync;
      for (const row of allRows) {
        if (row.updated_at && (!maxUpdatedAt || row.updated_at > maxUpdatedAt)) {
          maxUpdatedAt = row.updated_at;
        }
      }
      localStorage.setItem(lastSyncKey, maxUpdatedAt || currentSyncTime);
    }

    if (allRows.length === 0) {
      if (!isLargeTable && tableName !== 'active_orders') {
        if (tableName !== 'restaurant_profile' && tableName !== 'restaurant_settings') {
          await localDb.table(tableName).clear();
        }
      }
      return;
    }

    const records = allRows.map(r => tableMapping.fromRow(r));
    const dexieTable = localDb.table(tableName);

    await localDb.transaction('rw', [dexieTable], async () => {
      if (records.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < records.length; i += chunkSize) {
          await dexieTable.bulkPut(records.slice(i, i + chunkSize));
        }
      }

      if (!isLargeTable) {
        const localItems = await dexieTable.toArray();
        const remoteIds = new Set(records.map(r => String(r.id)));

        for (const localItem of localItems) {
          const localId = String(localItem.id);
          if (!remoteIds.has(localId)) {
            if (tableName === 'restaurant_profile' || tableName === 'restaurant_settings') continue;
            if (localItem.id !== undefined) {
              await dexieTable.delete(localItem.id);
            }
          }
        }
      }
    });

    notifyGlobalChange(tableName);
  } catch (err) {
    console.error(`[pullTable] Fatal error in table ${tableName}:`, err);
  }
};

export const pullFromSupabase = async () => {
  if (!supabase || !navigator.onLine) return;
  const userId = getUserId();
  if (!userId) return;

  const tables = [
    'restaurant_profile',
    'restaurant_settings',
    'categories',
    'menu_items',
    'active_orders',
    'stock_items',
    'stock_transactions',
    'kds_orders',
    'bills',
    'customers',
    'customer_transactions',
    'expenses',
    'pos_customers'
  ];

  for (const tableName of tables) {
    await pullTable(tableName, userId);
  }
};

let pullTimeout: ReturnType<typeof setTimeout> | null = null;
export const triggerPull = () => {
  if (pullTimeout) clearTimeout(pullTimeout);
  pullTimeout = setTimeout(() => { pullFromSupabase(); }, 1000);
};

export const triggerSync = () => {
  // No-op in pure online mode
};

let autoPollInterval: ReturnType<typeof setInterval> | null = null;

export const startAutoPoll = (userId: string) => {
  if (autoPollInterval) return; // Already running
  if (!supabase || !userId) return;

  // Critical tables that need to stay in sync across devices
  const criticalTables = ['bills', 'customers', 'customer_transactions', 'active_orders'];

  autoPollInterval = setInterval(async () => {
    if (!navigator.onLine || !supabase) return;
    try {
      for (const table of criticalTables) {
        await pullTable(table, userId);
      }
    } catch (err) {
      // Silent — do not disrupt billing
      logger.warn('[AutoPoll] Pull failed silently:', err);
    }
  }, 30000); // Every 30 seconds

  logger.log('[AutoPoll] Started for userId:', userId);
};

export const stopAutoPoll = () => {
  if (autoPollInterval) {
    clearInterval(autoPollInterval);
    autoPollInterval = null;
    logger.log('[AutoPoll] Stopped');
  }
};

// ── Supabase Realtime (live updates from other devices) ───────────────────────

let realtimeSetup = false;
export const setupRealtime = (userId: string) => {
  if (!supabase || realtimeSetup || !userId) return;
  realtimeSetup = true;
  const tables = [
    'bills',
    'menu_items',
    'categories',
    'restaurant_profile',
    'restaurant_settings',
    'active_orders',
    'stock_items',
    'stock_transactions',
    'kds_orders',
    'customers',
    'customer_transactions',
    'expenses',
    'pos_customers',
    'self_orders',
    'online_orders'
  ];
  tables.forEach(table => {
    supabase!.channel(`rt_${table}`)
      .on('postgres_changes' as 'postgres_changes', { event: '*', schema: 'public', table, filter: `app_user_id=eq.${userId}` }, async (payload: { eventType: string; new: Record<string, any>; old: Record<string, any> }) => {
        try {
          const tableMapping = getTable(table);
          if (!tableMapping) return;

          if (tableMapping.onlineOnly) {
            notifyGlobalChange(table);
            return;
          }

          const dexieTable = localDb.table(table);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const localRecord = tableMapping.fromRow(payload.new);
            
            const isInsert = payload.eventType === 'INSERT';
            let isNewFromOtherDevice = false;
            if (isInsert && (table === 'bills' || table === 'kds_orders')) {
              const recordId = String(localRecord.id);
              const existing = await dexieTable.get(recordId);
              const isCloudPrintReceivingEnabled = localStorage.getItem('enableCloudPrintReceiving') !== 'false';
              if (!existing && !locallyCreatedIds.has(recordId) && !String(recordId).endsWith('-nocp') && isCloudPrintReceivingEnabled) {
                isNewFromOtherDevice = true;
              }
            }

            await dexieTable.put(localRecord);
            notifyGlobalChange(table);

            if (isNewFromOtherDevice && (window as unknown as { electronAPI?: unknown }).electronAPI) {
              handleCloudAutoPrint(table, localRecord);
            }
          } else if (payload.eventType === 'DELETE') {
            if (table !== 'restaurant_profile' && table !== 'restaurant_settings') {
              const idToDelete = table === 'active_orders' ? Number(payload.old.id) : payload.old.id;
              await dexieTable.delete(idToDelete);
              notifyGlobalChange(table);
            }
          }
        } catch (err) {
          console.error(`[Realtime] Error applying change to table ${table}:`, err);
        }
      })
      .subscribe();
  });
  logger.log('[Realtime] Subscriptions started for', userId);
};

export const cleanupRealtime = async () => {
  if (supabase) {
    try {
      await supabase.removeAllChannels();
    } catch (e) {
      console.error('[Realtime] Cleanup failed:', e);
    }
  }
  realtimeSetup = false;
  stopAutoPoll(); // Also stop the background polling
  stopPrintQueueProcessor();
  logger.log('[Realtime] Subscriptions cleaned up');
};

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      cleanupRealtime();
    }
  });
}

// ── initDb ────────────────────────────────────────────────────────────────────

export const initDb = async () => {
  const userId = getUserId();
  if (!userId || !supabase) return;

  setupRealtime(userId);
  startAutoPoll(userId); // Fallback polling every 30s for cross-device sync
  startPrintQueueProcessor();

  // Priority pull profile and settings to verify subscription status immediately
  if (navigator.onLine) {
    try {
      await pullTable('restaurant_profile', userId);
      await pullTable('restaurant_settings', userId);
    } catch (e) {
      console.error('[DB] Priority sync failed:', e);
    }
    // Trigger pull for remaining tables in the background
    pullFromSupabase();
  }

  // Check if local Dexie data migration to Supabase is needed
  const migrated = localStorage.getItem('dexie_migrated_to_supabase_v3');
  if (!migrated) {
    try {
      logger.log('[DB] Checking for local Dexie database to migrate...');
      const Dexie = (await import('dexie')).default;
      const dexieExists = await Dexie.exists('RestaurantPOS');
      if (dexieExists) {
        logger.log('[DB] Local Dexie database found! Initializing data migration...');
        const localDb = new Dexie('RestaurantPOS');
        localDb.version(1).stores({
          menuItems: 'id, name, category, isFavorite',
          categories: 'id, name',
          bills: 'id, tableId, timestamp, billNumber, customerPhone',
          settings: 'id',
          activeOrders: 'id, status',
          stockItems: 'id, name',
          stockTransactions: 'id, stockItemId, timestamp, relatedBillId',
          kdsOrders: 'id, tableOrType, timestamp, status, kotNumber',
        });
        await localDb.open();
        
        logger.log('[DB] Local database open. Migrating schemas to Supabase...');

        // 1. Settings (Migration mapping from old Dexie format to separated tables)
        const localSettings = await localDb.table('settings').toArray();
        if (localSettings.length > 0) {
          logger.log('[DB] Migrating settings:', localSettings.length);
          for (const s of localSettings) {
            await db.restaurantProfile.put({
              id: s.id,
              restaurantName: s.restaurantName,
              phone: s.phone,
              email: s.email,
              address: s.address,
              gstNumber: s.gstNumber || '',
              fssaiNumber: s.fssaiNumber || '',
              restaurantCode: s.restaurantCode,
              upiId: s.upiId,
              upiEnabled: s.upiEnabled,
              thankYouMessage: s.thankYouMessage,
              gstPercentage: s.gstPercentage || 0,
              subscriptionStatus: s.subscriptionStatus,
              subscriptionPlan: s.subscriptionPlan,
              subscriptionExpiry: s.subscriptionExpiry,
              licenseKey: s.licenseKey,
              activationDate: s.activationDate,
              referredByRewardGranted: s.referredByRewardGranted
            });
            await db.restaurantSettings.put({
              id: s.id,
              billSequence: s.billSequence || 1,
              kotSequence: s.kotSequence,
              lastKotDate: s.lastKotDate,
              printPhone: s.printPhone,
              printEmail: s.printEmail,
              printAddress: s.printAddress,
              printFssai: s.printFssai,
              printGst: s.printGst,
              printThankYou: s.printThankYou,
              printQrCode: s.printQrCode,
              baudRate: s.baudRate,
              printerWidth: s.printerWidth,
              printerMode: s.printerMode
            });
          }
        }

        // 2. Categories
        const localCategories = await localDb.table('categories').toArray();
        if (localCategories.length > 0) {
          logger.log('[DB] Migrating categories:', localCategories.length);
          await db.categories.bulkPut(localCategories);
        }

        // 3. Menu Items
        const localMenuItems = await localDb.table('menuItems').toArray();
        if (localMenuItems.length > 0) {
          logger.log('[DB] Migrating menu items:', localMenuItems.length);
          await db.menuItems.bulkPut(localMenuItems);
        }

        // 4. Bills
        const localBills = await localDb.table('bills').toArray();
        if (localBills.length > 0) {
          logger.log('[DB] Migrating bills:', localBills.length);
          await db.bills.bulkPut(localBills);
        }

        // 5. Stock Items
        const localStockItems = await localDb.table('stockItems').toArray();
        if (localStockItems.length > 0) {
          logger.log('[DB] Migrating stock items:', localStockItems.length);
          await db.stockItems.bulkPut(localStockItems);
        }

        // 6. Stock Transactions
        const localStockTransactions = await localDb.table('stockTransactions').toArray();
        if (localStockTransactions.length > 0) {
          logger.log('[DB] Migrating stock transactions:', localStockTransactions.length);
          await db.stockTransactions.bulkPut(localStockTransactions);
        }

        // 7. KDS Orders
        const localKdsOrders = await localDb.table('kdsOrders').toArray();
        if (localKdsOrders.length > 0) {
          logger.log('[DB] Migrating KDS orders:', localKdsOrders.length);
          await db.kdsOrders.bulkPut(localKdsOrders);
        }

        await localDb.close();
        logger.log('[DB] Local data successfully migrated to Supabase!');
      } else {
        logger.log('[DB] No local database found to migrate. Fresh install or already migrated.');
      }
      localStorage.setItem('dexie_migrated_to_supabase_v3', 'true');
    } catch (err) {
      console.error('[DB] Migration failed:', err);
    }
  }

  // Create default records if not exists on Supabase
  const existingProfile = await db.restaurantProfile.get('global');
  if (!existingProfile || !existingProfile.restaurantCode) {
    let rName = existingProfile?.restaurantName || '';
    let rPhone = existingProfile?.phone || '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata && !existingProfile) {
        rName = user.user_metadata.restaurant_name || '';
        rPhone = user.user_metadata.phone || '';
      }
    } catch (e) {}

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'RES-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await db.restaurantProfile.put({ 
      ...(existingProfile || {}),
      id: 'global', 
      restaurantName: rName,
      phone: rPhone,
      gstNumber: existingProfile?.gstNumber || '', 
      fssaiNumber: existingProfile?.fssaiNumber || '', 
      restaurantCode: existingProfile?.restaurantCode || code, 
      gstPercentage: existingProfile?.gstPercentage || 0 
    });
  }

  const existingSettings = await db.restaurantSettings.get('global');
  if (!existingSettings) {
    await db.restaurantSettings.put({
      id: 'global',
      billSequence: 1,
      baudRate: 9600,
      printerWidth: 32,
      printerMode: 'single',
      categoryLayout: 'sidebar'
    });
  }

  // Create 20 tables if not present
  const tablesCount = await db.activeOrders.count();
  if (tablesCount < 20) {
    const existingTables = await db.activeOrders.toArray();
    const existingIds = new Set(existingTables.map(t => t.id));
    const newOrders = [];
    for (let i = 1; i <= 20; i++) {
      if (!existingIds.has(i)) newOrders.push({ id: i, status: 'available' as const, orders: [] });
    }
    if (newOrders.length > 0) await db.activeOrders.bulkPut(newOrders);
  }

  logger.log('[DB] Supabase online database ready for:', userId);
};
