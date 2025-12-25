import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Plus, ChevronDown } from 'lucide-react';
import { BillItem, Item, Batch } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { useItems, getBatchesForItem, createBatchFromPurchase } from '@/hooks/useSupabaseData';

interface BillItemsEntryProps {
  billItems: BillItem[];
  setBillItems: (items: BillItem[]) => void;
  mode: 'sale' | 'purchase';
  billNumber?: string;
}

export function BillItemsEntry({ billItems, setBillItems, mode, billNumber }: BillItemsEntryProps) {
  const { items: allItems } = useItems();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const createEmptyBillItem = (): BillItem => ({
    id: uuidv4(),
    itemId: undefined,
    batchId: undefined,
    itemName: '',
    primaryQuantity: 0,
    secondaryQuantity: 0,
    secondaryUnit: undefined,
    conversionRate: undefined,
    rate: 0,
    totalAmount: 0,
  });

  const addBillItem = () => {
    const newItem = createEmptyBillItem();
    setBillItems([...billItems, newItem]);
    setExpandedItem(newItem.id);
  };

  const removeBillItem = (id: string) => {
    if (billItems.length > 1) {
      setBillItems(billItems.filter(item => item.id !== id));
    }
  };

  const updateBillItem = (id: string, updates: Partial<BillItem>) => {
    setBillItems(billItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...updates };
        
        // Auto-calculate total if qty or rate changed
        if ('primaryQuantity' in updates || 'rate' in updates) {
          const qty = updates.primaryQuantity ?? item.primaryQuantity;
          const rate = updates.rate ?? item.rate;
          updated.totalAmount = qty * rate;
        }
        
        // Auto-calculate secondary quantity from primary if conversion rate exists
        if ('primaryQuantity' in updates && item.conversionRate) {
          updated.secondaryQuantity = updates.primaryQuantity! * item.conversionRate;
        }
        
        // Auto-calculate primary from secondary if user edits secondary
        if ('secondaryQuantity' in updates && item.conversionRate && item.conversionRate > 0) {
          updated.primaryQuantity = updates.secondaryQuantity! / item.conversionRate;
          updated.totalAmount = updated.primaryQuantity * item.rate;
        }
        
        return updated;
      }
      return item;
    }));
  };

  const handleItemSelect = async (billItemId: string, itemId: string) => {
    const selectedItem = allItems.find(i => i.id === itemId);
    if (!selectedItem) return;

    let rate = selectedItem.sellingPrice;
    let batchId: string | undefined;

    // For sales, get batch and rate based on preference
    if (mode === 'sale') {
      const batches = await getBatchesForItem(itemId);
      if (batches.length > 0) {
        // Get latest batch (already sorted by purchase_date desc)
        const selectedBatch = batches[0];
        batchId = selectedBatch.id;
        // Use selling price, but could use batch purchase rate if needed
      }
    }

    updateBillItem(billItemId, {
      itemId,
      batchId,
      itemName: selectedItem.name,
      rate,
      secondaryUnit: selectedItem.secondaryUnit,
      conversionRate: selectedItem.conversionRate,
    });
  };

  const billTotal = billItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  return (
    <div className="space-y-3">
      {billItems.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-secondary/30 rounded-xl p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {mode === 'sale' ? 'Sale Item' : 'Purchase Item'} {index + 1}
            </span>
            {billItems.length > 1 && (
              <button
                onClick={() => removeBillItem(item.id)}
                className="text-destructive hover:bg-destructive/10 p-1 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          {/* Item Selection or Name Input */}
          {mode === 'sale' && allItems.length > 0 ? (
            <select
              value={item.itemId || ''}
              onChange={(e) => {
                if (e.target.value) {
                  handleItemSelect(item.id, e.target.value);
                } else {
                  updateBillItem(item.id, { 
                    itemId: undefined, 
                    itemName: '', 
                    rate: 0,
                    secondaryUnit: undefined,
                    conversionRate: undefined,
                  });
                }
              }}
              className="input-field text-sm"
            >
              <option value="">Select Item</option>
              {allItems.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={item.itemName}
              onChange={(e) => updateBillItem(item.id, { itemName: e.target.value })}
              placeholder="Item Name"
              className="input-field text-sm"
            />
          )}
          
          {/* Quantities Row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Primary Qty</label>
              <input
                type="number"
                value={item.primaryQuantity || ''}
                onChange={(e) => updateBillItem(item.id, { primaryQuantity: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {item.secondaryUnit ? `Secondary (${item.secondaryUnit})` : 'Secondary Qty'}
              </label>
              <input
                type="number"
                value={item.secondaryQuantity || ''}
                onChange={(e) => updateBillItem(item.id, { secondaryQuantity: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Conversion info */}
          {item.conversionRate && (
            <div className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
              1 primary = {item.conversionRate} {item.secondaryUnit || 'secondary'}
            </div>
          )}
          
          {/* Rate and Total Row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rate</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                <input
                  type="number"
                  value={item.rate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0;
                    updateBillItem(item.id, { 
                      rate, 
                      totalAmount: item.primaryQuantity * rate 
                    });
                  }}
                  placeholder="0"
                  className="input-field text-sm pl-5"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Total</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                <input
                  type="number"
                  value={item.totalAmount || ''}
                  onChange={(e) => updateBillItem(item.id, { totalAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="input-field text-sm pl-5 font-medium"
                />
              </div>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Add Item Button - Always below last row */}
      <button
        onClick={addBillItem}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-accent/30 text-accent text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent/5 transition-colors"
      >
        <Plus className="w-4 h-4" /> Add Item
      </button>

      {/* Bill Total */}
      <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-muted-foreground">Bill Total</span>
          <span className="text-xl font-bold text-accent">
            ₹{billTotal.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper to create batches from purchase bill items
export async function createBatchesFromPurchase(
  billItems: BillItem[],
  billNumber: string
): Promise<void> {
  for (const item of billItems) {
    if (item.itemName && item.primaryQuantity > 0) {
      await createBatchFromPurchase(
        item.itemId || '',
        item.itemName,
        billNumber,
        item.rate,
        item.primaryQuantity,
        item.secondaryQuantity
      );
    }
  }
}
