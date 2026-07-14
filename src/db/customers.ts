import { db } from './hybridTable';
import { notifyGlobalChange } from './client';
import { enqueueSync } from './sync';
import { DBCustomer, DBPosCustomer } from './types';

export const normalizePhone = (phone: string): string => {
  const digits = phone.trim().replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const getPosCustomerByPhone = async (phone: string): Promise<DBPosCustomer | null> => {
  if (!phone) return null;
  const clean = normalizePhone(phone);
  if (!clean) return null;
  try {
    const result = await db.posCustomers.dexieTable.where('phone').equals(clean).first();
    return result || null;
  } catch {
    return null;
  }
};

export const upsertPosCustomer = async (name: string, phone: string, billTotal: number = 0): Promise<void> => {
  if (!phone || !name?.trim()) return;
  const cleanPhone = normalizePhone(phone);
  const cleanName = name.trim();
  if (cleanPhone.length < 10) return;
  try {
    const existing = await getPosCustomerByPhone(cleanPhone);
    const now = Date.now();
    if (existing) {
      const updated: DBPosCustomer = {
        ...existing,
        name: cleanName,
        visitCount: (existing.visitCount || 0) + 1,
        totalSpent: (existing.totalSpent || 0) + billTotal,
        lastVisit: now,
      };
      await db.posCustomers.put(updated);
    } else {
      const newCustomer: DBPosCustomer = {
        id: crypto.randomUUID(),
        name: cleanName,
        phone: cleanPhone,
        visitCount: 1,
        totalSpent: billTotal,
        lastVisit: now,
        createdAt: now,
      };
      await db.posCustomers.put(newCustomer);
    }
  } catch (err) {
    console.error('[upsertPosCustomer] Error:', err);
  }
};

export const mergeDuplicateCustomers = async (phone: string): Promise<DBCustomer | null> => {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return null;

  const list = await db.customers.where('phone').equals(cleanPhone).toArray();
  if (list.length === 0) return null;

  let mainCustomer = list[0];
  if (list.length > 1) {
    console.log(`[DB] Merging ${list.length} duplicate customers for phone: ${cleanPhone}`);
    let mergedBalance = mainCustomer.balance || 0;
    
    for (let i = 1; i < list.length; i++) {
      const dup = list[i];
      mergedBalance += (dup.balance || 0);

      // 1. Point all transactions of the duplicate customer to the main customer
      const transactions = await db.customerTransactions.where('customerId').equals(dup.id).toArray();
      for (const tx of transactions) {
        await db.customerTransactions.update(tx.id, { customerId: mainCustomer.id });
        const updatedTx = await db.customerTransactions.get(tx.id);
        if (updatedTx) {
          await enqueueSync('customer_transactions', 'put', tx.id, updatedTx);
        }
      }

      // 2. Delete the duplicate customer record
      await db.customers.delete(dup.id);
      await enqueueSync('customers', 'delete', dup.id, null);
    }

    // 3. Update main customer with merged balance
    await db.customers.update(mainCustomer.id, { balance: mergedBalance });
    mainCustomer.balance = mergedBalance;

    const updatedMain = await db.customers.get(mainCustomer.id);
    if (updatedMain) {
      await enqueueSync('customers', 'put', mainCustomer.id, updatedMain);
    }
  }

  return mainCustomer;
};

export const recordCustomerCredit = async (name: string, phone: string, amount: number, billId?: string, billNumber?: number) => {
  if (!phone || !name) return;
  const cleanPhone = normalizePhone(phone);
  const cleanName = name.trim();

  try {
    // 1. Find or merge customer by phone
    let customer = await mergeDuplicateCustomers(cleanPhone);

    if (customer) {
      const limit = customer.creditLimit !== undefined ? customer.creditLimit : 10000;
      const newBalance = (customer.balance || 0) + amount;
      if (newBalance > limit) {
        throw new Error(`Customer credit limit of ₹${limit} exceeded. Current balance: ₹${customer.balance || 0}, New credit amount: ₹${amount}`);
      }
      await db.customers.update(customer.id, {
        balance: newBalance,
        name: cleanName,
      });
      customer = {
        ...customer,
        balance: newBalance,
        name: cleanName
      };
    } else {
      const limit = 10000;
      if (amount > limit) {
        throw new Error(`Customer credit limit of ₹${limit} exceeded. New credit amount: ₹${amount}`);
      }
      const id = crypto.randomUUID();
      customer = {
        id,
        name: cleanName,
        phone: cleanPhone,
        creditLimit: limit,
        balance: amount,
        timestamp: Date.now()
      };
      await db.customers.put(customer);
    }

    let billNumberStr = '';
    if (billNumber) {
       billNumberStr = ` for Bill #${billNumber.toString().padStart(6, '0')}`;
    } else if (billId) {
       billNumberStr = ` for Bill #${billId.slice(-6)}`;
    }

    // 2. Add a credit transaction log
    const txId = crypto.randomUUID();
    await db.customerTransactions.put({
      id: txId,
      customerId: customer.id,
      type: 'credit',
      amount,
      relatedBillId: billId,
      timestamp: Date.now(),
      note: `Bill settlement via Credit${billNumberStr}`
    });
  } catch (error) {
    console.error('Error in recordCustomerCredit:', error);
    throw error;
  }
};

export const recordCustomerPayment = async (customerId: string, amount: number, paymentMethod: string, note?: string) => {
  try {
    const customer = await db.customers.get(customerId);
    if (!customer) throw new Error(`Customer ${customerId} not found`);
    if (amount > (customer.balance || 0)) {
      throw new Error('Payment exceeds outstanding balance');
    }

    const newBalance = Math.max(0, (customer.balance || 0) - amount);
    await db.customers.update(customerId, { balance: newBalance });

    // FIFO match and auto-settle outstanding credit bills
    let remainingRepayment = amount;
    if (customer.phone) {
      const bills = await db.bills.where('customerPhone').equals(customer.phone).toArray();

      // Helper to calculate credit portion of a bill
      const getCreditAmountForBill = (bill: any): number => {
        if (!bill.paymentMethod) return 0;
        if (bill.paymentMethod === 'Credit' || bill.paymentMethod === 'Udhar' || bill.paymentMethod === 'Unpaid') {
          return bill.total;
        }
        if (bill.paymentMethod.startsWith('Split')) {
          const creditMatch = bill.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
          if (creditMatch && creditMatch[1]) {
            return parseFloat(creditMatch[1]);
          }
        }
        return 0;
      };

      // Helper to parse split components of a bill
      const parseSplitComponents = (splitStr: string) => {
        const cashMatch = splitStr.match(/Cash:\s*₹?([\d.]+)/);
        const upiMatch = splitStr.match(/UPI:\s*₹?([\d.]+)/);
        const cardMatch = splitStr.match(/Card:\s*₹?([\d.]+)/);
        const creditMatch = splitStr.match(/Credit:\s*₹?([\d.]+)/);

        return {
          Cash: cashMatch && cashMatch[1] ? parseFloat(cashMatch[1]) : 0,
          UPI: upiMatch && upiMatch[1] ? parseFloat(upiMatch[1]) : 0,
          Card: cardMatch && cardMatch[1] ? parseFloat(cardMatch[1]) : 0,
          Credit: creditMatch && creditMatch[1] ? parseFloat(creditMatch[1]) : 0,
        };
      };

      // Helper to format split payment string
      const formatSplitPaymentStr = (cash: number, upi: number, card: number, credit: number): string => {
        const parts: string[] = [];
        if (cash > 0) parts.push(`Cash: ₹${cash.toFixed(2)}`);
        if (upi > 0) parts.push(`UPI: ₹${upi.toFixed(2)}`);
        if (card > 0) parts.push(`Card: ₹${card.toFixed(2)}`);
        if (credit > 0) parts.push(`Credit: ₹${credit.toFixed(2)}`);
        return `Split (${parts.join(', ')})`;
      };

      const creditBills = bills.filter(b => {
        if (b.data?.status === 'cancelled') return false;
        return getCreditAmountForBill(b) > 0;
      });

      // Sort chronologically oldest first
      creditBills.sort((a, b) => a.timestamp - b.timestamp);

      for (const b of creditBills) {
        if (remainingRepayment <= 0) break;
        const creditAmt = getCreditAmountForBill(b);
        const applied = Math.min(creditAmt, remainingRepayment);

        let newPaymentMethod = '';
        if (applied === creditAmt) {
          // Credit portion is fully paid off
          if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar' || b.paymentMethod === 'Unpaid') {
            newPaymentMethod = paymentMethod;
          } else if (b.paymentMethod.startsWith('Split')) {
            const components = parseSplitComponents(b.paymentMethod);
            components.Credit = 0;
            if (paymentMethod === 'Cash') components.Cash += applied;
            else if (paymentMethod === 'UPI') components.UPI += applied;
            else if (paymentMethod === 'Card') components.Card += applied;

            const nonZero = Object.entries(components).filter(([_, val]) => val > 0);
            if (nonZero.length === 1) {
              newPaymentMethod = nonZero[0][0];
            } else {
              newPaymentMethod = formatSplitPaymentStr(components.Cash, components.UPI, components.Card, components.Credit);
            }
          }
        } else {
          // Credit portion is partially paid off
          if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar' || b.paymentMethod === 'Unpaid') {
            const cash = paymentMethod === 'Cash' ? applied : 0;
            const upi = paymentMethod === 'UPI' ? applied : 0;
            const card = paymentMethod === 'Card' ? applied : 0;
            const credit = creditAmt - applied;
            newPaymentMethod = formatSplitPaymentStr(cash, upi, card, credit);
          } else if (b.paymentMethod.startsWith('Split')) {
            const components = parseSplitComponents(b.paymentMethod);
            components.Credit = Math.max(0, components.Credit - applied);
            if (paymentMethod === 'Cash') components.Cash += applied;
            else if (paymentMethod === 'UPI') components.UPI += applied;
            else if (paymentMethod === 'Card') components.Card += applied;

            newPaymentMethod = formatSplitPaymentStr(components.Cash, components.UPI, components.Card, components.Credit);
          }
        }

        if (newPaymentMethod) {
          await db.bills.update(b.id, { paymentMethod: newPaymentMethod });
        }

        remainingRepayment -= applied;
      }
    }

    const txId = crypto.randomUUID();
    await db.customerTransactions.put({
      id: txId,
      customerId,
      type: 'payment',
      amount,
      timestamp: Date.now(),
      note: `${paymentMethod} Repayment: ${note || 'No notes'}`
    });

    notifyGlobalChange('bills');
    notifyGlobalChange('customers');
    notifyGlobalChange('customer_transactions');
  } catch (error) {
    console.error('Error in recordCustomerPayment:', error);
    throw error;
  }
};
