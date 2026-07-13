/**
 * Test Setup File — हर test से पहले automatically चलता है
 * Browser APIs जो jsdom में नहीं हैं, उन्हें यहाँ mock किया गया है।
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ── Web Crypto API Mock ────────────────────────────────────────────────────────
// jsdom में window.crypto.subtle available है (Node 19+ में), लेकिन
// पुराने environments के लिए यहाँ global set करते हैं।
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

// ── localStorage Mock ─────────────────────────────────────────────────────────
const localStorageStore: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value; },
    removeItem: (key: string) => { delete localStorageStore[key]; },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
    get length() { return Object.keys(localStorageStore).length; },
    key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
  },
  writable: true,
});

// ── IndexedDB Mock (Dexie के लिए) ────────────────────────────────────────────
// fake-indexeddb library use करें अगर Dexie tests लिखनी हों
// यहाँ basic mock है
const indexedDBMock = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
};
Object.defineProperty(window, 'indexedDB', {
  value: indexedDBMock,
  writable: true,
});

// ── import.meta.env Mock ──────────────────────────────────────────────────────
// vitest.config.ts में define से handle होता है, यह backup है
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: false,
    PROD: false,
    VITE_APP_VERSION: 'test',
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  },
  writable: true,
});

// ── Console Errors दबाएँ (expected errors के लिए) ────────────────────────────
// Test में जानबूझकर गलत data डालने पर console.error spam न हो
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});
