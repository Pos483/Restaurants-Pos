/**
 * English (en) — Default bill and print translations
 * All strings are ASCII-safe for ESC/POS thermal printers
 */
export const en = {
  // ── Bill Header ───────────────────────────────────────────────────
  bill: {
    billNo:      'Bill No',
    table:       'Table',
    customer:    'Customer',
    phone:       'Phone',
    date:        'Date',
    cashier:     'Cashier',
  },
  // ── Items Table ───────────────────────────────────────────────────
  items: {
    item:        'Item',
    qty:         'Qty',
    price:       'Price',
    unknown:     'Unknown Item',
  },
  // ── Totals ────────────────────────────────────────────────────────
  totals: {
    subtotal:    'Subtotal',
    discount:    'Discount',
    total:       'TOTAL',
    payment:     'Payment',
    gst:         'GST',
  },
  // ── UPI / QR ─────────────────────────────────────────────────────
  upi: {
    scanToPay:   'Scan to Pay',
    via:         'via UPI',
  },
  // ── Footer ────────────────────────────────────────────────────────
  footer: {
    thankYou:    'Thank You for Visiting!',
    visitAgain:  'Please Visit Again',
  },
  // ── KOT ──────────────────────────────────────────────────────────
  kot: {
    title:       'KOT',
    order:       'Order',
    table:       'Table',
    items:       'Items',
    preparedBy:  'Prepared By',
  },
  // ── Currency ─────────────────────────────────────────────────────
  currency: {
    symbol:      'Rs',
  },
};

export type BillTranslations = typeof en;
