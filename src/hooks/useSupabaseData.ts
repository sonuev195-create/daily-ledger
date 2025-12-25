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
    const { data, error } = await supabase.from('batches').insert({
      item_id: batch.itemId,
      batch_number: batch.batchNumber || null,
      purchase_date: batch.purchaseDate.toISOString().split('T')[0],
      purchase_rate: batch.purchaseRate,
      primary_quantity: batch.primaryQuantity,
      secondary_quantity: batch.secondaryQuantity,
      expiry_date: batch.expiryDate?.toISOString().split('T')[0] || null,
    }).select().single();
    if (!error && data) { await fetchBatches(); return data.id; }
    return null;
  };

  const deleteBatch = async (id: string) => {
    await supabase.from('batches').delete().eq('id', id);
    await fetchBatches();
  };

  return { batches, loading, addBatch, deleteBatch, refetch: fetchBatches };
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

// Create batch from purchase
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
  
  // Create the batch
  const { data, error } = await supabase
    .from('batches')
    .insert({
      item_id: actualItemId,
      batch_number: billNumber,
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
