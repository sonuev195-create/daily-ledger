import { openDB, IDBPDatabase } from 'idb';
import {
  Transaction,
  PaymentEntry,
  GiveBackPayment,
  Customer,
  Supplier,
  Employee,
  Item,
  Bill,
  DrawerOpening,
  DrawerClosing,
  ExchangeTransaction,
  Category,
  Batch
} from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const DB_NAME = 'cash-management-db';
const DB_VERSION = 2;

export type CashManagementDB = IDBPDatabase<{
  transactions: {
    key: string;
    value: Transaction;
    indexes: { 'by-date': Date; 'by-section': string };
  };
  customers: {
    key: string;
    value: Customer;
    indexes: { 'by-name': string };
  };
  suppliers: {
    key: string;
    value: Supplier;
    indexes: { 'by-name': string };
  };
  employees: {
    key: string;
    value: Employee;
    indexes: { 'by-name': string };
  };
  items: {
    key: string;
    value: Item;
    indexes: { 'by-name': string; 'by-category': string };
  };
  bills: {
    key: string;
    value: Bill;
    indexes: { 'by-transaction': string };
  };
  drawerOpenings: {
    key: string;
    value: DrawerOpening;
    indexes: { 'by-date': Date };
  };
  drawerClosings: {
    key: string;
    value: DrawerClosing;
    indexes: { 'by-date': Date };
  };
  exchanges: {
    key: string;
    value: ExchangeTransaction;
    indexes: { 'by-date': Date };
  };
  categories: {
    key: string;
    value: Category;
    indexes: { 'by-name': string };
  };
  batches: {
    key: string;
    value: Batch;
    indexes: { 'by-item': string; 'by-date': Date };
  };
}>;

let dbPromise: Promise<CashManagementDB> | null = null;

export async function getDB(): Promise<CashManagementDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Transactions store
        if (!db.objectStoreNames.contains('transactions')) {
          const transactionStore = db.createObjectStore('transactions', { keyPath: 'id' });
          transactionStore.createIndex('by-date', 'date');
          transactionStore.createIndex('by-section', 'section');
        }

        // Customers store
        if (!db.objectStoreNames.contains('customers')) {
          const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
          customerStore.createIndex('by-name', 'name');
        }

        // Suppliers store
        if (!db.objectStoreNames.contains('suppliers')) {
          const supplierStore = db.createObjectStore('suppliers', { keyPath: 'id' });
          supplierStore.createIndex('by-name', 'name');
        }

        // Employees store
        if (!db.objectStoreNames.contains('employees')) {
          const employeeStore = db.createObjectStore('employees', { keyPath: 'id' });
          employeeStore.createIndex('by-name', 'name');
        }

        // Items store
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('by-name', 'name');
        }

        // Bills store
        if (!db.objectStoreNames.contains('bills')) {
          const billStore = db.createObjectStore('bills', { keyPath: 'id' });
          billStore.createIndex('by-transaction', 'transactionId');
        }

        // Drawer openings store
        if (!db.objectStoreNames.contains('drawerOpenings')) {
          const openingStore = db.createObjectStore('drawerOpenings', { keyPath: 'id' });
          openingStore.createIndex('by-date', 'date');
        }

        // Drawer closings store
        if (!db.objectStoreNames.contains('drawerClosings')) {
          const closingStore = db.createObjectStore('drawerClosings', { keyPath: 'id' });
          closingStore.createIndex('by-date', 'date');
        }

        // Exchanges store
        if (!db.objectStoreNames.contains('exchanges')) {
          const exchangeStore = db.createObjectStore('exchanges', { keyPath: 'id' });
          exchangeStore.createIndex('by-date', 'date');
        }

        // Categories store
        if (!db.objectStoreNames.contains('categories')) {
          const categoryStore = db.createObjectStore('categories', { keyPath: 'id' });
          categoryStore.createIndex('by-name', 'name');
        }

        // Batches store
        if (!db.objectStoreNames.contains('batches')) {
          const batchStore = db.createObjectStore('batches', { keyPath: 'id' });
          batchStore.createIndex('by-item', 'itemId');
          batchStore.createIndex('by-date', 'purchaseDate');
        }
      },
    });
  }
  return dbPromise;
}

// Transaction operations
export async function addTransaction(transaction: Transaction): Promise<void> {
  const db = await getDB();
  await db.put('transactions', transaction);
  
  // Also sync to Supabase
  try {
    await supabase.from('transactions').upsert({
      id: transaction.id,
      date: typeof transaction.date === 'string' ? transaction.date : format(transaction.date, 'yyyy-MM-dd'),
      section: transaction.section,
      type: transaction.type,
      amount: transaction.amount,
      payments: transaction.payments as any,
      give_back: transaction.giveBack as any || [],
      bill_number: transaction.billNumber || null,
      customer_id: transaction.customerId || null,
      customer_name: transaction.customerName || null,
      supplier_id: transaction.supplierId || null,
      supplier_name: transaction.supplierName || null,
      employee_id: transaction.employeeId || null,
      welder_id: transaction.welderId || null,
      due: transaction.due || null,
      overpayment: transaction.overpayment || null,
      adjusted_from_sales: transaction.adjustedFromSales || 0,
      reference: transaction.reference || null,
    });
  } catch (err) {
    console.error('Supabase sync error:', err);
  }
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function getTransactionsByDate(date: Date): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAll('transactions');
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return all.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= startOfDay && tDate <= endOfDay;
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAll('transactions');
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  return all.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= start && tDate <= end;
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const db = await getDB();
  transaction.updatedAt = new Date();
  await db.put('transactions', transaction);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('transactions', id);
}

// Customer operations
export async function addCustomer(customer: Customer): Promise<void> {
  const db = await getDB();
  await db.put('customers', customer);
}

export async function getAllCustomers(): Promise<Customer[]> {
  const db = await getDB();
  return db.getAll('customers');
}

export async function updateCustomer(customer: Customer): Promise<void> {
  const db = await getDB();
  customer.updatedAt = new Date();
  await db.put('customers', customer);
}

// Supplier operations
export async function addSupplier(supplier: Supplier): Promise<void> {
  const db = await getDB();
  await db.put('suppliers', supplier);
}

export async function getAllSuppliers(): Promise<Supplier[]> {
  const db = await getDB();
  return db.getAll('suppliers');
}

// Employee operations
export async function addEmployee(employee: Employee): Promise<void> {
  const db = await getDB();
  await db.put('employees', employee);
}

export async function getAllEmployees(): Promise<Employee[]> {
  const db = await getDB();
  return db.getAll('employees');
}

// Item operations
export async function addItem(item: Item): Promise<void> {
  const db = await getDB();
  await db.put('items', item);
}

export async function getAllItems(): Promise<Item[]> {
  const db = await getDB();
  return db.getAll('items');
}

export async function updateItem(item: Item): Promise<void> {
  const db = await getDB();
  item.updatedAt = new Date();
  await db.put('items', item);
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('items', id);
}

export async function bulkAddItems(items: Item[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  await Promise.all([
    ...items.map(item => tx.store.put(item)),
    tx.done
  ]);
}

// Bill operations
export async function addBill(bill: Bill): Promise<void> {
  const db = await getDB();
  await db.put('bills', bill);
}

export async function getAllBills(): Promise<Bill[]> {
  const db = await getDB();
  return db.getAll('bills');
}

export async function getBillByTransactionId(transactionId: string): Promise<Bill | undefined> {
  const db = await getDB();
  const all = await db.getAll('bills');
  return all.find(b => b.transactionId === transactionId);
}

export async function getBillById(id: string): Promise<Bill | undefined> {
  const db = await getDB();
  return db.get('bills', id);
}

export async function updateBill(bill: Bill): Promise<void> {
  const db = await getDB();
  await db.put('bills', bill);
}

// Drawer operations
export async function getDrawerOpening(date: Date): Promise<DrawerOpening | undefined> {
  const db = await getDB();
  const all = await db.getAll('drawerOpenings');
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return all.find(d => {
    const dDate = new Date(d.date);
    dDate.setHours(0, 0, 0, 0);
    return dDate.getTime() === startOfDay.getTime();
  });
}

export async function saveDrawerOpening(opening: DrawerOpening): Promise<void> {
  const db = await getDB();
  await db.put('drawerOpenings', opening);
}

export async function getDrawerClosing(date: Date): Promise<DrawerClosing | undefined> {
  const db = await getDB();
  const all = await db.getAll('drawerClosings');
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return all.find(d => {
    const dDate = new Date(d.date);
    dDate.setHours(0, 0, 0, 0);
    return dDate.getTime() === startOfDay.getTime();
  });
}

export async function saveDrawerClosing(closing: DrawerClosing): Promise<void> {
  const db = await getDB();
  await db.put('drawerClosings', closing);
}

// Exchange operations
export async function addExchange(exchange: ExchangeTransaction): Promise<void> {
  const db = await getDB();
  await db.put('exchanges', exchange);
}

export async function getExchangesByDate(date: Date): Promise<ExchangeTransaction[]> {
  const db = await getDB();
  const all = await db.getAll('exchanges');
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return all.filter(e => {
    const eDate = new Date(e.date);
    return eDate >= startOfDay && eDate <= endOfDay;
  });
}

export async function getAllExchanges(): Promise<ExchangeTransaction[]> {
  const db = await getDB();
  return db.getAll('exchanges');
}

// Category operations
export async function addCategory(category: Category): Promise<void> {
  const db = await getDB();
  await db.put('categories', category);
}

export async function getAllCategories(): Promise<Category[]> {
  const db = await getDB();
  return db.getAll('categories');
}

export async function updateCategory(category: Category): Promise<void> {
  const db = await getDB();
  category.updatedAt = new Date();
  await db.put('categories', category);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('categories', id);
}

// Batch operations
export async function addBatch(batch: Batch): Promise<void> {
  const db = await getDB();
  await db.put('batches', batch);
}

export async function getAllBatches(): Promise<Batch[]> {
  const db = await getDB();
  return db.getAll('batches');
}

export async function getBatchesByItem(itemId: string): Promise<Batch[]> {
  const db = await getDB();
  const all = await db.getAll('batches');
  return all.filter(b => b.itemId === itemId).sort((a, b) => 
    new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
  );
}

export async function updateBatch(batch: Batch): Promise<void> {
  const db = await getDB();
  await db.put('batches', batch);
}

export async function deleteBatch(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('batches', id);
}

export async function bulkAddBatches(batches: Batch[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('batches', 'readwrite');
  await Promise.all([
    ...batches.map(batch => tx.store.put(batch)),
    tx.done
  ]);
}
