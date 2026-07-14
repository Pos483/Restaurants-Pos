import { useState, useEffect, useRef } from 'react';
import Dexie from 'dexie';
import { OrderItem } from '../types';

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

// ── Global Live Query Engine ──────────────────────────────────────────────────

export const tableListeners = new Map<string, Set<() => void>>();

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
export class LocalIdCache {
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

  get size(): number {
    return this.ids.length;
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
