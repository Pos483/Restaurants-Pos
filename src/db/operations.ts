import { supabase } from '../supabase';
import { localDb, notifyGlobalChange, getUserId } from './client';
import { db } from './hybridTable';
import { getLocalDateString, OrderItem } from '../types';
import { normalizePhone, mergeDuplicateCustomers } from './customers';

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

export const deductStockForBill = async (billId: string, items: OrderItem[], billNumber?: number) => {
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

export const revertStockForBill = async (billId: string, items: OrderItem[], billNumber?: number) => {
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
