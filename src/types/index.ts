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

// Batch preference options
export type BatchPreference = 'latest' | 'oldest' | 'custom' | 'category';

// Category for grouping items with default batch preference
export interface Category {
  id: string;
  name: string;
  batchPreference: Exclude<BatchPreference, 'category'>; // 'latest' | 'oldest' | 'custom'
  createdAt: Date;
  updatedAt: Date;
}

// Batch for tracking inventory batches per item
export interface Batch {
  id: string;
  itemId: string;
  batchNumber?: string;
  purchaseDate: Date;
  purchaseRate: number;
  primaryQuantity: number;
  secondaryQuantity: number;
  expiryDate?: Date;
  supplierId?: string;
  supplierName?: string;
  purchaseBillId?: string;
  createdAt: Date;
}

export interface BillItem {
  id: string;
  itemId?: string;
  batchId?: string;
  itemName: string;
  primaryQuantity: number;
  secondaryQuantity: number;
  secondaryUnit?: string;
  conversionRate?: number;
  rate: number;
  totalAmount: number;
}

export interface Bill {
  id: string;
  transactionId: string;
  items: BillItem[];
  totalAmount: number;
  billType?: BillType;
  billNumber?: string;
  customerName?: string;
  supplierName?: string;
  imageUrl?: string;
  createdAt: Date;
}

export interface GiveBackPayment {
  id: string;
  mode: PaymentMode;
  amount: number;
}

export interface Transaction {
  id: string;
  date: Date;
  section: TransactionSection;
  type: string;
  amount: number;
  payments: PaymentEntry[];
  giveBack?: GiveBackPayment[]; // Overpayment returned to customer
  billNumber?: string;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  employeeId?: string;
  welderId?: string;
  employeeName?: string;
  reference?: string;
  billType?: BillType;
  billId?: string;
  due?: number;
  overpayment?: number;
  adjustedFromSales?: number; // For expenses paid from sales cash
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
  paperBillName?: string; // How item is commonly written on paper bills
  categoryId?: string;
  batchPreference: BatchPreference; // 'latest' | 'oldest' | 'custom' | 'category'
  sellingPrice: number;
  secondaryUnit?: string;
  conversionRate?: number;
  // Computed fields (sum from batches)
  primaryQuantity?: number;
  secondaryQuantity?: number;
  purchaseRate?: number;
  inventoryValue?: number;
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
  drawerError?: number;
}

export const SECTIONS: { id: TransactionSection; label: string }[] = [
  { id: 'sale', label: 'Sale' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'employee', label: 'Employee' },
  { id: 'home', label: 'Home' },
  { id: 'exchange', label: 'Exchange' },
];

export const TYPE_OPTIONS: Record<TransactionSection, { value: string; label: string }[]> = {
  sale: [
    { value: 'sale', label: 'Sale' },
    { value: 'sales_return', label: 'Sales Return' },
    { value: 'customer_advance', label: 'Customer Advance' },
    { value: 'balance_paid', label: 'Balance Paid' },
  ],
  expenses: [
    { value: 'other_expenses', label: 'Other Expenses' },
    { value: 'vehicle_expenses', label: 'Vehicle Expenses' },
    { value: 'workshop_expenses', label: 'Workshop Expenses' },
  ],
  purchase: [
    { value: 'purchase_bill', label: 'Purchase Bill' },
    { value: 'purchase_delivered', label: 'Purchase Delivered' },
    { value: 'purchase_return', label: 'Purchase Return' },
    { value: 'purchase_payment', label: 'Purchase Payment' },
    { value: 'purchase_expenses', label: 'Purchase Expenses' },
  ],
  employee: [
    { value: 'salary', label: 'Salary Payment' },
    { value: 'daily_wage', label: 'Daily Wage' },
    { value: 'advance', label: 'Advance' },
  ],
  home: [
    { value: 'home_credit', label: 'Home Credit' },
    { value: 'home_debit', label: 'Home Debit' },
  ],
  exchange: [
    { value: 'exchange', label: 'Mode Exchange' },
  ],
};
