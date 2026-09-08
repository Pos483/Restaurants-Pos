// ── Types and Interfaces ──────────────────────────────────────────────────────
export * from './db/types';

// ── Database Client, Schema & LiveQuery ────────────────────────────────────────
export {
  localDb,
  locallyCreatedIds,
  rescueBillItems,
  notifyGlobalChange,
  getUserId,
  useLiveQuery
} from './db/client';

export { supabase } from './supabase';

// ── Supabase & IndexedDB Synchronizer ─────────────────────────────────────────
export {
  enqueueSync,
  getSyncStatus,
  setSyncStatus,
  addSyncStatusListener,
  processSyncQueue,
  pullTable,
  pullFromSupabase,
  syncLocalStaffToSupabase,
  triggerPull,
  triggerSync,
  startAutoPoll,
  stopAutoPoll,
  setupRealtime,
  cleanupRealtime,
  initDb
} from './db/sync';

// ── HybridTable Dexie-Supabase Gateway ────────────────────────────────────────
export {
  db,
  getDatabase,
  getTable,
  HybridTable
} from './db/hybridTable';

// ── Customer Operations ───────────────────────────────────────────────────────
export {
  normalizePhone,
  getPosCustomerByPhone,
  upsertPosCustomer,
  mergeDuplicateCustomers,
  deduplicateCustomerTransactions,
  recordCustomerCredit,
  recordCustomerPayment,
  searchCustomersUnified,
  findCustomerByPhone
} from './db/customers';
export type { CustomerSearchResult } from './db/customers';

// ── Print Queue Relay ─────────────────────────────────────────────────────────
export {
  enqueuePrintJob,
  processPrintQueue,
  startPrintQueueProcessor,
  stopPrintQueueProcessor,
  handleCloudAutoPrint
} from './db/printQueue';

// ── Database Business Transactions ────────────────────────────────────────────
export {
  getNextBillNumber,
  getNextKotNumber,
  deductStockForBill,
  revertStockForBill,
  revertCustomerCreditForBill,
  cancelBill,
  clearAllLocalTables
} from './db/operations';

// Helper re-export
export { getLocalDateString } from './types';

// ── Database Backup & Restore Operations ──────────────────────────────────────
export {
  exportDbToJson
} from './db/backup';
