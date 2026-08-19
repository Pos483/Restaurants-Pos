import { localDb } from './client';

/**
 * Exports all local Dexie IndexedDB tables to a JSON file.
 * Excludes transient syncQueue table to avoid duplicate syncing logs.
 */
export async function exportDbToJson(): Promise<void> {
  const backup: any = {
    app: 'siya-bill',
    version: import.meta.env.VITE_APP_VERSION || '3.4.1',
    timestamp: Date.now(),
    tables: {}
  };

  // Fetch all tables dynamically
  for (const table of localDb.tables) {
    const name = table.name;
    // Skip syncQueue as it is dynamic and should not be restored
    if (name === 'syncQueue') continue;

    const records = await table.toArray();
    backup.tables[name] = records;
  }

  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Trigger file download
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `siyabill_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


