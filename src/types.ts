export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  isActive?: boolean;
  isFavorite?: boolean;
  variants?: { name: string; price: number; stockItemId?: string; stockQtyPerUnit?: number; isActive?: boolean }[];
  stockItemId?: string;
  stockQtyPerUnit?: number;
  dietary?: 'veg' | 'non-veg' | 'egg';
  printerTarget?: 'kitchen' | 'bar';
};

export type OrderItem = {
  menuItem: MenuItem;
  quantity: number;
  printedQuantity?: number;
  name?: string;
  price?: number;
};

export type MergedTableSnapshot = {
  tableId: number;
  orders: OrderItem[];
  customerName?: string;
  customerPhone?: string;
};

export type Table = {
  id: number;
  status: 'available' | 'occupied';
  orders: OrderItem[];
  tablePin?: string;
  customerName?: string;
  customerPhone?: string;
  mergedTableIds?: number[];
  mergedSnapshots?: MergedTableSnapshot[];
};

export const mergeOrderItems = (targetOrders: OrderItem[], sourceOrders: OrderItem[]): OrderItem[] => {
  const result: OrderItem[] = targetOrders.map(o => ({
    ...o,
    menuItem: { ...o.menuItem }
  }));

  for (const src of sourceOrders) {
    const srcId = src.menuItem?.id || src.name;
    const existingIndex = result.findIndex(item => (item.menuItem?.id || item.name) === srcId);
    const srcPrinted = src.printedQuantity !== undefined ? src.printedQuantity : (src.quantity || 0);

    if (existingIndex > -1) {
      const existing = result[existingIndex];
      const newQty = (existing.quantity || 0) + (src.quantity || 0);
      const newPrintedQty = (existing.printedQuantity || 0) + srcPrinted;
      result[existingIndex] = {
        ...existing,
        quantity: newQty,
        printedQuantity: Math.min(newPrintedQty, newQty)
      };
    } else {
      result.push({
        ...src,
        menuItem: { ...src.menuItem },
        quantity: src.quantity || 0,
        printedQuantity: srcPrinted
      });
    }
  }

  return result;
};

export interface AppUser {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  user_metadata?: {
    restaurant_name?: string;
    phone?: string;
  };
}

export const getLocalDateString = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
