import { logger } from '../utils/logger';
import { localDb } from './client';
import { DBPrintJob, DBBill, DBKdsOrder } from './types';

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

    const { ThermalPrinter } = await import('../printer');
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

// Helper function for Cloud Auto-printing inside printQueue.ts
export async function handleCloudAutoPrint(table: string, record: any) {
  try {
    const { ThermalPrinter } = await import('../printer');
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
