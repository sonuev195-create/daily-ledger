export type PaymentMode = 'cash' | 'upi' | 'bank' | 'advance' | 'adjust';

export interface PaymentEntry {
  id: string;
  mode: PaymentMode;
  amount: number;
}

export type TransactionSection = 'sale' | 'expenses' | 'purchase' | 'employee' | 'home' | 'exchange';

export type SaleType = 'sale' | 'sales_return' | 'customer_advance' | 'balance_paid';
export type ExpenseType = 'other_expenses' | 'vehicle_expenses' | 'workshop_expenses';
export type PurchaseType = 'purchase_bill' | 'purchase_delivered' | 'purchase_return' | 'purchase_payment' | 'purchase_expenses';
export type HomeType = 'home_credit' | 'home_debit';
export type BillType = 'g_bill' | 'n_bill';

export interface BillItem {
  id: string;
  itemName: string;
  primaryQuantity: number;
  secondaryQuantity: number;
  totalAmount: number;
}

export interface Bill {
  id: string;
  transactionId: string;
  items: BillItem[];
  totalAmount: number;
  billType?: BillType;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  date: Date;
  section: TransactionSection;
  type: string;
  amount: number;
  payments: PaymentEntry[];
  billNumber?: string;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  employeeId?: string;
  employeeName?: string;
  reference?: string;
  billType?: BillType;
  billId?: string;
  due?: number;
  overpayment?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  advanceBalance: number;
  dueBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  type: 'salary' | 'daily_wage' | 'quotation';
  salary?: number;
  dailyRate?: number;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Item {
  id: string;
  name: string;
  primaryQuantity: number;
  secondaryQuantity: number;
  purchaseRate: number;
  sellingPrice: number;
  inventoryValue: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DrawerOpening {
  id: string;
  date: Date;
  coin: number;
  cash: number;
  homeAdvance: number;
  upiOpening: number;
  bankOpening: number;
}

export interface DrawerClosing {
  id: string;
  date: Date;
  systemCash: number;
  manualCoin: number;
  manualCash: number;
  cashToHome: number;
  difference: number;
  systemUpi: number;
  systemBank: number;
}

export interface ExchangeTransaction {
  id: string;
  date: Date;
  takenBy: { mode: PaymentMode; amount: number };
  givenBy: { mode: PaymentMode; amount: number };
  createdAt: Date;
}

export interface DailySummary {
  date: Date;
  totalSales: number;
  totalExpenses: number;
  totalPurchases: number;
  cashIn: number;
  cashOut: number;
  upiIn: number;
  upiOut: number;
  transactionCount: number;
}
