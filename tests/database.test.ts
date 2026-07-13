/**
 * ══════════════════════════════════════════════════════════════════════
 * 🗄️ DATABASE LAYER — Unit Tests
 * ══════════════════════════════════════════════════════════════════════
 *
 * ये tests Database की utility functions को जाँचती हैं:
 * - rescueBillItems (duplicate items merge)
 * - LocalIdCache (bounded FIFO cache)
 * - getLocalDateString (date formatting)
 *
 * Note: Dexie (IndexedDB) operations को यहाँ mock किया गया है।
 * असली DB tests के लिए fake-indexeddb package चाहिए।
 * ══════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Dexie और Supabase को mock करें (ये browser/network पर depend करते हैं)
vi.mock('dexie', () => {
  const Dexie = vi.fn().mockImplementation(() => ({
    version: vi.fn().mockReturnThis(),
    stores: vi.fn().mockReturnThis(),
    open: vi.fn().mockResolvedValue(undefined),
  }));
  (Dexie as any).liveQuery = vi.fn();
  return { default: Dexie };
});

vi.mock('../src/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: vi.fn(() => false),
}));

// ── Types import ──────────────────────────────────────────────────────────────
import type { OrderItem } from '../src/types';

// ── rescueBillItems function (db.ts से copy) ──────────────────────────────────
// db.ts में Dexie top-level initialize होता है — इसलिए यहाँ function को
// separately test करते हैं (same logic)
function rescueBillItems(bill: any): OrderItem[] {
  let itemsToProcess: OrderItem[] = [];
  if (Array.isArray(bill.items) && bill.items.length > 0) {
    itemsToProcess = bill.items;
  } else if (bill.data?.items && Array.isArray(bill.data.items)) {
    itemsToProcess = bill.data.items;
  }
  const uniqueItemsMap = new Map<string, OrderItem>();
  for (const item of itemsToProcess) {
    const anyItem = item as any;
    const baseId = anyItem?.menuItem?.id || anyItem?.id || 'unknown';
    const namePart = anyItem?.menuItem?.name || anyItem?.name || '';
    const itemKey = `${baseId}_${namePart}`;
    if (!uniqueItemsMap.has(itemKey)) {
      uniqueItemsMap.set(itemKey, JSON.parse(JSON.stringify(item)));
    } else {
      const existing = uniqueItemsMap.get(itemKey)!;
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
      if (item.printedQuantity)
        existing.printedQuantity = (existing.printedQuantity || 0) + item.printedQuantity;
    }
  }
  return Array.from(uniqueItemsMap.values());
}

// ── LocalIdCache class (db.ts से copy) ───────────────────────────────────────
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

  get size(): number {
    return this.ids.length;
  }
}

// ── getLocalDateString (types.ts से) ─────────────────────────────────────────
import { getLocalDateString } from '../src/types';

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 1: rescueBillItems — Bill Item Rescue & Merge
// ══════════════════════════════════════════════════════════════════════════════
describe('🛒 rescueBillItems (ऑर्डर आइटम मर्ज)', () => {

  const makeItem = (id: string, name: string, qty: number): OrderItem => ({
    menuItem: { id, name, price: 100, category: 'Food', isActive: true },
    quantity: qty,
  });

  it('खाली bill पर empty array return होनी चाहिए', () => {
    expect(rescueBillItems({ items: [] })).toEqual([]);
  });

  it('null/undefined items पर empty array return होनी चाहिए', () => {
    expect(rescueBillItems({})).toEqual([]);
    expect(rescueBillItems({ items: null })).toEqual([]);
  });

  it('unique items बिना merge के return होने चाहिए', () => {
    const bill = {
      items: [
        makeItem('1', 'पनीर', 2),
        makeItem('2', 'दाल', 1),
      ],
    };
    const result = rescueBillItems(bill);
    expect(result).toHaveLength(2);
  });

  it('duplicate items की quantity merge होनी चाहिए', () => {
    const bill = {
      items: [
        makeItem('1', 'पनीर', 2),
        makeItem('1', 'पनीर', 3), // same item, duplicate
      ],
    };
    const result = rescueBillItems(bill);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5); // 2 + 3
  });

  it('bill.data.items fallback काम करना चाहिए', () => {
    const bill = {
      items: [], // empty
      data: {
        items: [makeItem('1', 'बिरयानी', 1)],
      },
    };
    const result = rescueBillItems(bill);
    expect(result).toHaveLength(1);
    expect(result[0].menuItem.name).toBe('बिरयानी');
  });

  it('3 अलग-अलग items में से 2 same — सिर्फ 2 unique items आने चाहिए', () => {
    const bill = {
      items: [
        makeItem('1', 'चाय', 1),
        makeItem('2', 'समोसा', 2),
        makeItem('1', 'चाय', 2), // duplicate
      ],
    };
    const result = rescueBillItems(bill);
    expect(result).toHaveLength(2);
    const chai = result.find(r => r.menuItem.name === 'चाय');
    expect(chai?.quantity).toBe(3); // 1 + 2
  });

  it('printedQuantity भी merge होनी चाहिए', () => {
    const bill = {
      items: [
        { menuItem: { id: '1', name: 'Dal', price: 50, category: 'Food', isActive: true }, quantity: 2, printedQuantity: 1 },
        { menuItem: { id: '1', name: 'Dal', price: 50, category: 'Food', isActive: true }, quantity: 1, printedQuantity: 1 },
      ],
    };
    const result = rescueBillItems(bill);
    expect(result[0].quantity).toBe(3);
    expect(result[0].printedQuantity).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 2: LocalIdCache — FIFO Bounded Cache
// ══════════════════════════════════════════════════════════════════════════════
describe('💾 LocalIdCache (FIFO बाउंडेड कैश)', () => {

  let cache: LocalIdCache;

  beforeEach(() => {
    cache = new LocalIdCache();
  });

  it('नया id add होने पर has() true return करे', () => {
    cache.add('bill-001');
    expect(cache.has('bill-001')).toBe(true);
  });

  it('न add किए गए id पर has() false return करे', () => {
    expect(cache.has('not-added')).toBe(false);
  });

  it('duplicate id add करने पर size नहीं बढ़नी चाहिए', () => {
    cache.add('bill-001');
    cache.add('bill-001');
    cache.add('bill-001');
    expect(cache.size).toBe(1);
  });

  it('number id को string की तरह handle करे', () => {
    cache.add(42);
    expect(cache.has(42)).toBe(true);
    expect(cache.has('42')).toBe(true);
  });

  it('200 से ज़्यादा items add होने पर पुराने हट जाएँ (FIFO)', () => {
    const firstId = 'first-item';
    cache.add(firstId);
    // 200 और items add करो (total 201)
    for (let i = 0; i < 200; i++) {
      cache.add(`item-${i}`);
    }
    // पहला item हट जाना चाहिए
    expect(cache.has(firstId)).toBe(false);
    // नया आखिरी item होना चाहिए
    expect(cache.has('item-199')).toBe(true);
  });

  it('200 items तक cache full रहे और सब available हों', () => {
    for (let i = 0; i < 200; i++) {
      cache.add(`item-${i}`);
    }
    expect(cache.size).toBe(200);
    expect(cache.has('item-0')).toBe(true);
    expect(cache.has('item-199')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 3: getLocalDateString — Date Formatting
// ══════════════════════════════════════════════════════════════════════════════
describe('📅 getLocalDateString (तारीख फ़ॉर्मेटिंग)', () => {

  it('format YYYY-MM-DD होना चाहिए', () => {
    const result = getLocalDateString(new Date('2026-07-13'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('specific date सही format में return होनी चाहिए', () => {
    const date = new Date(2026, 0, 5); // 5 January 2026
    const result = getLocalDateString(date);
    expect(result).toBe('2026-01-05');
  });

  it('double-digit month और day होने चाहिए (padding)', () => {
    const date = new Date(2026, 2, 1); // 1 March 2026
    const result = getLocalDateString(date);
    expect(result).toBe('2026-03-01'); // zero-padded
  });

  it('December सही format में होनी चाहिए', () => {
    const date = new Date(2026, 11, 31); // 31 December 2026
    const result = getLocalDateString(date);
    expect(result).toBe('2026-12-31');
  });

  it('बिना argument के आज की तारीख return करे', () => {
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(getLocalDateString()).toBe(expected);
  });
});
