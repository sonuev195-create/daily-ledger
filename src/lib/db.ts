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
const toDateKey = (value: Date | string) => {
  if (value instanceof Date) return format(value, 'yyyy-MM-dd');
  return value?.split('T')[0] || format(new Date(), 'yyyy-MM-dd');
};

const toSafeNumber = (value: unknown) => Number(value ?? 0) || 0;

const normalizePayments = (raw: unknown): PaymentEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry: any, index) => ({
    id: String(entry?.id || `${index}-${entry?.mode || 'payment'}`),
    mode: entry?.mode,
    amount: toSafeNumber(entry?.amount),
  })) as PaymentEntry[];
};

const normalizeGiveBack = (raw: unknown): GiveBackPayment[] | undefined => {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((entry: any, index) => ({
    id: String(entry?.id || `${index}-${entry?.mode || 'giveback'}`),
    mode: entry?.mode,
    amount: toSafeNumber(entry?.amount),
  })) as GiveBackPayment[];
};

const buildTransactionPayload = (transaction: Transaction) => ({
  id: transaction.id,
  date: toDateKey(transaction.date),
  section: transaction.section,
  type: transaction.type,
  amount: transaction.amount,
  payments: transaction.payments as any,
  give_back: (transaction.giveBack || []) as any,
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
  bill_type: transaction.billType || null,
  updated_at: transaction.updatedAt.toISOString(),
  created_at: transaction.createdAt.toISOString(),
});

const mapTransactionFromRow = (row: any): Transaction => ({
  id: row.id,
  date: new Date(row.date),
  section: row.section,
  type: row.type,
  amount: toSafeNumber(row.amount),
  payments: normalizePayments(row.payments),
  giveBack: normalizeGiveBack(row.give_back),
  billNumber: row.bill_number || undefined,
  customerId: row.customer_id || undefined,
  customerName: row.customer_name || undefined,
  supplierId: row.supplier_id || undefined,
  supplierName: row.supplier_name || undefined,
  employeeId: row.employee_id || undefined,
  welderId: row.welder_id || undefined,
  reference: row.reference || undefined,
  billType: row.bill_type || undefined,
  due: row.due != null ? toSafeNumber(row.due) : undefined,
  overpayment: row.overpayment != null ? toSafeNumber(row.overpayment) : undefined,
  adjustedFromSales: row.adjusted_from_sales != null ? toSafeNumber(row.adjusted_from_sales) : undefined,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
});

async function syncPartyBalancesFromTransactions(): Promise<void> {
  const [{ data: txRows, error: txError }, { data: customerRows, error: customerError }, { data: supplierRows, error: supplierError }] = await Promise.all([
    supabase.from('transactions').select('section, type, amount, due, payments, bill_type, customer_id, customer_name, supplier_id, supplier_name'),
    supabase.from('customers').select('id, name'),
    supabase.from('suppliers').select('id, name'),
  ]);

  if (txError) throw txError;
  if (customerError) throw customerError;
  if (supplierError) throw supplierError;

  const customers = customerRows || [];
  const suppliers = supplierRows || [];

  const customerByName = new Map(customers.map((c) => [String(c.name || '').trim().toLowerCase(), c.id]));
  const supplierByName = new Map(suppliers.map((s) => [String(s.name || '').trim().toLowerCase(), s.id]));

  const customerDue = new Map<string, number>(customers.map((c) => [c.id, 0]));
  const customerAdvance = new Map<string, number>(customers.map((c) => [c.id, 0]));
  const supplierBalance = new Map<string, number>(suppliers.map((s) => [s.id, 0]));

  (txRows || []).forEach((tx: any) => {
    const customerId = tx.customer_id || customerByName.get(String(tx.customer_name || '').trim().toLowerCase());
    const supplierId = tx.supplier_id || supplierByName.get(String(tx.supplier_name || '').trim().toLowerCase());

    if (tx.section === 'sale' && customerId) {
      const amount = toSafeNumber(tx.amount);
      const due = toSafeNumber(tx.due);
      const payments = normalizePayments(tx.payments);
      const advanceUsed = payments
        .filter((payment) => payment.mode === 'advance')
        .reduce((sum, payment) => sum + toSafeNumber(payment.amount), 0);

      if (tx.type === 'sale') {
        customerDue.set(customerId, (customerDue.get(customerId) || 0) + Math.max(0, due));
        if (advanceUsed > 0) {
          customerAdvance.set(customerId, (customerAdvance.get(customerId) || 0) - advanceUsed);
        }
      } else if (tx.type === 'customer_advance') {
        customerAdvance.set(customerId, (customerAdvance.get(customerId) || 0) + amount);
      } else if (tx.type === 'balance_paid') {
        customerDue.set(customerId, (customerDue.get(customerId) || 0) - amount);
      }
    }

    if (tx.section === 'purchase' && supplierId) {
      const amount = toSafeNumber(tx.amount);
      if (tx.type === 'purchase_bill' && tx.bill_type !== 'ng_bill') {
        supplierBalance.set(supplierId, (supplierBalance.get(supplierId) || 0) + amount);
      } else if (tx.type === 'purchase_return' || tx.type === 'purchase_payment') {
        supplierBalance.set(supplierId, (supplierBalance.get(supplierId) || 0) - amount);
      }
    }
  });

  await Promise.all([
    ...customers.map((customer) =>
      supabase
        .from('customers')
        .update({
          due_balance: Math.max(0, Number((customerDue.get(customer.id) || 0).toFixed(2))),
          advance_balance: Math.max(0, Number((customerAdvance.get(customer.id) || 0).toFixed(2))),
          updated_at: new Date().toISOString(),
        })
        .eq('id', customer.id)
    ),
    ...suppliers.map((supplier) =>
      supabase
        .from('suppliers')
        .update({
          balance: Math.max(0, Number((supplierBalance.get(supplier.id) || 0).toFixed(2))),
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplier.id)
    ),
  ]);
}

export async function addTransaction(transaction: Transaction): Promise<void> {
  const payload = buildTransactionPayload(transaction);
  const { error } = await supabase.from('transactions').upsert(payload);
  if (error) throw error;

  const db = await getDB();
  await db.put('transactions', transaction);

  try {
    await syncPartyBalancesFromTransactions();
  } catch (syncError) {
    console.error('Balance sync warning after add:', syncError);
  }
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function getTransactionsByDate(date: Date): Promise<Transaction[]> {
  const dateKey = toDateKey(date);

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('date', dateKey)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const mapped = (data || []).map(mapTransactionFromRow);
    const db = await getDB();
    const localRows = await db.getAll('transactions');
    const toDelete = localRows.filter((row) => toDateKey(row.date) === dateKey);

    await Promise.all([
      ...toDelete.map((row) => db.delete('transactions', row.id)),
      ...mapped.map((row) => db.put('transactions', row)),
    ]);

    return mapped;
  } catch (err) {
    console.error('Failed to load from backend, using local cache:', err);

    const db = await getDB();
    const all = await db.getAll('transactions');
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return all
      .filter((t) => {
        const tDate = new Date(t.date);
        return tDate >= startOfDay && tDate <= endOfDay;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}

export async function getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', toDateKey(startDate))
      .lte('date', toDateKey(endDate))
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapTransactionFromRow);
  } catch (err) {
    console.error('Failed to load range from backend, using local cache:', err);

    const db = await getDB();
    const all = await db.getAll('transactions');
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return all
      .filter((t) => {
        const tDate = new Date(t.date);
        return tDate >= start && tDate <= end;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const updatedTransaction: Transaction = {
    ...transaction,
    updatedAt: new Date(),
  };

  const payload = buildTransactionPayload(updatedTransaction);
  const { error } = await supabase.from('transactions').upsert(payload);
  if (error) throw error;

  const db = await getDB();
  await db.put('transactions', updatedTransaction);

  try {
    await syncPartyBalancesFromTransactions();
  } catch (syncError) {
    console.error('Balance sync warning after update:', syncError);
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const { data: relatedBills, error: relatedBillsError } = await supabase
    .from('bills')
    .select('id')
    .eq('transaction_id', id);

  if (relatedBillsError) throw relatedBillsError;

  const billIds = (relatedBills || []).map((bill) => bill.id);
  if (billIds.length > 0) {
    const { error: billItemsError } = await supabase
      .from('bill_items')
      .delete()
      .in('bill_id', billIds);
    if (billItemsError) throw billItemsError;

    const { error: billsDeleteError } = await supabase
      .from('bills')
      .delete()
      .in('id', billIds);
    if (billsDeleteError) throw billsDeleteError;
  }

  const { error: transactionDeleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (transactionDeleteError) throw transactionDeleteError;

  const db = await getDB();
  await db.delete('transactions', id);

  try {
    await syncPartyBalancesFromTransactions();
  } catch (syncError) {
    console.error('Balance sync warning after delete:', syncError);
  }
}
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
