import { openDB, IDBPDatabase } from 'idb';
import { 
  Transaction, 
  Customer, 
  Supplier, 
  Employee, 
  Item, 
  Bill, 
  DrawerOpening, 
  DrawerClosing,
  ExchangeTransaction 
} from '@/types';

const DB_NAME = 'cash-management-db';
const DB_VERSION = 1;

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
    indexes: { 'by-name': string };
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
      },
    });
  }
  return dbPromise;
}

// Transaction operations
export async function addTransaction(transaction: Transaction): Promise<void> {
  const db = await getDB();
  await db.put('transactions', transaction);
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
