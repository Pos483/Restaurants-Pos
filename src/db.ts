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
  recordCustomerCredit,
  recordCustomerPayment
} from './db/customers';

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
  exportDbToJson,
  importDbFromJson
} from './db/backup';
