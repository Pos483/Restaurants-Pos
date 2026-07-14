import { DBBill } from '../db/types';
import { OrderItem } from '../types';

export const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const getItemName = (item: OrderItem): string => {
  return item?.menuItem?.name || (item as unknown as { name?: string })?.name || 'Unknown Item';
};

export const getItemPrice = (item: OrderItem): number => {
  return item?.menuItem?.price ?? (item as unknown as { price?: number })?.price ?? 0;
};

export const formatDateStr = (dateStr: string) => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return dateStr;
  const day = String(parts[2]).padStart(2, '0');
  const month = monthNames[parts[1] - 1] || '';
  const year = parts[0];
  return `${day} ${month} ${year}`;
};

export const fastFormatDate = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

export interface ReportStats {
  totalSales: number;
  totalOrders: number;
  totalTax: number;
  subTotal: number;
  totalDiscount: number;
  totalUnpaid: number;
  paymentStats: Record<string, number>;
  dailyStats: Record<string, { orders: number; subtotal: number; discount: number; tax: number; sales: number; timestamp: number }>;
  hourlyStats: Record<string, { orders: number; sales: number }>;
  itemStats: Record<string, { qty: number; revenue: number; category: string }>;
  weekdayStats: { day: string; sales: number; orders: number; count: number }[];
  categoryStats: Record<string, { qty: number; revenue: number }>;
}

export const calculateBackendStats = (
  bills: DBBill[] | undefined,
  startDate: string,
  endDate: string
): ReportStats => {
  if (!bills) {
    return {
      totalSales: 0,
      totalOrders: 0,
      totalTax: 0,
      subTotal: 0,
      totalDiscount: 0,
      totalUnpaid: 0,
      paymentStats: {},
      dailyStats: {},
      hourlyStats: {},
      itemStats: {},
      weekdayStats: [],
      categoryStats: {}
    };
  }

  let totalSales = 0;
  let totalTax = 0;
  let subTotal = 0;
  let totalDiscount = 0;
  let totalUnpaid = 0;
  let activeOrdersCount = 0;

  const paymentStats: Record<string, number> = {};
  const dailyStats: Record<string, any> = {};
  const hourlyStats: Record<string, any> = {};
  const itemStats: Record<string, { qty: number; revenue: number; category: string }> = {};
  const categoryStats: Record<string, { qty: number; revenue: number }> = {};

  // Count occurrences of each weekday in the selected range to get an accurate average
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // 0 = Sunday, 1 = Monday...
  try {
    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);
    if (startParts.length === 3 && endParts.length === 3) {
      const startD = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const endD = new Date(endParts[0], endParts[1] - 1, endParts[2]);
      const tempDate = new Date(startD);
      let safetyCount = 0;
      while (tempDate <= endD && safetyCount < 400) {
        weekdayCounts[tempDate.getDay()] += 1;
        tempDate.setDate(tempDate.getDate() + 1);
        safetyCount++;
      }
    }
  } catch (e) {
    console.error('Error calculating weekday counts:', e);
  }

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayStats: Record<string, { day: string; sales: number; orders: number; count: number }> = {};
  weekdayNames.forEach((day, index) => {
    weekdayStats[day] = { day, sales: 0, orders: 0, count: weekdayCounts[index] || 1 };
  });

  for (const b of bills) {
    if (b.data?.status === 'cancelled') continue; // Skip cancelled bills
    activeOrdersCount++;
    subTotal += b.subtotal;
    totalTax += b.tax;
    totalDiscount += b.discount || 0;

    if (b.paymentMethod.startsWith('Split')) {
      const cashMatch = b.paymentMethod.match(/Cash:\s*₹?([\d.]+)/);
      const upiMatch = b.paymentMethod.match(/UPI:\s*₹?([\d.]+)/);
      const creditMatch = b.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);

      let cashAmt = 0;
      let upiAmt = 0;
      let creditAmt = 0;

      if (cashMatch && cashMatch[1]) cashAmt = parseFloat(cashMatch[1]);
      if (upiMatch && upiMatch[1]) upiAmt = parseFloat(upiMatch[1]);
      if (creditMatch && creditMatch[1]) creditAmt = parseFloat(creditMatch[1]);

      paymentStats['Cash'] = (paymentStats['Cash'] || 0) + cashAmt;
      paymentStats['UPI'] = (paymentStats['UPI'] || 0) + upiAmt;
      paymentStats['Credit'] = (paymentStats['Credit'] || 0) + creditAmt;

      totalUnpaid += creditAmt;
      totalSales += (cashAmt + upiAmt);
    } else {
      if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Udhar') {
        totalUnpaid += b.total;
        paymentStats['Credit'] = (paymentStats['Credit'] || 0) + b.total;
      } else if (b.paymentMethod === 'Unpaid') {
        totalUnpaid += b.total;
        paymentStats['Unpaid'] = (paymentStats['Unpaid'] || 0) + b.total;
      } else {
        totalSales += b.total;
        paymentStats[b.paymentMethod] = (paymentStats[b.paymentMethod] || 0) + b.total;
      }
    }

    const dateStr = fastFormatDate(b.timestamp);
    if (!dailyStats[dateStr]) dailyStats[dateStr] = { orders: 0, subtotal: 0, discount: 0, tax: 0, sales: 0, timestamp: b.timestamp };
    dailyStats[dateStr].orders += 1;
    dailyStats[dateStr].subtotal += b.subtotal;
    dailyStats[dateStr].discount += b.discount || 0;
    dailyStats[dateStr].tax += b.tax;

    let receivedAmount = b.total;
    if (b.paymentMethod.startsWith('Split')) {
       const creditMatch = b.paymentMethod.match(/Credit:\s*₹?([\d.]+)/);
       const creditAmt = creditMatch && creditMatch[1] ? parseFloat(creditMatch[1]) : 0;
       receivedAmount = b.total - creditAmt;
    } else if (b.paymentMethod === 'Credit' || b.paymentMethod === 'Unpaid' || b.paymentMethod === 'Udhar') {
       receivedAmount = 0;
    }
    dailyStats[dateStr].sales += receivedAmount;

    const billDate = new Date(b.timestamp);
    const dayName = weekdayNames[billDate.getDay()];
    if (weekdayStats[dayName]) {
      weekdayStats[dayName].sales += receivedAmount;
      weekdayStats[dayName].orders += 1;
    }

    const hour = new Date(b.timestamp).getHours();
    const hourStr = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
    if (!hourlyStats[hourStr]) hourlyStats[hourStr] = { orders: 0, sales: 0 };
    hourlyStats[hourStr].orders += 1;
    hourlyStats[hourStr].sales += b.total;

    const items = b.items || b.data?.items || [];
    for (const item of items) {
      const name = getItemName(item);
      const price = getItemPrice(item);
      const category = item?.menuItem?.category || (item as unknown as { category?: string })?.category || 'Uncategorized';

      if (!itemStats[name]) itemStats[name] = { qty: 0, revenue: 0, category };
      itemStats[name].qty += item.quantity;
      itemStats[name].revenue += (price * item.quantity);

      if (!categoryStats[category]) {
        categoryStats[category] = { qty: 0, revenue: 0 };
      }
      categoryStats[category].qty += item.quantity;
      categoryStats[category].revenue += (price * item.quantity);
    }
  }

  return {
    totalSales,
    totalOrders: activeOrdersCount,
    totalTax,
    subTotal,
    totalDiscount,
    totalUnpaid,
    paymentStats,
    dailyStats,
    hourlyStats,
    itemStats,
    weekdayStats: Object.values(weekdayStats),
    categoryStats
  };
};
