import { localDb, notifyGlobalChange } from './client';

/**
 * Exports all local Dexie IndexedDB tables to a JSON file.
 * Excludes transient syncQueue table to avoid duplicate syncing logs.
 */
export async function exportDbToJson(): Promise<void> {
  const backup: any = {
    app: 'siya-bill',
    version: import.meta.env.VITE_APP_VERSION || '3.1.2',
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

/**
 * Imports records from a backup JSON file back into Dexie.
 * Merges records using bulkPut based on primary keys.
 */
export async function importDbFromJson(file: File): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const backup = JSON.parse(text);

        // Basic schema verification
        if (backup.app !== 'siya-bill' || !backup.tables) {
          resolve({ success: false, message: 'Invalid backup file. Make sure it is a valid Siya Bill backup.' });
          return;
        }

        // Loop through backup tables and insert/update database records
        for (const tableName of Object.keys(backup.tables)) {
          // Check if table exists in localDb schema
          const table = localDb.table(tableName);
          if (table) {
            const records = backup.tables[tableName];
            if (Array.isArray(records) && records.length > 0) {
              await table.bulkPut(records);
            }
          }
        }

        // Notify reactive listeners of changed tables to force UI refresh
        Object.keys(backup.tables).forEach((tableName) => {
          notifyGlobalChange(tableName);
        });

        resolve({ success: true, message: 'Local backup restored and merged successfully!' });
      } catch (err: any) {
        console.error('Backup import failure:', err);
        resolve({ success: false, message: `Failed to parse or write backup data: ${err.message || err}` });
      }
    };

    reader.onerror = () => {
      resolve({ success: false, message: 'Failed to read backup file.' });
    };

    reader.readAsText(file);
  });
}
