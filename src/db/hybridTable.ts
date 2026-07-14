import Dexie from 'dexie';
import { supabase } from '../supabase';
import { localDb, notifyGlobalChange, getUserId, locallyCreatedIds } from './client';
import { Table } from '../types';
import {
  BaseDBRecord,
  DBMenuItem,
  DBCategory,
  DBBill,
  DBRestaurantProfile,
  DBRestaurantSettings,
  DBStockTransaction,
  DBStockItem,
  DBKdsOrder,
  DBCustomer,
  DBCustomerTransaction,
  DBPosCustomer,
  DBExpense
} from './types';

export class HybridTable<T extends BaseDBRecord> {
  public dexieTable: Dexie.Table<T, any>;

  constructor(
    private tableName: string,
    public toRow: (record: T, userId: string) => Record<string, any>,
    public fromRow: (row: Record<string, any>) => T,
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

  async add(record: T): Promise<string | number> {
    if (this.tableName === 'bills') {
      const b = record as unknown as DBBill;
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

    const id = record.id ? String(record.id) : crypto.randomUUID();
    locallyCreatedIds.add(id);
    const finalRecord = { ...record, id } as T;

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

  async put(record: T): Promise<string | number> {
    const id = record.id;
    if (!id) throw new Error('Cannot put a record without id');
    locallyCreatedIds.add(String(id));

    if (this.tableName === 'bills') {
      const b = record as unknown as DBBill;
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
      if (existing && existing.restaurantCode) {
        record.restaurantCode = existing.restaurantCode;
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

  async update(id: string | number, changes: Partial<T>, skipSync: boolean = false): Promise<string | number> {
    locallyCreatedIds.add(String(id));
    // Lock restaurantCode for profile table to make it immutable (treat like User ID)
    if (this.tableName === 'restaurant_profile') {
      const existing = await this.dexieTable.get(id);
      if (existing && existing.restaurantCode) {
        delete changes.restaurantCode;
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
      if (r.id) locallyCreatedIds.add(String(r.id));
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

export const getDatabase = () => db;

export const getTable = (tableName: string): HybridTable<BaseDBRecord> | undefined => {
  switch (tableName) {
    case 'bills': return db.bills as unknown as HybridTable<BaseDBRecord>;
    case 'menu_items': return db.menuItems as unknown as HybridTable<BaseDBRecord>;
    case 'categories': return db.categories as unknown as HybridTable<BaseDBRecord>;
    case 'restaurant_profile': return db.restaurantProfile as unknown as HybridTable<BaseDBRecord>;
    case 'restaurant_settings': return db.restaurantSettings as unknown as HybridTable<BaseDBRecord>;
    case 'active_orders': return db.activeOrders as unknown as HybridTable<BaseDBRecord>;
    case 'stock_items': return db.stockItems as unknown as HybridTable<BaseDBRecord>;
    case 'stock_transactions': return db.stockTransactions as unknown as HybridTable<BaseDBRecord>;
    case 'kds_orders': return db.kdsOrders as unknown as HybridTable<BaseDBRecord>;
    case 'customers': return db.customers as unknown as HybridTable<BaseDBRecord>;
    case 'customer_transactions': return db.customerTransactions as unknown as HybridTable<BaseDBRecord>;
    case 'expenses': return db.expenses as unknown as HybridTable<BaseDBRecord>;
    case 'pos_customers': return db.posCustomers as unknown as HybridTable<BaseDBRecord>;
    default: return undefined;
  }
};
