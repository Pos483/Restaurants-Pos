import { describe, it, expect } from 'vitest';

interface DenominationCounts {
  notes500: number;
  notes200: number;
  notes100: number;
  notes50: number;
  notes20: number;
  notes10: number;
  notes5: number;
  coins20: number;
  coins10: number;
  coins5: number;
  coins2: number;
  coins1: number;
}

function calculateCounterCashTotals(
  denominations: DenominationCounts,
  customOwnerAmount?: number | null
) {
  const bigNotesTotal = 
    (denominations.notes500 * 500) +
    (denominations.notes200 * 200) +
    (denominations.notes100 * 100) +
    (denominations.notes50 * 50);

  const smallNotesTotal = 
    (denominations.notes20 * 20) +
    (denominations.notes10 * 10) +
    (denominations.notes5 * 5);

  const coinsTotal = 
    (denominations.coins20 * 20) +
    (denominations.coins10 * 10) +
    (denominations.coins5 * 5) +
    (denominations.coins2 * 2) +
    (denominations.coins1 * 1);

  const smallNotesCoinsTotal = smallNotesTotal + coinsTotal;
  const totalCash = bigNotesTotal + smallNotesCoinsTotal;

  const ownerWithdrawal = 
    customOwnerAmount !== undefined && customOwnerAmount !== null
      ? customOwnerAmount
      : bigNotesTotal;

  const counterClosingFloat = Math.max(0, totalCash - ownerWithdrawal);

  return {
    bigNotesTotal,
    smallNotesTotal,
    coinsTotal,
    smallNotesCoinsTotal,
    totalCash,
    ownerWithdrawal,
    counterClosingFloat,
  };
}

function calculateTallyDiscrepancy(totalCash: number, cashSales: number, cashExpenses: number) {
  const expectedCash = Math.max(0, cashSales - cashExpenses);
  const discrepancy = totalCash - expectedCash;
  return {
    expectedCash,
    discrepancy,
    isMatch: discrepancy === 0,
    isSurplus: discrepancy > 0,
    isShortage: discrepancy < 0,
  };
}

describe('Counter Cash & Coin Closing Denomination Logic', () => {
  it('correctly calculates big notes total (owner takeaway)', () => {
    const counts: DenominationCounts = {
      notes500: 10, // 5000
      notes200: 5,  // 1000
      notes100: 8,  // 800
      notes50: 4,   // 200
      notes20: 0,
      notes10: 0,
      notes5: 0,
      coins20: 0,
      coins10: 0,
      coins5: 0,
      coins2: 0,
      coins1: 0,
    };

    const res = calculateCounterCashTotals(counts);
    expect(res.bigNotesTotal).toBe(7000);
    expect(res.ownerWithdrawal).toBe(7000);
    expect(res.smallNotesCoinsTotal).toBe(0);
    expect(res.counterClosingFloat).toBe(0);
    expect(res.totalCash).toBe(7000);
  });

  it('correctly calculates small notes & coins left in counter float', () => {
    const counts: DenominationCounts = {
      notes500: 0,
      notes200: 0,
      notes100: 0,
      notes50: 0,
      notes20: 10, // 200
      notes10: 15, // 150
      notes5: 6,   // 30
      coins20: 5,  // 100
      coins10: 10, // 100
      coins5: 20,  // 100
      coins2: 25,  // 50
      coins1: 50,  // 50
    };

    const res = calculateCounterCashTotals(counts);
    expect(res.bigNotesTotal).toBe(0);
    expect(res.smallNotesTotal).toBe(380);
    expect(res.coinsTotal).toBe(400);
    expect(res.smallNotesCoinsTotal).toBe(780);
    expect(res.totalCash).toBe(780);
    // By default, owner takes big notes (0), so counter gets all small notes & coins
    expect(res.ownerWithdrawal).toBe(0);
    expect(res.counterClosingFloat).toBe(780);
  });

  it('correctly splits combined drawer into owner takeaway and morning counter float', () => {
    const counts: DenominationCounts = {
      notes500: 20, // 10,000
      notes200: 10, // 2,000
      notes100: 15, // 1,500
      notes50: 10,  // 500
      // Total big notes = 14,000
      notes20: 15,  // 300
      notes10: 20,  // 200
      notes5: 10,   // 50
      coins20: 5,   // 100
      coins10: 15,  // 150
      coins5: 20,   // 100
      coins2: 25,   // 50
      coins1: 30,   // 30
      // Total small notes & coins = 980
    };

    const res = calculateCounterCashTotals(counts);
    expect(res.totalCash).toBe(14980);
    expect(res.bigNotesTotal).toBe(14000);
    expect(res.smallNotesCoinsTotal).toBe(980);
    expect(res.ownerWithdrawal).toBe(14000);
    expect(res.counterClosingFloat).toBe(980);
  });

  it('handles custom owner withdrawal amount gracefully', () => {
    const counts: DenominationCounts = {
      notes500: 20, // 10,000
      notes200: 5,  // 1,000
      notes100: 0,
      notes50: 0,
      notes20: 10,  // 200
      notes10: 10,  // 100
      notes5: 0,
      coins20: 0,
      coins10: 10,  // 100
      coins5: 0,
      coins2: 0,
      coins1: 0,
    };
    // Total cash = 11,400
    // Suppose owner takes flat 11,000 leaving 400 in drawer
    const res = calculateCounterCashTotals(counts, 11000);
    expect(res.totalCash).toBe(11400);
    expect(res.ownerWithdrawal).toBe(11000);
    expect(res.counterClosingFloat).toBe(400);
  });

  it('correctly tallies cash discrepancy with billing sales and expenses', () => {
    // 1. Exact Match
    const match = calculateTallyDiscrepancy(15000, 16000, 1000);
    expect(match.expectedCash).toBe(15000);
    expect(match.discrepancy).toBe(0);
    expect(match.isMatch).toBe(true);
    expect(match.isSurplus).toBe(false);
    expect(match.isShortage).toBe(false);

    // 2. Surplus (+200)
    const surplus = calculateTallyDiscrepancy(15200, 16000, 1000);
    expect(surplus.expectedCash).toBe(15000);
    expect(surplus.discrepancy).toBe(200);
    expect(surplus.isSurplus).toBe(true);

    // 3. Shortage (-350)
    const shortage = calculateTallyDiscrepancy(14650, 16000, 1000);
    expect(shortage.expectedCash).toBe(15000);
    expect(shortage.discrepancy).toBe(-350);
    expect(shortage.isShortage).toBe(true);
  });
});
