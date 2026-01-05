import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Item, Category, Batch, BatchPreference } from '@/types';

// Categories
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setCategories(data.map(c => ({
        id: c.id,
        name: c.name,
        batchPreference: c.batch_preference as Exclude<BatchPreference, 'category'>,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const addCategory = async (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: category.name, batch_preference: category.batchPreference })
      .select()
      .single();
    if (!error && data) { await fetchCategories(); return data.id; }
    return null;
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    await supabase.from('categories').update({
      name: updates.name,
      batch_preference: updates.batchPreference,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    await fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    await supabase.from('categories').delete().eq('id', id);
    await fetchCategories();
  };

  return { categories, loading, addCategory, updateCategory, deleteCategory, refetch: fetchCategories };
}

// Items
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase.from('items').select('*').order('name');
    if (!error && data) {
      setItems(data.map(i => ({
        id: i.id,
        name: i.name,
        categoryId: i.category_id || undefined,
        batchPreference: i.batch_preference as BatchPreference,
        sellingPrice: Number(i.selling_price),
        secondaryUnit: i.secondary_unit || undefined,
        conversionRate: i.conversion_rate ? Number(i.conversion_rate) : undefined,
        createdAt: new Date(i.created_at),
        updatedAt: new Date(i.updated_at),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Allow other screens to request a refresh after creating/updating items
  useEffect(() => {
    const handler = () => fetchItems();
    window.addEventListener('items:changed', handler);
    return () => window.removeEventListener('items:changed', handler);
  }, [fetchItems]);

  const addItem = async (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { data, error } = await supabase.from('items').insert({
      name: item.name,
      category_id: item.categoryId || null,
      batch_preference: item.batchPreference,
      selling_price: item.sellingPrice,
      secondary_unit: item.secondaryUnit || null,
      conversion_rate: item.conversionRate || null,
    }).select().single();
    if (!error && data) { await fetchItems(); return data.id; }
    return null;
  };

  const updateItem = async (id: string, updates: Partial<Item>) => {
    await supabase.from('items').update({
      name: updates.name,
      category_id: updates.categoryId || null,
      batch_preference: updates.batchPreference,
      selling_price: updates.sellingPrice,
      secondary_unit: updates.secondaryUnit || null,
      conversion_rate: updates.conversionRate || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    await fetchItems();
  };

  const deleteItem = async (id: string) => {
    await supabase.from('items').delete().eq('id', id);
    await fetchItems();
  };

  return { items, loading, addItem, updateItem, deleteItem, refetch: fetchItems };
}

// Batches
export function useBatches(itemId?: string) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBatches = useCallback(async () => {
    let query = supabase.from('batches').select('*').order('purchase_date', { ascending: false });
    if (itemId) query = query.eq('item_id', itemId);
    const { data, error } = await query;
    if (!error && data) {
      setBatches(data.map(b => ({
        id: b.id,
        itemId: b.item_id,
        batchNumber: b.batch_number || undefined,
        purchaseDate: new Date(b.purchase_date),
        purchaseRate: Number(b.purchase_rate),
        primaryQuantity: Number(b.primary_quantity),
        secondaryQuantity: Number(b.secondary_quantity),
        expiryDate: b.expiry_date ? new Date(b.expiry_date) : undefined,
        createdAt: new Date(b.created_at),
      })));
    }
    setLoading(false);
  }, [itemId]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const addBatch = async (batch: Omit<Batch, 'id' | 'createdAt'>) => {
    // Auto generate batch name as qty*rate
    const batchName = batch.batchNumber || `${batch.primaryQuantity}*${batch.purchaseRate}`;
    
    const { data, error } = await supabase.from('batches').insert({
      item_id: batch.itemId,
      batch_number: batchName,
      purchase_date: batch.purchaseDate.toISOString().split('T')[0],
      purchase_rate: batch.purchaseRate,
      primary_quantity: batch.primaryQuantity,
      secondary_quantity: batch.secondaryQuantity,
      expiry_date: batch.expiryDate?.toISOString().split('T')[0] || null,
    }).select().single();
    if (!error && data) { await fetchBatches(); return data.id; }
    return null;
  };

  const updateBatch = async (id: string, updates: Partial<Batch>) => {
    // Auto generate batch name as qty*rate if not provided
    const batchName = updates.batchNumber || 
      (updates.primaryQuantity !== undefined && updates.purchaseRate !== undefined 
        ? `${updates.primaryQuantity}*${updates.purchaseRate}` 
        : undefined);

    await supabase.from('batches').update({
      batch_number: batchName,
      purchase_date: updates.purchaseDate?.toISOString().split('T')[0],
      purchase_rate: updates.purchaseRate,
      primary_quantity: updates.primaryQuantity,
      secondary_quantity: updates.secondaryQuantity,
      expiry_date: updates.expiryDate?.toISOString().split('T')[0] || null,
    }).eq('id', id);
    await fetchBatches();
  };

  const deleteBatch = async (id: string) => {
    await supabase.from('batches').delete().eq('id', id);
    await fetchBatches();
  };

  return { batches, loading, addBatch, updateBatch, deleteBatch, refetch: fetchBatches };
}

// Get batches for a specific item
export async function getBatchesForItem(itemId: string): Promise<Batch[]> {
  const { data, error } = await supabase.from('batches').select('*').eq('item_id', itemId).order('purchase_date', { ascending: false });
  if (error || !data) return [];
  return data.map(b => ({
    id: b.id, itemId: b.item_id, batchNumber: b.batch_number || undefined,
    purchaseDate: new Date(b.purchase_date), purchaseRate: Number(b.purchase_rate),
    primaryQuantity: Number(b.primary_quantity), secondaryQuantity: Number(b.secondary_quantity),
    expiryDate: b.expiry_date ? new Date(b.expiry_date) : undefined, createdAt: new Date(b.created_at),
  }));
}

// Get all categories
export async function getAllCategoriesAsync(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error || !data) return [];
  return data.map(c => ({
    id: c.id, name: c.name, batchPreference: c.batch_preference as Exclude<BatchPreference, 'category'>,
    createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
  }));
}

// Create batch from purchase with auto batch name
export async function createBatchFromPurchase(
  itemId: string,
  itemName: string,
  billNumber: string,
  rate: number,
  primaryQty: number,
  secondaryQty: number
): Promise<string | null> {
  // First check if item exists, if not create it
  let actualItemId = itemId;
  
  if (!itemId) {
    // Create the item first
    const { data: newItem, error: itemError } = await supabase
      .from('items')
      .insert({
        name: itemName,
        selling_price: rate,
        batch_preference: 'latest',
      })
      .select()
      .single();
    
    if (itemError || !newItem) return null;
    actualItemId = newItem.id;
  }
  
  // Auto batch name as qty*rate
  const batchName = `${primaryQty}*${rate}`;
  
  // Create the batch
  const { data, error } = await supabase
    .from('batches')
    .insert({
      item_id: actualItemId,
      batch_number: batchName,
      purchase_date: new Date().toISOString().split('T')[0],
      purchase_rate: rate,
      primary_quantity: primaryQty,
      secondary_quantity: secondaryQty,
    })
    .select()
    .single();
  
  if (error || !data) return null;
  return data.id;
}

// Deduct from batch (for sales)
export async function deductFromBatch(
  batchId: string,
  primaryQty: number,
  secondaryQty: number
): Promise<boolean> {
  const { data: batch, error: fetchError } = await supabase
    .from('batches')
    .select('primary_quantity, secondary_quantity')
    .eq('id', batchId)
    .single();
  
  if (fetchError || !batch) return false;
  
  const { error } = await supabase
    .from('batches')
    .update({
      primary_quantity: Number(batch.primary_quantity) - primaryQty,
      secondary_quantity: Number(batch.secondary_quantity) - secondaryQty,
    })
    .eq('id', batchId);
  
  return !error;
}

// Update batch in Supabase
export async function updateBatchInSupabase(
  batchId: string,
  updates: {
    batchNumber?: string;
    purchaseDate?: Date;
    purchaseRate?: number;
    primaryQuantity?: number;
    secondaryQuantity?: number;
    expiryDate?: Date;
  }
): Promise<boolean> {
  // Auto generate batch name if qty and rate are provided
  const batchName = updates.batchNumber || 
    (updates.primaryQuantity !== undefined && updates.purchaseRate !== undefined 
      ? `${updates.primaryQuantity}*${updates.purchaseRate}` 
      : undefined);

  const { error } = await supabase
    .from('batches')
    .update({
      batch_number: batchName,
      purchase_date: updates.purchaseDate?.toISOString().split('T')[0],
      purchase_rate: updates.purchaseRate,
      primary_quantity: updates.primaryQuantity,
      secondary_quantity: updates.secondaryQuantity,
      expiry_date: updates.expiryDate?.toISOString().split('T')[0] || null,
    })
    .eq('id', batchId);

  return !error;
}

// Save bill and bill items to Supabase
export async function saveBillToSupabase(
  transactionId: string,
  billNumber: string,
  billType: string,
  totalAmount: number,
  customerName?: string,
  supplierName?: string,
  billItems?: { itemId?: string; batchId?: string; itemName: string; primaryQty: number; secondaryQty: number; rate: number; total: number }[]
): Promise<string | null> {
  // First, insert the transaction to ensure foreign key constraint is satisfied
  // We create a minimal transaction record if it doesn't exist
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('id', transactionId)
    .maybeSingle();

  if (!existingTx) {
    // Create a placeholder transaction
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        section: billType.includes('purchase') ? 'purchase' : 'sale',
        type: billType,
        amount: totalAmount,
        date: new Date().toISOString().split('T')[0],
        payments: [],
        customer_name: customerName || null,
        supplier_name: supplierName || null,
        bill_number: billNumber,
      });
    
    if (txError) {
      console.error('Error creating transaction:', txError);
      return null;
    }
  }

  // Create the bill
  const { data: bill, error: billError } = await supabase
    .from('bills')
    .insert({
      transaction_id: transactionId,
      bill_number: billNumber,
      bill_type: billType,
      total_amount: totalAmount,
      customer_name: customerName || null,
      supplier_name: supplierName || null,
    })
    .select()
    .single();

  if (billError || !bill) {
    console.error('Error creating bill:', billError);
    return null;
  }

  // Insert bill items if provided
  if (billItems && billItems.length > 0) {
    const itemsToInsert = billItems.filter(i => i.itemName && i.primaryQty > 0).map(item => ({
      bill_id: bill.id,
      item_id: item.itemId || null,
      batch_id: item.batchId || null,
      item_name: item.itemName,
      primary_quantity: item.primaryQty,
      secondary_quantity: item.secondaryQty,
      rate: item.rate,
      total_amount: item.total,
    }));

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase
        .from('bill_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error creating bill items:', itemsError);
      }
    }
  }

  return bill.id;
}

// Fetch customers with search and due bills
export async function searchCustomers(query: string): Promise<{
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  dueBalance: number;
  advanceBalance: number;
}[]> {
  let queryBuilder = supabase.from('customers').select('*');
  
  if (query) {
    queryBuilder = queryBuilder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
  }
  
  const { data, error } = await queryBuilder.order('name').limit(10);
  if (error || !data) return [];
  
  return data.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    dueBalance: Number(c.due_balance),
    advanceBalance: Number(c.advance_balance),
  }));
}

// Fetch due bills for a customer
export async function getDueBillsForCustomer(customerName: string): Promise<{
  id: string;
  billNumber: string;
  totalAmount: number;
  dueAmount: number;
  createdAt: Date;
}[]> {
  // Get transactions with due > 0 for this customer
  const { data, error } = await supabase
    .from('transactions')
    .select('id, bill_number, amount, due, created_at')
    .eq('customer_name', customerName)
    .gt('due', 0)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map(t => ({
    id: t.id,
    billNumber: t.bill_number || '',
    totalAmount: Number(t.amount),
    dueAmount: Number(t.due),
    createdAt: new Date(t.created_at),
  }));
}

// Update customer balance
export async function updateCustomerBalance(
  customerId: string,
  dueChange: number,
  advanceChange: number
): Promise<boolean> {
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('due_balance, advance_balance')
    .eq('id', customerId)
    .single();

  if (fetchError || !customer) return false;

  const { error } = await supabase
    .from('customers')
    .update({
      due_balance: Number(customer.due_balance) + dueChange,
      advance_balance: Number(customer.advance_balance) + advanceChange,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  return !error;
}

// Create or get customer by name
export async function getOrCreateCustomer(name: string, phone?: string): Promise<string | null> {
  // First try to find existing customer
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('name', name)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Create new customer
  const { data, error } = await supabase
    .from('customers')
    .insert({ name, phone: phone || null })
    .select()
    .single();

  if (error || !data) return null;
  return data.id;
}

// Use customer advance for sale
export async function useCustomerAdvance(
  customerId: string,
  amountToUse: number
): Promise<boolean> {
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('advance_balance')
    .eq('id', customerId)
    .single();

  if (fetchError || !customer) return false;

  const currentAdvance = Number(customer.advance_balance);
  if (currentAdvance < amountToUse) return false;

  const { error } = await supabase
    .from('customers')
    .update({
      advance_balance: currentAdvance - amountToUse,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  return !error;
}
