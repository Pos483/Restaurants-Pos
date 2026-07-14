import type { BillTranslations } from './en';

/**
 * Hindi — Hinglish (Roman script) locale
 *
 * WHY Hinglish (not Devanagari)?
 * ESC/POS thermal printers use ASCII / Code Page 437/850.
 * Devanagari Unicode characters render as garbage bytes on most
 * cheap thermal printers. Hinglish (Hindi written in Latin script)
 * is fully ASCII-safe, universally readable, and familiar to Indian users.
 *
 * Example: "धन्यवाद" → "Dhanyawad!" ✅ prints perfectly on any printer.
 */
export const hi: BillTranslations = {
  // ── Bill Header ───────────────────────────────────────────────────
  bill: {
    billNo:      'Bill Sankhya',
    table:       'Mez',
    customer:    'Grahak',
    phone:       'Phone',
    date:        'Tarikh',
    cashier:     'Cashier',
  },
  // ── Items Table ───────────────────────────────────────────────────
  items: {
    item:        'Vastu',
    qty:         'Matra',
    price:       'Mulya',
    unknown:     'Anya Vastu',
  },
  // ── Totals ────────────────────────────────────────────────────────
  totals: {
    subtotal:    'Upyog',
    discount:    'Chhoot',
    total:       'KUL JUDDHA',
    payment:     'Bhugtan',
    gst:         'GST Kar',
  },
  // ── UPI / QR ─────────────────────────────────────────────────────
  upi: {
    scanToPay:   'Scan karke Bhugtan Karen',
    via:         'UPI se',
  },
  // ── Footer ────────────────────────────────────────────────────────
  footer: {
    thankYou:    'Dhanyawad! Aapka Swagat Hai!',
    visitAgain:  'Phir Zaroor Aayein',
  },
  // ── KOT ──────────────────────────────────────────────────────────
  kot: {
    title:       'KOT (Rasoi Parchi)',
    order:       'Order',
    table:       'Mez',
    items:       'Vastu Soochi',
    preparedBy:  'Bananevala',
  },
  // ── Currency ─────────────────────────────────────────────────────
  currency: {
    symbol:      'Rs',
  },
};
