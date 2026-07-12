import { useState, useEffect, useRef } from 'react';
import Dexie from 'dexie';
import { supabase } from './supabase';
export { supabase };
import { OrderItem, Table, getLocalDateString } from './types';
import { logger } from './utils/logger';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DBMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isActive: boolean;
  isFavorite?: boolean;
  variants?: { name: string; price: number; stockItemId?: string; stockQtyPerUnit?: number; isActive?: boolean }[];
  stockItemId?: string;
  stockQtyPerUnit?: number;
  dietary?: 'veg' | 'non-veg' | 'egg';
  printerTarget?: 'kitchen' | 'bar';
}

export interface DBCategory {
  id: string;
  name: string;
}

export interface DBBill {
  id: string;
  tableId: number | string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount?: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: string;
  timestamp: number;
  billNumber?: number;
  data?: any;
}

export interface DBRestaurantProfile {
  id: string;
  restaurantName?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber: string;
  fssaiNumber: string;
  restaurantCode?: string;
  upiId?: string;
  upiEnabled?: boolean;
  thankYouMessage?: string;
  gstPercentage: number;
  subscriptionStatus?: 'trial' | 'premium';
  subscriptionPlan?: 'free-trial' | 'monthly' | 'half-yearly' | 'yearly' | 'lifetime';
  subscriptionExpiry?: number;
  licenseKey?: string;
  activationDate?: number;
  referredByRewardGranted?: boolean;
  referredBy?: string;
  referralClaimed?: boolean;
}

export interface DBRestaurantSettings {
  id: string;
  billSequence: number;
  kotSequence?: number;
  lastKotDate?: string;
  printPhone?: boolean;
  printEmail?: boolean;
  printAddress?: boolean;
  printFssai?: boolean;
  printGst?: boolean;
  printThankYou?: boolean;
  printQrCode?: boolean;
  baudRate?: number;
  printerWidth?: number;
  printerMode?: 'single' | 'multiple';
  categoryLayout?: 'top' | 'sidebar';
}

export interface DBStockTransaction {
  id: string;
  stockItemId: string;
  type: 'in' | 'out';
  quantity: number;
  reason?: string;
  timestamp: number;
  relatedBillId?: string;
}

export interface DBStockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  lastUpdated: number;
}

export interface DBKdsOrder {
  id: string;
  tableOrType: string;
  items: OrderItem[];
  timestamp: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'delivered' | 'cancelled';
  kotNumber: string;
  completedAt?: number;
}

export interface DBCustomer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  balance: number;
  timestamp: number;
}

export interface DBCustomerTransaction {
  id: string;
  customerId: string;
  type: 'credit' | 'payment';
  amount: number;
  relatedBillId?: string;
  timestamp: number;
  note?: string;
}

// POS Customer Directory — tracks visit history and enables promotional messaging
export interface DBPosCustomer {
  id: string;
  name: string;
  phone: string;           // 10-digit normalized
  email?: string;
  address?: string;
  birthday?: string;       // "YYYY-MM-DD"
  visitCount: number;
  totalSpent: number;
  lastVisit: number;       // epoch ms
  createdAt: number;       // epoch ms
  tags?: string[];         // e.g. ["VIP", "Regular"]
  notes?: string;
}

export interface DBExpense {
  id: string;
  amount: number;
  category: string;
  paymentMethod: string;
  note?: string;
  timestamp: number;
}


// ── rescueBillItems ───────────────────────────────────────────────────────────

export const rescueBillItems = (bill: any): OrderItem[] => {
  let itemsToProcess: OrderItem[] = [];
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    itemsToProcess = bill.items;
  } else if (bill.data?.items && Array.isArray(bill.data.items)) {
    itemsToProcess = bill.data.items;
  }
  const uniqueItemsMap = new Map<string, OrderItem>();
  for (const item of itemsToProcess) {
    const anyItem = item as any;
    const baseId = anyItem?.menuItem?.id || anyItem?.id || Math.random().toString();
    const namePart = anyItem?.menuItem?.name || anyItem?.name || '';
    let itemKey = `${baseId}_${namePart}`;
    if (!uniqueItemsMap.has(itemKey)) {
      uniqueItemsMap.set(itemKey, JSON.parse(JSON.stringify(item)));
    } else {
      const existing = uniqueItemsMap.get(itemKey)!;
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
      if (item.printedQuantity) existing.printedQuantity = (existing.printedQuantity || 0) + item.printedQuantity;
    }
  }
  return Array.from(uniqueItemsMap.values());
};

// ── Local Date Formatter ──────────────────────────────────────────────────────

export { getLocalDateString };

// ── Global Live Query Engine ──────────────────────────────────────────────────

const tableListeners = new Map<string, Set<() => void>>();

export const notifyGlobalChange = (tableName?: string) => {
  if (tableName) {
    const listeners = tableListeners.get(tableName);
    if (listeners) {
      listeners.forEach(fn => fn());
    }
  }
};

export const getUserId = () => localStorage.getItem('activeUserId') || '';

// Bounded FIFO cache to track IDs of records mutated on this client (works in both offline and online-only modes)
class LocalIdCache {
  private ids: string[] = [];
  private max = 200;

  add(id: string | number) {
    const idStr = String(id);
    if (!this.ids.includes(idStr)) {
      this.ids.push(idStr);
      if (this.ids.length > this.max) {
        this.ids.shift();
      }
    }
  }

  has(id: string | number): boolean {
    return this.ids.includes(String(id));
  }
}

export const locallyCreatedIds = new LocalIdCache();

// ── Local Database Schema ────────────────────────────────────────────────────

export const localDb = new Dexie('RestaurantPOS_v3');
localDb.version(1).stores({
  bills: 'id, tableId, timestamp, paymentMethod, customerPhone, billNumber',
  menu_items: 'id, name, category, isActive, isFavorite',
  categories: 'id, name',
  restaurant_profile: 'id',
  restaurant_settings: 'id',
  active_orders: 'id, status',
  stock_items: 'id, name, quantity',
  stock_transactions: 'id, stockItemId, timestamp, relatedBillId',
  kds_orders: 'id, status, timestamp, kotNumber',
  syncQueue: '++id, tableName, action, recordId, timestamp'
});

localDb.version(2).stores({
  customers: 'id, name, phone, timestamp',
  customer_transactions: 'id, customerId, timestamp, relatedBillId',
  expenses: 'id, category, timestamp, paymentMethod'
});

localDb.version(3).stores({
  carts: 'userId'  // Stores active cart per user; key = userId
});

localDb.version(4).stores({
  pos_customers: 'id, phone, name, lastVisit, visitCount, totalSpent, createdAt'
});

localDb.version(5).stores({
  print_queue: 'id, type, status, timestamp'
});



// ── Sync Queue Interfaces & Engine ───────────────────────────────────────────

export interface SyncQueueItem {
  id?: number;
  tableName: string;
  action: 'put' | 'delete';
  recordId: string;
  recordData: any;
  timestamp: number;
  retryCount?: number;
}

export const enqueueSync = async (_tableName: string, _action: 'put' | 'delete', _recordId: string, _recordData: any) => {
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

    let allRows: any[] = [];
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
        const remoteIds = new Set(records.map(r => String((r as any).id)));

        for (const localItem of localItems) {
          const localId = String((localItem as any).id);
          if (!remoteIds.has(localId)) {
            if (tableName === 'restaurant_profile' || tableName === 'restaurant_settings') continue;
            await dexieTable.delete((localItem as any).id);
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


// ── Auto-Poll: Pull new bills from other devices every 30 seconds ─────────────
// Supabase Realtime is the primary mechanism, but Realtime requires the table
// to be added to the publication in Supabase Dashboard. This polling is a
// reliable fallback — silently syncs critical tables in the background so that
// bills created on another PC show up on the dashboard automatically.

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

// ── HybridTable Class ────────────────────────────────────────────────────────

class HybridTable<T> {
  public dexieTable: Dexie.Table<T, any>;

  constructor(
    private tableName: string,
    public toRow: (record: T, userId: string) => any,
    public fromRow: (row: any) => T,
    public onlineOnly: boolean = false
  ) {
    this.dexieTable = localDb.table(tableName);
  }

  async toArray(): Promise<T[]> {
    if (this.onlineOnly) {
      if (!supabase || !navigator.onLine) return [];
      const userId = getUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('app_user_id', userId);
      if (error) {
        console.error(`[HybridTable.toArray] Error fetching ${this.tableName}:`, error);
        return [];
      }
      return (data || []).map(r => this.fromRow(r));
    }
    return await this.dexieTable.toArray();
  }

  async get(id: string | number): Promise<T | null> {
    if (this.onlineOnly) {
      if (!supabase || !navigator.onLine) return null;
      const userId = getUserId();
      if (!userId) return null;
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('app_user_id', userId)
        .eq('id', String(id))
        .maybeSingle();
      if (error) {
        console.error(`[HybridTable.get] Error fetching ${this.tableName} ${id}:`, error);
        return null;
      }
      return data ? this.fromRow(data) : null;
    }
    const record = await this.dexieTable.get(id);
    return record || null;
  }

  async add(record: T): Promise<any> {
    if (this.tableName === 'bills') {
      const b = record as any;
      if (b.items && Array.isArray(b.items)) {
        for (const item of b.items) {
          const qty = item.quantity || 0;
          if (qty > 10000) {
            const name = item.menuItem?.name || item.name || 'Item';
            throw new Error(`${name} quantity ${qty} exceeds the allowed limit`);
          }
        }
      }
    }

    if (!supabase || !navigator.onLine) {
      throw new Error("Internet is disconnected or the server is unavailable.");
    }
    const userId = getUserId();
    if (!userId) {
      throw new Error("No user is logged in. Cannot write to server.");
    }

    const id = (record as any).id || crypto.randomUUID();
    locallyCreatedIds.add(id);
    const finalRecord = { ...record, id };

    if (this.onlineOnly) {
      const row = this.toRow(finalRecord, userId);
      const { error } = await supabase.from(this.tableName).upsert(row, { onConflict: 'app_user_id,id' });
      if (error) {
        throw error;
      }
      notifyGlobalChange(this.tableName);
      return id;
    }

    // 1. Save locally in Dexie first (to prevent double printing on Supabase Realtime echo)
    await this.dexieTable.put(finalRecord);
    notifyGlobalChange(this.tableName);

    // 2. Write to Supabase synchronously
    const row = this.toRow(finalRecord, userId);
    const { error } = await supabase.from(this.tableName).upsert(row, { onConflict: 'app_user_id,id' });
    if (error) {
      // Rollback local Dexie write on server failure
      await this.dexieTable.delete(id);
      notifyGlobalChange(this.tableName);

      const errMsg = error.message || '';
      if (errMsg.includes('RATE_LIMIT_EXCEEDED')) {
        window.dispatchEvent(new CustomEvent('supabase-rate-limit-exceeded', { detail: { userId } }));
      }
      if (errMsg.includes('ACCOUNT_BLOCKED')) {
        window.dispatchEvent(new CustomEvent('supabase-account-blocked', { detail: { userId } }));
      }
      throw new Error("Server sync failed: " + errMsg);
    }

    return id;
  }

  async put(record: T): Promise<any> {
    const id = (record as any).id;
    if (!id) throw new Error('Cannot put a record without id');
    locallyCreatedIds.add(id);

    if (this.tableName === 'bills') {
      const b = record as any;
      if (b.items && Array.isArray(b.items)) {
        for (const item of b.items) {
          const qty = item.quantity || 0;
          if (qty > 10000) {
            const name = item.menuItem?.name || item.name || 'Item';
            throw new Error(`${name} quantity ${qty} exceeds the allowed limit`);
          }
        }
      }
    }

    // Lock restaurantCode for profile table to make it immutable (treat like User ID)
    if (this.tableName === 'restaurant_profile') {
      const existing = await this.dexieTable.get(id);
      if (existing && (existing as any).restaurantCode) {
        (record as any).restaurantCode = (existing as any).restaurantCode;
      }
    }

    if (!supabase || !navigator.onLine) {
      throw new Error("Internet is disconnected or the server is unavailable.");
    }
    const userId = getUserId();
    if (!userId) {
      throw new Error("No user is logged in. Cannot write to server.");
    }

    if (this.onlineOnly) {
      const row = this.toRow(record, userId);
      const { error } = await supabase.from(this.tableName).upsert(row, { onConflict: 'app_user_id,id' });
      if (error) {
        throw error;
      }
      notifyGlobalChange(this.tableName);
      return id;
    }

    const previousRecord = await this.dexieTable.get(id);

    // 1. Save locally in Dexie first (to prevent double printing on Supabase Realtime echo)
    await this.dexieTable.put(record);
    notifyGlobalChange(this.tableName);

    // 2. Write to Supabase synchronously
    const row = this.toRow(record, userId);
    const { error } = await supabase.from(this.tableName).upsert(row, { onConflict: 'app_user_id,id' });
    if (error) {
      // Rollback local Dexie write on server failure
      if (previousRecord) {
        await this.dexieTable.put(previousRecord);
      } else {
        await this.dexieTable.delete(id);
      }
      notifyGlobalChange(this.tableName);

      const errMsg = error.message || '';
      if (errMsg.includes('RATE_LIMIT_EXCEEDED')) {
        window.dispatchEvent(new CustomEvent('supabase-rate-limit-exceeded', { detail: { userId } }));
      }
      if (errMsg.includes('ACCOUNT_BLOCKED')) {
        window.dispatchEvent(new CustomEvent('supabase-account-blocked', { detail: { userId } }));
      }
      throw new Error("Server sync failed: " + errMsg);
    }

    return id;
  }

  async update(id: string | number, changes: Partial<T>, skipSync: boolean = false): Promise<any> {
    locallyCreatedIds.add(id);
    // Lock restaurantCode for profile table to make it immutable (treat like User ID)
    if (this.tableName === 'restaurant_profile') {
      const existing = await this.dexieTable.get(id);
      if (existing && (existing as any).restaurantCode) {
        delete (changes as any).restaurantCode;
      }
    }

    if (this.onlineOnly) {
      if (!supabase || !navigator.onLine) {
        throw new Error("Internet disconnect hai ya server unavailable hai.");
      }
      const userId = getUserId();
      if (!userId) {
        throw new Error("No user is logged in. Cannot write to server.");
      }

      const existing = await this.get(id);
      if (!existing) throw new Error('Record not found');
      const updatedRecord = { ...existing, ...changes };

      const row = this.toRow(updatedRecord, userId);
      const { error } = await supabase.from(this.tableName).upsert(row, { onConflict: 'app_user_id,id' });
      if (error) {
        throw error;
      }
      notifyGlobalChange(this.tableName);
      return 1;
    }

    const previousRecord = await this.dexieTable.get(id);
    if (!previousRecord) throw new Error('Record not found locally');
    const updatedRecord = { ...previousRecord, ...changes };

    // 1. Save locally in Dexie first (to prevent double printing on Supabase Realtime echo)
    await this.dexieTable.update(id, changes as any);
    notifyGlobalChange(this.tableName);

    if (!skipSync) {
      if (!supabase || !navigator.onLine) {
        // Rollback local update
        await this.dexieTable.put(previousRecord);
        notifyGlobalChange(this.tableName);
        throw new Error("Internet disconnect hai ya server unavailable hai.");
      }
      const userId = getUserId();
      if (!userId) {
        // Rollback local update
        await this.dexieTable.put(previousRecord);
        notifyGlobalChange(this.tableName);
        throw new Error("No user is logged in. Cannot write to server.");
      }

      // 2. Write to Supabase synchronously
      const row = this.toRow(updatedRecord, userId);
      const { error } = await supabase.from(this.tableName).upsert(row, { onConflict: 'app_user_id,id' });
      if (error) {
        // Rollback local update on failure
        await this.dexieTable.put(previousRecord);
        notifyGlobalChange(this.tableName);

        const errMsg = error.message || '';
        if (errMsg.includes('RATE_LIMIT_EXCEEDED')) {
          window.dispatchEvent(new CustomEvent('supabase-rate-limit-exceeded', { detail: { userId } }));
        }
        if (errMsg.includes('ACCOUNT_BLOCKED')) {
          window.dispatchEvent(new CustomEvent('supabase-account-blocked', { detail: { userId } }));
        }
        throw new Error("Server sync failed: " + errMsg);
      }
    }

    return 1;
  }

  async delete(id: string | number): Promise<void> {
    if (!supabase || !navigator.onLine) {
      throw new Error("Internet disconnect hai ya server unavailable hai.");
    }
    const userId = getUserId();
    if (!userId) {
      throw new Error("No user is logged in. Cannot write to server.");
    }

    if (this.onlineOnly) {
      const { error } = await supabase.from(this.tableName).delete().eq('app_user_id', userId).eq('id', String(id));
      if (error) {
        throw error;
      }
      notifyGlobalChange(this.tableName);
      return;
    }

    // 1. Delete on Supabase synchronously first
    const { error } = await supabase.from(this.tableName).delete().eq('app_user_id', userId).eq('id', String(id));
    if (error) {
      throw new Error("Server delete failed: " + error.message);
    }

    // 2. Delete locally in Dexie only on success
    await this.dexieTable.delete(id);
    notifyGlobalChange(this.tableName);
  }

  async bulkPut(records: T[]): Promise<void> {
    if (records.length === 0) return;
    records.forEach(r => {
      if ((r as any).id) locallyCreatedIds.add((r as any).id);
    });

    if (!this.onlineOnly) {
      await this.dexieTable.bulkPut(records);
    }
    notifyGlobalChange(this.tableName);

    if (supabase && navigator.onLine) {
      const userId = getUserId();
      if (userId) {
        const rows = records.map(record => this.toRow(record, userId));
        const { error } = await supabase.from(this.tableName).upsert(rows, { onConflict: 'app_user_id,id' });
        if (error) {
          const errMsg = error.message || '';
          if (errMsg.includes('RATE_LIMIT_EXCEEDED')) {
            window.dispatchEvent(new CustomEvent('supabase-rate-limit-exceeded', { detail: { userId } }));
          }
          if (errMsg.includes('ACCOUNT_BLOCKED')) {
            window.dispatchEvent(new CustomEvent('supabase-account-blocked', { detail: { userId } }));
          }
          throw error;
        }
      } else {
        throw new Error("No user is logged in. Cannot write to server.");
      }
    } else {
      throw new Error("Internet disconnect hai ya server unavailable hai.");
    }
  }

  async count(): Promise<number> {
    if (this.onlineOnly) {
      if (!supabase || !navigator.onLine) return 0;
      const userId = getUserId();
      if (!userId) return 0;
      const { count, error } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('app_user_id', userId);
      if (error) {
        console.error(`[HybridTable.count] Error:`, error);
        return 0;
      }
      return count || 0;
    }
    return await this.dexieTable.count();
  }

  where(field: string) {
    const self = this;
    return {
      equals(value: any) {
        return {
          toArray: async () => {
            if (self.onlineOnly) {
              if (!supabase || !navigator.onLine) return [];
              const userId = getUserId();
              if (!userId) return [];
              const { data, error } = await supabase
                .from(self.tableName)
                .select('*')
                .eq('app_user_id', userId)
                .eq(field, value);
              if (error) {
                console.error(`[HybridTable.where.equals.toArray] Error:`, error);
                return [];
              }
              return (data || []).map(r => self.fromRow(r));
            }
            return await self.dexieTable.where(field).equals(value).toArray();
          },
          count: async () => {
            if (self.onlineOnly) {
              if (!supabase || !navigator.onLine) return 0;
              const userId = getUserId();
              if (!userId) return 0;
              const { count, error } = await supabase
                .from(self.tableName)
                .select('*', { count: 'exact', head: true })
                .eq('app_user_id', userId)
                .eq(field, value);
              if (error) {
                console.error(`[HybridTable.where.equals.count] Error:`, error);
                return 0;
              }
              return count || 0;
            }
            return await self.dexieTable.where(field).equals(value).count();
          },
          first: async () => {
            if (self.onlineOnly) {
              if (!supabase || !navigator.onLine) return null;
              const userId = getUserId();
              if (!userId) return null;
              const { data, error } = await supabase
                .from(self.tableName)
                .select('*')
                .eq('app_user_id', userId)
                .eq(field, value)
                .limit(1)
                .maybeSingle();
              if (error) {
                console.error(`[HybridTable.where.equals.first] Error:`, error);
                return null;
              }
              return data ? self.fromRow(data) : null;
            }
            return (await self.dexieTable.where(field).equals(value).first()) || null;
          },
          delete: async () => {
            if (self.onlineOnly) {
              if (!supabase || !navigator.onLine) return;
              const userId = getUserId();
              if (!userId) return;
              const { error } = await supabase
                .from(self.tableName)
                .delete()
                .eq('app_user_id', userId)
                .eq(field, value);
              if (error) throw error;
              notifyGlobalChange(self.tableName);
              return;
            }
            const items = await self.dexieTable.where(field).equals(value).toArray();
            for (const item of items) await self.delete((item as any).id);
          },
        };
      },
      above(value: any) {
        return {
          toArray: async () => {
            if (self.onlineOnly) {
              if (!supabase || !navigator.onLine) return [];
              const userId = getUserId();
              if (!userId) return [];
              const { data, error } = await supabase
                .from(self.tableName)
                .select('*')
                .eq('app_user_id', userId)
                .gt(field, value);
              if (error) {
                console.error(`[HybridTable.where.above.toArray] Error:`, error);
                return [];
              }
              return (data || []).map(r => self.fromRow(r));
            }
            return await self.dexieTable.where(field).above(value).toArray();
          }
        };
      },
      between(lower: any, upper: any, includeLower?: boolean, includeUpper?: boolean) {
        return {
          toArray: async () => {
            if (self.onlineOnly) {
              if (!supabase || !navigator.onLine) return [];
              const userId = getUserId();
              if (!userId) return [];
              let query = supabase
                .from(self.tableName)
                .select('*')
                .eq('app_user_id', userId);
              
              if (includeLower !== false) query = query.gte(field, lower);
              else query = query.gt(field, lower);

              if (includeUpper !== false) query = query.lte(field, upper);
              else query = query.lt(field, upper);

              const { data, error } = await query;
              if (error) {
                console.error(`[HybridTable.where.between.toArray] Error:`, error);
                return [];
              }
              return (data || []).map(r => self.fromRow(r));
            }
            return await self.dexieTable.where(field).between(lower, upper, includeLower, includeUpper).toArray();
          }
        };
      }
    };
  }

  filter(fn: (item: T) => boolean) {
    const self = this;
    return { toArray: async () => (await self.toArray()).filter(fn) };
  }

  orderBy(field: string) {
    const self = this;
    return {
      toArray: async () => (await self.toArray()).sort((a: any, b: any) => a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0)
    };
  }
}

// ── Table Definitions ─────────────────────────────────────────────────────────

const billsTable = new HybridTable<DBBill>(
  'bills',
  (b, uid) => ({ app_user_id: uid, id: b.id, table_id: String(b.tableId), items: b.items ?? [], subtotal: b.subtotal, tax: b.tax, total: b.total, discount: b.discount ?? 0, customer_name: b.customerName ?? null, customer_phone: b.customerPhone ?? null, payment_method: b.paymentMethod, timestamp: b.timestamp, bill_number: b.billNumber ?? null, data: b.data ?? {}, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, tableId: /^\d+$/.test(r.table_id) ? Number(r.table_id) : r.table_id, items: r.items ?? [], subtotal: Number(r.subtotal), tax: Number(r.tax), total: Number(r.total), discount: Number(r.discount ?? 0), customerName: r.customer_name ?? undefined, customerPhone: r.customer_phone ?? undefined, paymentMethod: r.payment_method, timestamp: Number(r.timestamp), billNumber: r.bill_number ? Number(r.bill_number) : undefined, data: r.data ?? {} })
);

const menuItemsTable = new HybridTable<DBMenuItem>(
  'menu_items',
  (m, uid) => ({ app_user_id: uid, id: m.id, name: m.name, price: m.price, category: m.category, is_active: m.isActive, is_favorite: m.isFavorite ?? false, variants: m.variants ?? [], printer_target: m.printerTarget ?? 'kitchen', data: { stockItemId: m.stockItemId, stockQtyPerUnit: m.stockQtyPerUnit, dietary: m.dietary }, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, name: r.name, price: Number(r.price), category: r.category, isActive: r.is_active, isFavorite: r.is_favorite, variants: r.variants ?? [], stockItemId: r.data?.stockItemId, stockQtyPerUnit: r.data?.stockQtyPerUnit, dietary: r.data?.dietary, printerTarget: (r.printer_target ?? 'kitchen') as 'kitchen' | 'bar' })
);

const categoriesTable = new HybridTable<DBCategory>(
  'categories',
  (c, uid) => ({ app_user_id: uid, id: c.id, name: c.name, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, name: r.name })
);

const restaurantProfileTable = new HybridTable<DBRestaurantProfile>(
  'restaurant_profile',
  (r, uid) => ({ app_user_id: uid, id: r.id, restaurant_name: r.restaurantName, phone: r.phone, email: r.email, address: r.address, gst_number: r.gstNumber, fssai_number: r.fssaiNumber, restaurant_code: r.restaurantCode, upi_id: r.upiId, upi_enabled: r.upiEnabled, thank_you_message: r.thankYouMessage, gst_percentage: r.gstPercentage, subscription_status: r.subscriptionStatus, subscription_plan: r.subscriptionPlan, subscription_expiry: r.subscriptionExpiry, license_key: r.licenseKey, activation_date: r.activationDate, referred_by_reward_granted: r.referredByRewardGranted, referred_by: r.referredBy, referral_claimed: r.referralClaimed, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, restaurantName: r.restaurant_name ?? undefined, phone: r.phone ?? undefined, email: r.email ?? undefined, address: r.address ?? undefined, gstNumber: r.gst_number || '', fssaiNumber: r.fssai_number || '', restaurantCode: r.restaurant_code ?? undefined, upiId: r.upi_id ?? undefined, upiEnabled: r.upi_enabled ?? false, thankYouMessage: r.thank_you_message ?? undefined, gstPercentage: r.gst_percentage ? Number(r.gst_percentage) : 0, subscriptionStatus: r.subscription_status ?? undefined, subscriptionPlan: r.subscription_plan ?? undefined, subscriptionExpiry: r.subscription_expiry ? Number(r.subscription_expiry) : undefined, licenseKey: r.license_key ?? undefined, activationDate: r.activation_date ? Number(r.activation_date) : undefined, referredByRewardGranted: r.referred_by_reward_granted ?? false, referredBy: r.referred_by ?? undefined, referralClaimed: r.referral_claimed ?? false })
);

const restaurantSettingsTable = new HybridTable<DBRestaurantSettings>(
  'restaurant_settings',
  (s, uid) => ({ app_user_id: uid, id: s.id, bill_sequence: s.billSequence, kot_sequence: s.kotSequence, last_kot_date: s.lastKotDate, print_phone: s.printPhone, print_email: s.printEmail, print_address: s.printAddress, print_fssai: s.printFssai, print_gst: s.printGst, print_thank_you: s.printThankYou, print_qr_code: s.printQrCode, baud_rate: s.baudRate, printer_width: s.printerWidth, printer_mode: s.printerMode, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, billSequence: r.bill_sequence ? Number(r.bill_sequence) : 1, kotSequence: r.kot_sequence ? Number(r.kot_sequence) : undefined, lastKotDate: r.last_kot_date ?? undefined, printPhone: r.print_phone ?? true, printEmail: r.print_email ?? false, printAddress: r.print_address ?? true, printFssai: r.print_fssai ?? true, printGst: r.print_gst ?? true, printThankYou: r.print_thank_you ?? true, printQrCode: r.print_qr_code ?? false, baudRate: r.baud_rate ? Number(r.baud_rate) : undefined, printerWidth: r.printer_width ? Number(r.printer_width) : undefined, printerMode: r.printer_mode ?? undefined, })
);

const activeOrdersTable = new HybridTable<Table>(
  'active_orders',
  (o, uid) => ({ app_user_id: uid, id: o.id, status: o.status, orders: o.orders ?? [], updated_at: new Date().toISOString() }),
  (r) => ({ id: Number(r.id), status: r.status as any, orders: r.orders ?? [] })
);

const stockItemsTable = new HybridTable<DBStockItem>(
  'stock_items',
  (s, uid) => ({ app_user_id: uid, id: s.id, name: s.name, quantity: s.quantity, unit: s.unit, min_threshold: s.minThreshold, last_updated: s.lastUpdated, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, name: r.name, quantity: Number(r.quantity), unit: r.unit, minThreshold: Number(r.min_threshold), lastUpdated: Number(r.last_updated) }),
  true
);

const stockTransactionsTable = new HybridTable<DBStockTransaction>(
  'stock_transactions',
  (t, uid) => ({ app_user_id: uid, id: t.id, stock_item_id: t.stockItemId, type: t.type, quantity: t.quantity, reason: t.reason ?? null, timestamp: t.timestamp, related_bill_id: t.relatedBillId ?? null, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, stockItemId: r.stock_item_id, type: r.type, quantity: Number(r.quantity), reason: r.reason ?? undefined, timestamp: Number(r.timestamp), relatedBillId: r.related_bill_id ?? undefined }),
  true
);

const kdsOrdersTable = new HybridTable<DBKdsOrder>(
  'kds_orders',
  (k, uid) => ({ app_user_id: uid, id: k.id, table_or_type: k.tableOrType, items: k.items, status: k.status, timestamp: k.timestamp, kot_number: k.kotNumber, completed_at: k.completedAt ?? null, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, tableOrType: r.table_or_type, items: r.items, status: r.status, timestamp: Number(r.timestamp), kotNumber: r.kot_number, completedAt: r.completed_at ? Number(r.completed_at) : undefined })
);

const customersTable = new HybridTable<DBCustomer>(
  'customers',
  (c, uid) => ({ app_user_id: uid, id: c.id, name: c.name, phone: c.phone, credit_limit: c.creditLimit, balance: c.balance, timestamp: c.timestamp, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, name: r.name, phone: r.phone, creditLimit: Number(r.credit_limit || 0), balance: Number(r.balance || 0), timestamp: Number(r.timestamp) })
);

const customerTransactionsTable = new HybridTable<DBCustomerTransaction>(
  'customer_transactions',
  (t, uid) => ({ app_user_id: uid, id: t.id, customer_id: t.customerId, type: t.type, amount: t.amount, related_bill_id: t.relatedBillId || null, timestamp: t.timestamp, note: t.note || null, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, customerId: r.customer_id, type: r.type, amount: Number(r.amount), relatedBillId: r.related_bill_id || undefined, timestamp: Number(r.timestamp), note: r.note || undefined })
);

const expensesTable = new HybridTable<DBExpense>(
  'expenses',
  (e, uid) => ({ app_user_id: uid, id: e.id, amount: e.amount, category: e.category, payment_method: e.paymentMethod, note: e.note || null, timestamp: e.timestamp, updated_at: new Date().toISOString() }),
  (r) => ({ id: r.id, amount: Number(r.amount), category: r.category, paymentMethod: r.payment_method, note: r.note || undefined, timestamp: Number(r.timestamp) })
);

const posCustomersTable = new HybridTable<DBPosCustomer>(
  'pos_customers',
  (c, uid) => ({
    app_user_id: uid,
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email ?? null,
    address: c.address ?? null,
    birthday: c.birthday ?? null,
    visit_count: c.visitCount ?? 0,
    total_spent: c.totalSpent ?? 0,
    last_visit: c.lastVisit ?? null,
    created_at: c.createdAt ?? null,
    tags: c.tags ?? [],
    notes: c.notes ?? null,
    updated_at: new Date().toISOString()
  }),
  (r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    birthday: r.birthday ?? undefined,
    visitCount: Number(r.visit_count ?? 0),
    totalSpent: Number(r.total_spent ?? 0),
    lastVisit: Number(r.last_visit ?? 0),
    createdAt: Number(r.created_at ?? 0),
    tags: r.tags ?? [],
    notes: r.notes ?? undefined
  })
);

// ── db object (same API as before) ───────────────────────────────────────────

export const db = {
  bills: billsTable,
  menuItems: menuItemsTable,
  categories: categoriesTable,
  restaurantProfile: restaurantProfileTable,
  restaurantSettings: restaurantSettingsTable,
  activeOrders: activeOrdersTable,
  stockItems: stockItemsTable,
  stockTransactions: stockTransactionsTable,
  kdsOrders: kdsOrdersTable,
  customers: customersTable,
  customerTransactions: customerTransactionsTable,
  expenses: expensesTable,
  posCustomers: posCustomersTable,
  deletedRecords: { add: async () => {}, toArray: async () => [] } as any,
};

// ── Customer Credit Helper Functions ─────────────────────────────────────────

export const normalizePhone = (phone: string): string => {
  const digits = phone.trim().replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// ── POS Customer Directory Helpers ────────────────────────────────────────────

export const getPosCustomerByPhone = async (phone: string): Promise<DBPosCustomer | null> => {
  if (!phone) return null;
  const clean = normalizePhone(phone);
  if (!clean) return null;
  try {
    const result = await db.posCustomers.dexieTable.where('phone').equals(clean).first();
    return result || null;
  } catch {
    return null;
  }
};

export const upsertPosCustomer = async (name: string, phone: string, billTotal: number = 0): Promise<void> => {
  if (!phone || !name?.trim()) return;
  const cleanPhone = normalizePhone(phone);
  const cleanName = name.trim();
  if (cleanPhone.length < 10) return;
  try {
    const existing = await getPosCustomerByPhone(cleanPhone);
    const now = Date.now();
    if (existing) {
      const updated: DBPosCustomer = {
        ...existing,
        name: cleanName,
        visitCount: (existing.visitCount || 0) + 1,
        totalSpent: (existing.totalSpent || 0) + billTotal,
        lastVisit: now,
      };
      await db.posCustomers.put(updated);
    } else {
      const newCustomer: DBPosCustomer = {
        id: crypto.randomUUID(),
        name: cleanName,
        phone: cleanPhone,
        visitCount: 1,
        totalSpent: billTotal,
        lastVisit: now,
        createdAt: now,
      };
      await db.posCustomers.put(newCustomer);
    }
  } catch (err) {
    console.error('[upsertPosCustomer] Error:', err);
  }
};

export const mergeDuplicateCustomers = async (phone: string): Promise<DBCustomer | null> => {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return null;

  const list = await db.customers.where('phone').equals(cleanPhone).toArray();
  if (list.length === 0) return null;

  let mainCustomer = list[0];
  if (list.length > 1) {
    console.log(`[DB] Merging ${list.length} duplicate customers for phone: ${cleanPhone}`);
    let mergedBalance = mainCustomer.balance || 0;
    
    for (let i = 1; i < list.length; i++) {
      const dup = list[i];
      mergedBalance += (dup.balance || 0);

      // 1. Point all transactions of the duplicate customer to the main customer
      const transactions = await db.customerTransactions.where('customerId').equals(dup.id).toArray();
      for (const tx of transactions) {
        await db.customerTransactions.update(tx.id, { customerId: mainCustomer.id });
        const updatedTx = await db.customerTransactions.get(tx.id);
        if (updatedTx) {
          await enqueueSync('customer_transactions', 'put', tx.id, updatedTx);
        }
      }

      // 2. Delete the duplicate customer record
      await db.customers.delete(dup.id);
      await enqueueSync('customers', 'delete', dup.id, null);
    }

    // 3. Update main customer with merged balance
    await db.customers.update(mainCustomer.id, { balance: mergedBalance });
    mainCustomer.balance = mergedBalance;

    const updatedMain = await db.customers.get(mainCustomer.id);
    if (updatedMain) {
      await enqueueSync('customers', 'put', mainCustomer.id, updatedMain);
    }
  }

  return mainCustomer;
};

export const recordCustomerCredit = async (name: string, phone: string, amount: number, billId?: string, billNumber?: number) => {
  if (!phone || !name) return;
  const cleanPhone = normalizePhone(phone);
  const cleanName = name.trim();

  try {
    // 1. Find or merge customer by phone
    let customer = await mergeDuplicateCustomers(cleanPhone);

    if (customer) {
      const limit = customer.creditLimit !== undefined ? customer.creditLimit : 10000;
      const newBalance = (customer.balance || 0) + amount;
      if (newBalance > limit) {
        throw new Error(`Customer credit limit of ₹${limit} exceeded. Current balance: ₹${customer.balance || 0}, New credit amount: ₹${amount}`);
      }
      await db.customers.update(customer.id, {
        balance: newBalance,
        name: cleanName,
      });
      customer = {
        ...customer,
        balance: newBalance,
        name: cleanName
      };
    } else {
      const limit = 10000;
      if (amount > limit) {
        throw new Error(`Customer credit limit of ₹${limit} exceeded. New credit amount: ₹${amount}`);
      }
      const id = crypto.randomUUID();
      customer = {
        id,
        name: cleanName,
        phone: cleanPhone,
        creditLimit: limit,
        balance: amount,
        timestamp: Date.now()
      };
      await db.customers.put(customer);
    }

    let billNumberStr = '';
    if (billNumber) {
       billNumberStr = ` for Bill #${billNumber.toString().padStart(6, '0')}`;
    } else if (billId) {
       billNumberStr = ` for Bill #${billId.slice(-6)}`;
    }

    // 2. Add a credit transaction log
    const txId = crypto.randomUUID();
    await db.customerTransactions.put({
      id: txId,
      customerId: customer.id,
      type: 'credit',
      amount,
      relatedBillId: billId,
      timestamp: Date.now(),
      note: `Bill settlement via Credit${billNumberStr}`
    });
  } catch (error) {
    console.error('Error in recordCustomerCredit:', error);
    throw error;
  }
};

export const recordCustomerPayment = async (customerId: string, amount: number, paymentMethod: string, note?: string) => {
  try {
    const customer = await db.customers.get(customerId);
    if (!customer) throw new Error(`Customer ${customerId} not found`);
    if (amount > (customer.balance || 0)) {
      throw new Error('Payment exceeds outstanding balance');
    }

    const newBalance = Math.max(0, (customer.balance || 0) - amount);
    await db.customers.update(customerId, { balance: newBalance });

    // FIFO match and auto-settle outstanding credit bills
    let remainingRepayment = amount;
    if (customer.phone) {
      const bills = await db.bills.where('customerPhone').equals(customer.phone).toArray();

      // Helper to calculate credit portion of a bill
      const getCreditAmountForBill = (bill: any): number => {
        if (!bill.paymentMethod) return 0;
        if (bill.paymentMethod === 'Credit' || bill.paymentMethod === 'Udhar' || bill.paymentMethod === 'Unpaid') {
          return bill.total;
        }
        if (bill.paymentMethod.startsWith('Split')) {
          const creditMatch = bill.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
          if (creditMatch && creditMatch[1]) {
            return parseFloat(creditMatch[1]);
          }
        }
        return 0;
      };

      // Helper to parse split components of a bill
      const parseSplitComponents = (splitStr: string) => {
        const cashMatch = splitStr.match(/Cash:\s*₹?([\d.]+)/);
        const upiMatch = splitStr.match(/UPI:\s*₹?([\d.]+)/);
        const cardMatch = splitStr.match(/Card:\s*₹?([\d.]+)/);
        const creditMatch = splitStr.match(/Credit:\s*₹?([\d.]+)/);

        return {
          Cash: cashMatch && cashMatch[1] ? parseFloat(cashMatch[1]) : 0,
          UPI: upiMatch && upiMatch[1] ? parseFloat(upiMatch[1]) : 0,
          Card: cardMatch && cardMatch[1] ? parseFloat(cardMatch[1]) : 0,
          Credit: creditMatch && creditMatch[1] ? parseFloat(creditMatch[1]) : 0,
        };
      };

      // Helper to format split payment string
      const formatSplitPaymentStr = (cash: number, upi: number, card: number, credit: number): string => {
        const parts: string[] = [];
        if (cash > 0) parts.push(`Cash: ₹${cash.toFixed(2)}`);
        if (upi > 0) parts.push(`UPI: ₹${upi.toFixed(2)}`);
        if (card > 0) parts.push(`Card: ₹${card.toFixed(2)}`);
        if (credit > 0) parts.push(`Credit: ₹${credit.toFixed(2)}`);
        return `Split (${parts.join(', ')})`;
      };

      const creditBills = bills.filter(b => {
        if (b.data?.status === 'cancelled') return false;
        return getCreditAmountForBill(b) > 0;
      });

      // Sort chronologically oldest first
      creditBills.sort((a, b) => a.timestamp - b.timestamp);

      for (const b of creditBills) {
        if (remainingRepayment <= 0) break;
        const creditAmt = getCreditAmountForBill(b);
        const applied = Math.min(creditAmt, remainingRepayment);

        let newPaymentMethod = '';
        if (applied === creditAmt) {
          // Credit portion is fully paid off
          if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar' || b.paymentMethod === 'Unpaid') {
            newPaymentMethod = paymentMethod;
          } else if (b.paymentMethod.startsWith('Split')) {
            const components = parseSplitComponents(b.paymentMethod);
            components.Credit = 0;
            if (paymentMethod === 'Cash') components.Cash += applied;
            else if (paymentMethod === 'UPI') components.UPI += applied;
            else if (paymentMethod === 'Card') components.Card += applied;

            const nonZero = Object.entries(components).filter(([_, val]) => val > 0);
            if (nonZero.length === 1) {
              newPaymentMethod = nonZero[0][0];
            } else {
              newPaymentMethod = formatSplitPaymentStr(components.Cash, components.UPI, components.Card, components.Credit);
            }
          }
        } else {
          // Credit portion is partially paid off
          if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar' || b.paymentMethod === 'Unpaid') {
            const cash = paymentMethod === 'Cash' ? applied : 0;
            const upi = paymentMethod === 'UPI' ? applied : 0;
            const card = paymentMethod === 'Card' ? applied : 0;
            const credit = creditAmt - applied;
            newPaymentMethod = formatSplitPaymentStr(cash, upi, card, credit);
          } else if (b.paymentMethod.startsWith('Split')) {
            const components = parseSplitComponents(b.paymentMethod);
            components.Credit = Math.max(0, components.Credit - applied);
            if (paymentMethod === 'Cash') components.Cash += applied;
            else if (paymentMethod === 'UPI') components.UPI += applied;
            else if (paymentMethod === 'Card') components.Card += applied;

            newPaymentMethod = formatSplitPaymentStr(components.Cash, components.UPI, components.Card, components.Credit);
          }
        }

        if (newPaymentMethod) {
          await db.bills.update(b.id, { paymentMethod: newPaymentMethod });
        }

        remainingRepayment -= applied;
      }
    }

    const txId = crypto.randomUUID();
    await db.customerTransactions.put({
      id: txId,
      customerId,
      type: 'payment',
      amount,
      timestamp: Date.now(),
      note: `${paymentMethod} Repayment: ${note || 'No notes'}`
    });

    notifyGlobalChange('bills');
    notifyGlobalChange('customers');
    notifyGlobalChange('customer_transactions');
  } catch (error) {
    console.error('Error in recordCustomerPayment:', error);
    throw error;
  }
};


export const getDatabase = () => db;

export const getTable = (tableName: string): any => {
  switch (tableName) {
    case 'bills': return db.bills;
    case 'menu_items': return db.menuItems;
    case 'categories': return db.categories;
    case 'restaurant_profile': return db.restaurantProfile;
    case 'restaurant_settings': return db.restaurantSettings;
    case 'active_orders': return db.activeOrders;
    case 'stock_items': return db.stockItems;
    case 'stock_transactions': return db.stockTransactions;
    case 'kds_orders': return db.kdsOrders;
    case 'customers': return db.customers;
    case 'customer_transactions': return db.customerTransactions;
    case 'expenses': return db.expenses;
    case 'pos_customers': return db.posCustomers;
    default: return undefined;
  }
};

// ── Print Failover Queue ──────────────────────────────────────────────────────

export interface DBPrintJob {
  id: string;
  type: 'bills' | 'kds_orders';
  status: 'pending' | 'failed' | 'processing';
  timestamp: number;
  record: any;
  attempts?: number;
}

export async function enqueuePrintJob(type: 'bills' | 'kds_orders', record: any) {
  try {
    const job: DBPrintJob = {
      id: record.id || crypto.randomUUID(),
      type,
      status: 'pending',
      timestamp: Date.now(),
      record,
      attempts: 0
    };
    await localDb.table('print_queue').put(job);
    logger.log(`[PrintQueue] Enqueued print job for ${type}:`, record.billNumber || record.kotNumber || record.id);
  } catch (err) {
    logger.error('[PrintQueue] Failed to enqueue print job:', err);
  }
}

let isProcessingQueue = false;

export async function processPrintQueue() {
  if (isProcessingQueue) return;
  if (!('serial' in navigator)) return;

  isProcessingQueue = true;
  try {
    const queueTable = localDb.table('print_queue');
    const pendingJobs = await queueTable.where('status').equals('pending').sortBy('timestamp');

    if (pendingJobs.length === 0) {
      isProcessingQueue = false;
      return;
    }

    const { ThermalPrinter } = await import('./printer');
    const profile = await localDb.table('restaurant_profile').get('global');
    const sys = await localDb.table('restaurant_settings').get('global');
    const settings = { ...(profile || {}), ...(sys || {}) };
    const printerMode = settings?.printerMode || 'single';

    let hasAnyConnection = false;
    if (printerMode === 'multiple') {
      hasAnyConnection = !!(ThermalPrinter.isReceiptConnected || ThermalPrinter.isKOTConnected || ThermalPrinter.isBarConnected);
    } else {
      hasAnyConnection = !!(ThermalPrinter.isConnected || ThermalPrinter.isReceiptConnected || ThermalPrinter.isKOTConnected);
    }

    if (!hasAnyConnection) {
      logger.log('[PrintQueue] Checking/reconnecting printer...');
      await ThermalPrinter.autoConnect();
    }

    const isReceiptConnected = printerMode === 'multiple' ? ThermalPrinter.isReceiptConnected : (ThermalPrinter.isConnected || ThermalPrinter.isReceiptConnected);
    const isKOTConnected = printerMode === 'multiple' ? ThermalPrinter.isKOTConnected : (ThermalPrinter.isConnected || ThermalPrinter.isKOTConnected);

    for (const job of pendingJobs) {
      const isTargetConnected = job.type === 'bills' ? isReceiptConnected : isKOTConnected;
      if (!isTargetConnected) {
        logger.warn(`[PrintQueue] Printer for ${job.type} is still offline. Skipping this round.`);
        break;
      }

      logger.log(`[PrintQueue] Retrying print job ${job.id} of type ${job.type}`);
      await queueTable.update(job.id, { status: 'processing' });

      try {
        if (job.type === 'bills') {
          const b = job.record;
          await ThermalPrinter.printReceipt(
            b.tableId,
            b.items,
            b.subtotal,
            b.tax,
            b.total,
            b.paymentMethod,
            b.billNumber || 0,
            settings,
            b.discount || 0,
            b.customerName || '',
            b.customerPhone || '',
            b.timestamp
          );
        } else if (job.type === 'kds_orders') {
          const k = job.record;
          await ThermalPrinter.printKOT(
            k.tableOrType,
            k.items,
            k.kotNumber
          );
        }

        await queueTable.delete(job.id);
        logger.log(`[PrintQueue] Successfully printed queued job ${job.id}`);
      } catch (printErr) {
        const attempts = (job.attempts || 0) + 1;
        logger.error(`[PrintQueue] Failed to print queued job ${job.id} on attempt ${attempts}:`, printErr);
        if (attempts >= 5) {
          await queueTable.update(job.id, { status: 'failed', attempts });
          logger.warn(`[PrintQueue] Job ${job.id} exceeded maximum retries and has been marked as failed.`);
        } else {
          await queueTable.update(job.id, { status: 'pending', attempts });
        }
      }
    }
  } catch (err) {
    logger.error('[PrintQueue] Error processing print queue:', err);
  } finally {
    isProcessingQueue = false;
  }
}

let printQueueInterval: ReturnType<typeof setInterval> | null = null;

export const startPrintQueueProcessor = () => {
  if (printQueueInterval) return;
  if (!(window as any).electronAPI) return;

  printQueueInterval = setInterval(() => {
    processPrintQueue();
  }, 15000);
  logger.log('[PrintQueue] Processor started (15s interval)');
  // Process immediately on start
  processPrintQueue();
};

export const stopPrintQueueProcessor = () => {
  if (printQueueInterval) {
    clearInterval(printQueueInterval);
    printQueueInterval = null;
    logger.log('[PrintQueue] Processor stopped');
  }
};

// Helper function for Cloud Auto-printing inside db.ts
async function handleCloudAutoPrint(table: string, record: any) {
  try {
    const { ThermalPrinter } = await import('./printer');
    const profile = await localDb.table('restaurant_profile').get('global');
    const sys = await localDb.table('restaurant_settings').get('global');
    const settings = { ...(profile || {}), ...(sys || {}) };

    if (table === 'bills') {
      const b = record as DBBill;
      // Skip printing if the bill is older than 2 minutes
      const timeDiff = Math.abs(Date.now() - b.timestamp);
      if (timeDiff > 120000) {
        logger.log('[CloudPrint] Skipping old bill print:', b.billNumber, 'Time diff:', timeDiff);
        return;
      }

      logger.log('[CloudPrint] Auto-printing bill from cloud:', b.billNumber);
      if (!ThermalPrinter.isConnected && !ThermalPrinter.isReceiptConnected) {
        await ThermalPrinter.autoConnect();
      }

      const printerMode = settings?.printerMode || 'single';
      const activePort = printerMode === 'multiple' ? ThermalPrinter.isReceiptConnected : (ThermalPrinter.isConnected || ThermalPrinter.isReceiptConnected);

      if (activePort) {
        try {
          await ThermalPrinter.printReceipt(
            b.tableId,
            b.items,
            b.subtotal,
            b.tax,
            b.total,
            b.paymentMethod,
            b.billNumber || 0,
            settings,
            b.discount || 0,
            b.customerName || '',
            b.customerPhone || '',
            b.timestamp
          );
          logger.log('[CloudPrint] Bill printed successfully:', b.billNumber);
        } catch (printErr) {
          logger.error('[CloudPrint] Failed to print receipt:', printErr);
          await enqueuePrintJob('bills', b);
        }
      } else {
        logger.warn('[CloudPrint] Printer not connected on desktop PC for bill:', b.billNumber);
        await enqueuePrintJob('bills', b);
      }
    } else if (table === 'kds_orders') {
      const k = record as DBKdsOrder;
      // Skip printing if the KOT is older than 2 minutes
      const timeDiff = Math.abs(Date.now() - k.timestamp);
      if (timeDiff > 120000) {
        logger.log('[CloudPrint] Skipping old KOT print:', k.kotNumber, 'Time diff:', timeDiff);
        return;
      }

      logger.log('[CloudPrint] Auto-printing KOT from cloud:', k.kotNumber);
      if (!ThermalPrinter.isConnected && !ThermalPrinter.isKOTConnected) {
        await ThermalPrinter.autoConnect();
      }

      const printerMode = settings?.printerMode || 'single';
      const activePort = printerMode === 'multiple' ? ThermalPrinter.isKOTConnected : (ThermalPrinter.isConnected || ThermalPrinter.isKOTConnected);

      if (activePort) {
        try {
          await ThermalPrinter.printKOT(
            k.tableOrType,
            k.items,
            k.kotNumber
          );
          logger.log('[CloudPrint] KOT printed successfully:', k.kotNumber);
        } catch (printErr) {
          logger.error('[CloudPrint] Failed to print KOT:', printErr);
          await enqueuePrintJob('kds_orders', k);
        }
      } else {
        logger.warn('[CloudPrint] Printer not connected on desktop PC for KOT:', k.kotNumber);
        await enqueuePrintJob('kds_orders', k);
      }
    }
  } catch (err) {
    logger.error('[CloudPrint] Failed to auto-print:', err);
  }
}

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
    'pos_customers'
  ];
  tables.forEach(table => {
    supabase!.channel(`rt_${table}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table, filter: `app_user_id=eq.${userId}` }, async (payload: any) => {
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
              const recordId = (localRecord as any).id;
              const existing = await dexieTable.get(recordId);
              const isCloudPrintReceivingEnabled = localStorage.getItem('enableCloudPrintReceiving') !== 'false';
              if (!existing && !locallyCreatedIds.has(recordId) && !String(recordId).endsWith('-nocp') && isCloudPrintReceivingEnabled) {
                isNewFromOtherDevice = true;
              }
            }

            await dexieTable.put(localRecord);
            notifyGlobalChange(table);

            if (isNewFromOtherDevice && (window as any).electronAPI) {
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
  supabase.auth.onAuthStateChange((event: any) => {
    if (event === 'SIGNED_OUT') {
      cleanupRealtime();
    }
  });
}

export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  deps: any[] = [],
  tableNames: string | string[]
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const querierRef = useRef(querier);
  querierRef.current = querier;

  useEffect(() => {
    const onChanged = () => setTick(v => v + 1);

    // Determine target tables
    const targetTables: string[] = Array.isArray(tableNames) ? tableNames : [tableNames];

    targetTables.forEach(table => {
      let listeners = tableListeners.get(table);
      if (!listeners) {
        listeners = new Set();
        tableListeners.set(table, listeners);
      }
      listeners.add(onChanged);
    });

    return () => {
      targetTables.forEach(table => {
        const listeners = tableListeners.get(table);
        if (listeners) {
          listeners.delete(onChanged);
        }
      });
    };
  }, [tableNames]);

  const userId = getUserId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await querierRef.current();
        if (!cancelled) setData(result as T);
      } catch (err) {
        console.error('[useLiveQuery] Error:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, userId, ...deps]);

  return data;
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

// ── Bill Number Helper ─────────────────────────────────────────────────────────

export const getNextBillNumber = async (): Promise<number> => {
  const userId = getUserId();

  // ── Server-side path (authoritative) ──────────────────────────────────────
  // Call the Supabase RPC which atomically increments bill_sequence in Postgres.
  if (supabase && navigator.onLine && userId) {
    const { data, error } = await supabase.rpc('get_next_bill_number', { p_user_id: userId });
    if (error) {
      console.error('[BillSeq] Server RPC failed:', error);
      throw error;
    }
    const serverBillNum = Number(data);
    if (!serverBillNum || serverBillNum <= 0) {
      throw new Error('Invalid server bill number');
    }
    // Keep local Dexie counter in sync
    await localDb.table('restaurant_settings').update('global', { billSequence: serverBillNum + 1 });
    return serverBillNum;
  }

  throw new Error("Internet is disconnected or the server is unavailable. Cannot generate bill.");
};

// ── KOT Number Helper ─────────────────────────────────────────────────────────

export const getNextKotNumber = async () => {
  const today = getLocalDateString();

  const settings = await db.restaurantSettings.get('global');
  let kotSeq = settings?.kotSequence || 1;
  let lastDate = settings?.lastKotDate || today;
  if (lastDate !== today) {
    kotSeq = 1;
    lastDate = today;
  }
  const resultSeq = kotSeq;
  if (settings) {
    await db.restaurantSettings.update('global', {
      kotSequence: kotSeq + 1,
      lastKotDate: lastDate
    });
  }
  return resultSeq.toString().padStart(4, '0');
};

// ── Stock Deduction Helper for Sales ─────────────────────────────────────────

export const deductStockForBill = async (billId: string, items: any[], billNumber?: number) => {
  try {
    const formattedBillNum = billNumber ? billNumber.toString().padStart(6, '0') : billId;
    for (const item of items) {
      const menuItem = item.menuItem;
      if (menuItem && menuItem.stockItemId) {
        const stockItem = await db.stockItems.get(menuItem.stockItemId);
        if (stockItem) {
          const qtyToDeduct = (item.quantity || 1) * (menuItem.stockQtyPerUnit || 1);
          const newQty = Math.max(0, stockItem.quantity - qtyToDeduct);
          
          // 1. Update the stock item's quantity
          await db.stockItems.update(stockItem.id, {
            quantity: newQty,
            lastUpdated: Date.now()
          });

          // 2. Log a transaction of type 'out' related to this bill
          const txId = crypto.randomUUID();
          await db.stockTransactions.put({
            id: txId,
            stockItemId: stockItem.id,
            type: 'out',
            quantity: qtyToDeduct,
            reason: `Bill #${formattedBillNum} generated`,
            timestamp: Date.now(),
            relatedBillId: billId
          });
        }
      }
    }
  } catch (error) {
    console.error('Error in deductStockForBill:', error);
  }
};

// ── Revert Stock for Cancelled Bill ──────────────────────────────────────────

export const revertStockForBill = async (billId: string, items: any[], billNumber?: number) => {
  try {
    const formattedBillNum = billNumber ? billNumber.toString().padStart(6, '0') : billId;
    for (const item of items) {
      const menuItem = item.menuItem;
      if (menuItem && menuItem.stockItemId) {
        const stockItem = await db.stockItems.get(menuItem.stockItemId);
        if (stockItem) {
          const qtyToRevert = (item.quantity || 1) * (menuItem.stockQtyPerUnit || 1);
          const newQty = stockItem.quantity + qtyToRevert;

          // 1. Return the stock
          await db.stockItems.update(stockItem.id, {
            quantity: newQty,
            lastUpdated: Date.now()
          });

          // 2. Log a transaction of type 'in' for reversal
          const txId = crypto.randomUUID();
          await db.stockTransactions.put({
            id: txId,
            stockItemId: stockItem.id,
            type: 'in',
            quantity: qtyToRevert,
            reason: `Bill #${formattedBillNum} cancelled - stock returned`,
            timestamp: Date.now(),
            relatedBillId: billId
          });
        }
      }
    }
  } catch (error) {
    console.error('Error in revertStockForBill:', error);
  }
};

// ── Revert Customer Credit (Udhar) for Cancelled Bill ──────────────────────────

export const revertCustomerCreditForBill = async (
  billId: string, 
  customerPhone: string, 
  amount: number, 
  billNumber?: number,
  customNote?: string
) => {
  if (!customerPhone) return;
  const cleanPhone = normalizePhone(customerPhone);
  try {
    const customer = await mergeDuplicateCustomers(cleanPhone);
    if (customer) {
      const newBalance = Math.max(0, (customer.balance || 0) - amount);
      await db.customers.update(customer.id, {
        balance: newBalance
      });

      // Log a transaction of type 'payment' for credit reversal
      const txId = crypto.randomUUID();
      const formattedBillNum = billNumber ? billNumber.toString().padStart(6, '0') : billId;
      await db.customerTransactions.put({
        id: txId,
        customerId: customer.id,
        type: 'payment', // 'payment' decreases the outstanding balance
        amount,
        relatedBillId: billId,
        timestamp: Date.now(),
        note: customNote || `Reversal: Bill #${formattedBillNum} cancelled`
      });
    }
  } catch (error) {
    console.error('Error in revertCustomerCreditForBill:', error);
  }
};

// ── Cancel Bill Helper ───────────────────────────────────────────────────────

export const cancelBill = async (billId: string, reason: string) => {
  try {
    if (!reason || reason.trim() === '') {
      throw new Error('Cancellation reason is required for authorization');
    }
    const bill = await db.bills.get(billId);
    if (!bill) throw new Error('Bill not found');

    // 1. Mark the bill as cancelled in the data field
    const updatedData = {
      ...(bill.data || {}),
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: Date.now()
    };
    await db.bills.update(billId, { data: updatedData });

    // 2. Revert stock deductions
    const items = bill.items || bill.data?.items || [];
    await revertStockForBill(billId, items, bill.billNumber);

    // 3. Revert customer credit (Udhar) if payment method was Udhar or Split containing Credit
    let creditAmtToRevert = 0;
    const pMethod = bill.paymentMethod?.toLowerCase() || '';
    if (pMethod === 'udhar' || pMethod === 'credit' || pMethod === 'unpaid') {
      creditAmtToRevert = bill.total;
    } else if (bill.paymentMethod?.startsWith('Split')) {
      const creditMatch = bill.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
      if (creditMatch && creditMatch[1]) {
        creditAmtToRevert = parseFloat(creditMatch[1]);
      }
    }
    if (creditAmtToRevert > 0 && bill.customerPhone) {
      await revertCustomerCreditForBill(billId, bill.customerPhone, creditAmtToRevert, bill.billNumber);
    }

    notifyGlobalChange('bills');
    return true;
  } catch (error) {
    console.error('Error in cancelBill:', error);
    throw error;
  }
};

// ── Clear Local Tables Helper for Logout ─────────────────────────────────────

export const clearAllLocalTables = async () => {
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
    'carts',
    'syncQueue',
    'print_queue'
  ];
  for (const table of tables) {
    try {
      await localDb.table(table).clear();
    } catch (e) {
      console.error(`Failed to clear table ${table}:`, e);
    }
  }
  // Clear last sync timestamps so the new user does a complete sync
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('last_sync_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('[DB] All local database tables cleared and sync timers reset');
};
