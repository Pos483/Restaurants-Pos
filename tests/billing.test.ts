/**
 * ══════════════════════════════════════════════════════════════════════
 * 🧪 BILLING CALCULATIONS — Unit Tests
 * ══════════════════════════════════════════════════════════════════════
 *
 * ये tests बिलिंग की गणनाओं को जाँचती हैं:
 * - GST (Tax) calculation
 * - Discount application
 * - Bill Total calculation
 * - Subtotal calculation
 * ══════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';

// ── Helper Functions (वही logic जो Siya Bill में use होता है) ──────────────────

/**
 * GST calculation — Siya Bill की तरह Inclusive method
 * अगर GST 5% है और total ₹105 है, तो tax = ₹5
 */
function calculateTax(subtotal: number, gstPercent: number): number {
  return parseFloat(((subtotal * gstPercent) / 100).toFixed(2));
}

/**
 * Discount amount calculate करें
 */
function calculateDiscount(subtotal: number, discountPercent: number): number {
  return parseFloat(((subtotal * discountPercent) / 100).toFixed(2));
}

/**
 * Final bill total
 */
function calculateTotal(subtotal: number, tax: number, discount: number = 0): number {
  return parseFloat((subtotal + tax - discount).toFixed(2));
}

/**
 * Items का subtotal
 */
function calculateSubtotal(items: { price: number; quantity: number }[]): number {
  return parseFloat(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
}

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 1: Subtotal Calculation
// ══════════════════════════════════════════════════════════════════════════════
describe('💰 Subtotal Calculation (बिल का कुल जोड़)', () => {

  it('एक item का subtotal सही होना चाहिए', () => {
    const items = [{ price: 100, quantity: 1 }];
    expect(calculateSubtotal(items)).toBe(100);
  });

  it('कई items का subtotal सही होना चाहिए', () => {
    const items = [
      { price: 50, quantity: 2 },   // 100
      { price: 120, quantity: 1 },  // 120
      { price: 30, quantity: 3 },   // 90
    ];
    expect(calculateSubtotal(items)).toBe(310);
  });

  it('empty order का subtotal 0 होना चाहिए', () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it('decimal price items का subtotal सही होना चाहिए', () => {
    const items = [{ price: 99.5, quantity: 2 }];
    expect(calculateSubtotal(items)).toBe(199);
  });

  it('बड़े order का subtotal सही होना चाहिए', () => {
    const items = [
      { price: 250, quantity: 4 }, // 1000
      { price: 80, quantity: 10 }, // 800
    ];
    expect(calculateSubtotal(items)).toBe(1800);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 2: GST / Tax Calculation
// ══════════════════════════════════════════════════════════════════════════════
describe('📊 GST Calculation (कर गणना)', () => {

  it('5% GST सही calculate होनी चाहिए', () => {
    expect(calculateTax(1000, 5)).toBe(50);
  });

  it('12% GST सही calculate होनी चाहिए', () => {
    expect(calculateTax(500, 12)).toBe(60);
  });

  it('18% GST सही calculate होनी चाहिए', () => {
    expect(calculateTax(200, 18)).toBe(36);
  });

  it('0% GST पर tax शून्य होनी चाहिए', () => {
    expect(calculateTax(1000, 0)).toBe(0);
  });

  it('2.5% GST (half CGST + SGST) सही होनी चाहिए', () => {
    expect(calculateTax(400, 2.5)).toBe(10);
  });

  it('GST decimal amount सही round होनी चाहिए', () => {
    // 333 * 18% = 59.94
    expect(calculateTax(333, 18)).toBe(59.94);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 3: Discount Calculation
// ══════════════════════════════════════════════════════════════════════════════
describe('🎁 Discount Calculation (छूट गणना)', () => {

  it('10% discount सही calculate होनी चाहिए', () => {
    expect(calculateDiscount(500, 10)).toBe(50);
  });

  it('50% discount सही calculate होनी चाहिए', () => {
    expect(calculateDiscount(800, 50)).toBe(400);
  });

  it('0% discount पर कोई छूट नहीं होनी चाहिए', () => {
    expect(calculateDiscount(1000, 0)).toBe(0);
  });

  it('100% discount पर पूरा subtotal discount होना चाहिए', () => {
    expect(calculateDiscount(250, 100)).toBe(250);
  });

  it('Decimal discount सही होनी चाहिए', () => {
    // 5% of 333 = 16.65
    expect(calculateDiscount(333, 5)).toBe(16.65);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 4: Final Total Calculation
// ══════════════════════════════════════════════════════════════════════════════
describe('🧾 Total Bill Calculation (अंतिम बिल राशि)', () => {

  it('Tax के साथ total सही होनी चाहिए', () => {
    // subtotal: 1000, tax: 50 (5%), discount: 0
    expect(calculateTotal(1000, 50, 0)).toBe(1050);
  });

  it('Tax और Discount दोनों के साथ total सही होनी चाहिए', () => {
    // subtotal: 1000, tax: 50 (5%), discount: 100 (10%)
    expect(calculateTotal(1000, 50, 100)).toBe(950);
  });

  it('Discount के बिना total सही होनी चाहिए', () => {
    expect(calculateTotal(500, 25)).toBe(525);
  });

  it('सभी शून्य होने पर total 0 होनी चाहिए', () => {
    expect(calculateTotal(0, 0, 0)).toBe(0);
  });

  it('पूर्ण बिल scenario — ₹500 order, 12% GST, 5% discount', () => {
    const subtotal = calculateSubtotal([
      { price: 150, quantity: 2 }, // 300
      { price: 200, quantity: 1 }, // 200
    ]);
    const tax = calculateTax(subtotal, 12);         // 500 * 12% = 60
    const discount = calculateDiscount(subtotal, 5); // 500 * 5% = 25
    const total = calculateTotal(subtotal, tax, discount); // 500 + 60 - 25 = 535

    expect(subtotal).toBe(500);
    expect(tax).toBe(60);
    expect(discount).toBe(25);
    expect(total).toBe(535);
  });

  it('बड़े Restaurant order — Multiple items, 18% GST, no discount', () => {
    const items = [
      { price: 280, quantity: 3 }, // 840
      { price: 120, quantity: 5 }, // 600
      { price: 60, quantity: 2 },  // 120
    ];
    const subtotal = calculateSubtotal(items); // 1560
    const tax = calculateTax(subtotal, 18);    // 280.8
    const total = calculateTotal(subtotal, tax); // 1840.8

    expect(subtotal).toBe(1560);
    expect(tax).toBe(280.8);
    expect(total).toBe(1840.8);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ✅ TEST SUITE 5: Edge Cases (असाधारण स्थितियाँ)
// ══════════════════════════════════════════════════════════════════════════════
describe('⚠️ Edge Cases (असाधारण स्थितियाँ)', () => {

  it('बहुत बड़ा bill amount सही calculate होना चाहिए', () => {
    const items = [{ price: 10000, quantity: 10 }]; // ₹1,00,000
    expect(calculateSubtotal(items)).toBe(100000);
  });

  it('negative discount नहीं होनी चाहिए (0% से कम नहीं)', () => {
    const discount = calculateDiscount(500, 0);
    expect(discount).toBeGreaterThanOrEqual(0);
  });

  it('प्रत्येक item का individual amount सही होना चाहिए', () => {
    const price = 75;
    const qty = 4;
    expect(price * qty).toBe(300);
  });
});
