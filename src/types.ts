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

export type Table = {
  id: number;
  status: 'available' | 'occupied';
  orders: OrderItem[];
  tablePin?: string;
  customerName?: string;
  customerPhone?: string;
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
