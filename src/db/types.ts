import { OrderItem } from '../types';

export interface BaseDBRecord {
  id?: string | number;
  restaurantCode?: string;
}

export interface DBMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isActive: boolean;
  isFavorite?: boolean;
  variants?: { name: string; price: number; stockItemId?: string; stockQtyPerUnit?: number; isActive?: boolean }[];
  stockItemId?: string;
  stockQtyPerUnit?: number;
  dietary?: 'veg' | 'non-veg' | 'egg';
  printerTarget?: 'kitchen' | 'bar';
}

export interface DBCategory {
  id: string;
  name: string;
}

export interface DBBill {
  id: string;
  tableId: number | string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount?: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: string;
  timestamp: number;
  billNumber?: number;
  data?: Record<string, any>;
}

export interface DBRestaurantProfile {
  id: string;
  restaurantName?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber: string;
  fssaiNumber: string;
  restaurantCode?: string;
  upiId?: string;
  upiEnabled?: boolean;
  thankYouMessage?: string;
  gstPercentage: number;
  subscriptionStatus?: 'trial' | 'premium';
  subscriptionPlan?: 'free-trial' | 'monthly' | 'half-yearly' | 'yearly' | 'lifetime';
  subscriptionExpiry?: number;
  licenseKey?: string;
  activationDate?: number;
  referredByRewardGranted?: boolean;
  referredBy?: string;
  referralClaimed?: boolean;
}

export interface DBRestaurantSettings {
  id: string;
  billSequence: number;
  kotSequence?: number;
  lastKotDate?: string;
  printPhone?: boolean;
  printEmail?: boolean;
  printAddress?: boolean;
  printFssai?: boolean;
  printGst?: boolean;
  printThankYou?: boolean;
  printQrCode?: boolean;
  baudRate?: number;
  printerWidth?: number;
  printerMode?: 'single' | 'multiple';
  categoryLayout?: 'top' | 'sidebar';
  billLanguage?: string;
}

export interface DBStockTransaction {
  id: string;
  stockItemId: string;
  type: 'in' | 'out';
  quantity: number;
  reason?: string;
  timestamp: number;
  relatedBillId?: string;
}

export interface DBStockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  lastUpdated: number;
}

export interface DBKdsOrder {
  id: string;
  tableOrType: string;
  items: OrderItem[];
  timestamp: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'delivered' | 'cancelled';
  kotNumber: string;
  completedAt?: number;
}

export interface DBCustomer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  balance: number;
  timestamp: number;
}

export interface DBCustomerTransaction {
  id: string;
  customerId: string;
  type: 'credit' | 'payment';
  amount: number;
  relatedBillId?: string;
  timestamp: number;
  note?: string;
}

export interface DBPosCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  birthday?: string;
  visitCount: number;
  totalSpent: number;
  lastVisit: number;
  createdAt: number;
  tags?: string[];
  notes?: string;
}

export interface DBExpense {
  id: string;
  amount: number;
  category: string;
  paymentMethod: string;
  note?: string;
  timestamp: number;
}

export interface SyncQueueItem {
  id?: number;
  tableName: string;
  action: 'put' | 'delete';
  recordId: string;
  recordData: Record<string, any>;
  timestamp: number;
  retryCount?: number;
}

export interface DBPrintJob {
  id: string;
  type: 'bills' | 'kds_orders';
  status: 'pending' | 'failed' | 'processing';
  timestamp: number;
  record: DBBill | DBKdsOrder;
  attempts?: number;
}
