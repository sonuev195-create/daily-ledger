import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Plus, ChevronDown, ChevronUp, Package, Camera, Upload, Loader2, CheckCircle2, AlertCircle, XCircle, Edit2, Check } from 'lucide-react';
import { BillItem, Item, Batch, BatchPreference, Category } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { useItems, getBatchesForItem, getAllCategoriesAsync } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractedOcrItem {
  extractedName: string;
  matchedName: string | null;
  quantity: number;
  amount: number;
  confidence: 'high' | 'medium' | 'low';
  selectedItemId: string | null; // user-corrected item
  confirmed: boolean; // user confirmed match is correct
}

interface BatchWithStock extends Batch {
  stockLabel: string; // e.g., "10*50" (qty*rate)
}

interface SaleBillItemsEntryProps {
  billItems: BillItem[];
  setBillItems: (items: BillItem[]) => void;
}

export function SaleBillItemsEntry({ billItems, setBillItems }: SaleBillItemsEntryProps) {
  const { items: allItems } = useItems();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [batchesMap, setBatchesMap] = useState<Record<string, BatchWithStock[]>>({});
  const [categoriesMap, setCategoriesMap] = useState<Record<string, Category>>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrReviewItems, setOcrReviewItems] = useState<ExtractedOcrItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load categories for batch preference resolution
  useEffect(() => {
    getAllCategoriesAsync().then(cats => {
      const map: Record<string, Category> = {};
      cats.forEach(c => map[c.id] = c);
      setCategoriesMap(map);
    });
  }, []);

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

  // Resolve batch preference for an item (item level or from category)
  const getEffectiveBatchPreference = (item: Item): Exclude<BatchPreference, 'category'> => {
    if (item.batchPreference !== 'category') {
      return item.batchPreference as Exclude<BatchPreference, 'category'>;
    }
    if (item.categoryId && categoriesMap[item.categoryId]) {
      return categoriesMap[item.categoryId].batchPreference;
    }
    return 'latest'; // default
  };

  // Sort batches based on preference (oldest first in display, but selection based on preference)
  const sortBatchesForDisplay = (batches: Batch[]): BatchWithStock[] => {
    // Always display oldest first, latest last
    const sorted = [...batches].sort((a, b) => 
      new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
    );
    
    return sorted
      .filter(b => b.primaryQuantity > 0) // Only batches with stock
      .map(b => ({
        ...b,
        stockLabel: `${b.primaryQuantity}*${b.purchaseRate}`,
      }));
  };

  // Get batch to auto-select based on preference
  const getAutoSelectBatch = (batches: Batch[], preference: Exclude<BatchPreference, 'category'>): Batch | null => {
    const withStock = batches.filter(b => b.primaryQuantity > 0);
    if (withStock.length === 0) return null;

    if (preference === 'oldest') {
      // FIFO - oldest first
      return withStock.sort((a, b) => 
        new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
      )[0];
    } else {
      // LIFO - latest first (default)
      return withStock.sort((a, b) => 
        new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
      )[0];
    }
  };

  const loadBatchesForItem = useCallback(async (itemId: string) => {
    const batches = await getBatchesForItem(itemId);
    const displayBatches = sortBatchesForDisplay(batches);
    setBatchesMap(prev => ({ ...prev, [itemId]: displayBatches }));
    return batches;
  }, []);

  const handleItemSelect = async (billItemId: string, itemId: string) => {
    const selectedItem = allItems.find(i => i.id === itemId);
    if (!selectedItem) return;

    const batches = await loadBatchesForItem(itemId);
    const preference = getEffectiveBatchPreference(selectedItem);
    const autoSelectedBatch = preference !== 'custom' ? getAutoSelectBatch(batches, preference) : null;
    
    // Use selling price from item, or batch purchase rate if needed
    const rate = selectedItem.sellingPrice;

    updateBillItem(billItemId, {
      itemId,
      batchId: autoSelectedBatch?.id,
      itemName: selectedItem.name,
      rate,
      secondaryUnit: selectedItem.secondaryUnit,
      conversionRate: selectedItem.conversionRate,
    });

    // Load batches for display
    await loadBatchesForItem(itemId);
  };

  const handleBatchSelect = (billItemId: string, batchId: string) => {
    const item = billItems.find(i => i.id === billItemId);
    if (!item?.itemId) return;

    const batches = batchesMap[item.itemId] || [];
    const selectedBatch = batches.find(b => b.id === batchId);
    
    updateBillItem(billItemId, {
      batchId,
      // Optionally update rate from batch purchase rate
    });
  };

  // Handle paste for quick data entry
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, billItemId: string, field: string) => {
    const text = e.clipboardData.getData('text');
    
    // Try to parse as tab-separated values (from spreadsheet)
    const parts = text.split('\t');
    if (parts.length >= 2) {
      e.preventDefault();
      
      // Format: Name, Qty, Rate or Name, PrimaryQty, SecondaryQty, Rate
      const updates: Partial<BillItem> = {};
      
      if (field === 'itemName' && parts[0]) {
        updates.itemName = parts[0].trim();
      }
      if (parts[1] && !isNaN(parseFloat(parts[1]))) {
        updates.primaryQuantity = parseFloat(parts[1]);
      }
      if (parts[2] && !isNaN(parseFloat(parts[2]))) {
        updates.rate = parseFloat(parts[2]);
        updates.totalAmount = (updates.primaryQuantity || 0) * updates.rate;
      }
      
      if (Object.keys(updates).length > 0) {
        updateBillItem(billItemId, updates);
      }
    }
  };

  const billTotal = billItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  // Calculate total stock for an item
  const getTotalStock = (itemId: string): string => {
    const batches = batchesMap[itemId] || [];
    const totalQty = batches.reduce((sum, b) => sum + b.primaryQuantity, 0);
    const avgRate = batches.length > 0 
      ? batches.reduce((sum, b) => sum + b.purchaseRate * b.primaryQuantity, 0) / totalQty 
      : 0;
    return totalQty > 0 ? `${totalQty}*${avgRate.toFixed(0)}` : '0';
  };

  // Auto-add next row when current row has item selected
  useEffect(() => {
    const lastItem = billItems[billItems.length - 1];
    if (lastItem && lastItem.itemId && lastItem.primaryQuantity > 0) {
      // Add new row if last item has item selected and quantity
      const newItem = createEmptyBillItem();
      setBillItems([...billItems, newItem]);
    }
  }, [billItems.length > 0 && billItems[billItems.length - 1]?.itemId, billItems[billItems.length - 1]?.primaryQuantity]);

  // OCR: Extract items from bill image - now shows review step
  const handleImageExtract = async (file: File) => {
    setIsExtracting(true);
    setOcrReviewItems(null);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const itemNames = allItems.map(i => i.name);
      const paperBillNames = allItems.reduce((acc: Record<string, string>, i) => {
        if (i.paperBillName) acc[i.name] = i.paperBillName;
        return acc;
      }, {});

      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames, paperBillNames },
      });

      if (error) throw error;

      const extracted = data?.items || [];
      if (extracted.length === 0) {
        toast.error('No items found in image');
        return;
      }

      // Populate review items with auto-matched item IDs
      const reviewItems: ExtractedOcrItem[] = extracted.map((ext: any) => {
        const matchName = ext.matchedName || ext.extractedName;
        const masterItem = allItems.find(i => i.name.toLowerCase() === matchName?.toLowerCase());
        const isHighConfidence = ext.confidence === 'high' && !!masterItem;
        return {
          extractedName: ext.extractedName,
          matchedName: ext.matchedName,
          quantity: ext.quantity || 0,
          amount: ext.amount || 0,
          confidence: ext.confidence || 'low',
          selectedItemId: masterItem?.id || null,
          confirmed: isHighConfidence, // auto-confirm high confidence matches
        };
      });

      setOcrReviewItems(reviewItems);
      toast.info(`${extracted.length} items extracted — review matches before saving`);
    } catch (err: any) {
      console.error('OCR extraction error:', err);
      toast.error('Failed to extract items from image');
    } finally {
      setIsExtracting(false);
    }
  };

  // Confirm OCR review and populate bill items
  const confirmOcrItems = async () => {
    if (!ocrReviewItems) return;

    const newBillItems: BillItem[] = ocrReviewItems.map((ext) => {
      const masterItem = ext.selectedItemId ? allItems.find(i => i.id === ext.selectedItemId) : null;
      return {
        id: uuidv4(),
        itemId: masterItem?.id,
        batchId: undefined,
        itemName: masterItem?.name || ext.extractedName,
        primaryQuantity: ext.quantity || 0,
        secondaryQuantity: 0,
        secondaryUnit: masterItem?.secondaryUnit,
        conversionRate: masterItem?.conversionRate,
        rate: masterItem ? (ext.amount && ext.quantity ? ext.amount / ext.quantity : masterItem.sellingPrice) : (ext.amount && ext.quantity ? ext.amount / ext.quantity : 0),
        totalAmount: ext.amount || 0,
      };
    });

    // Load batches and auto-select for matched items
    for (const bi of newBillItems) {
      if (bi.itemId) {
        const batches = await getBatchesForItem(bi.itemId);
        const masterItem = allItems.find(i => i.id === bi.itemId);
        if (masterItem && batches.length > 0) {
          const pref = masterItem.batchPreference === 'category' ? 'latest' : masterItem.batchPreference;
          const withStock = batches.filter(b => b.primaryQuantity > 0);
          if (withStock.length > 0) {
            const sorted = pref === 'oldest'
              ? withStock.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime())
              : withStock.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
            bi.batchId = sorted[0].id;
          }
        }
      }
    }

    newBillItems.push(createEmptyBillItem());
    setBillItems(newBillItems);
    setOcrReviewItems(null);
    toast.success(`${ocrReviewItems.length} items added to bill`);
  };

  const updateOcrItemMatch = (index: number, itemId: string) => {
    if (!ocrReviewItems) return;
    const updated = [...ocrReviewItems];
    const masterItem = allItems.find(i => i.id === itemId);
    updated[index] = {
      ...updated[index],
      selectedItemId: itemId || null,
      matchedName: masterItem?.name || null,
      confidence: itemId ? 'high' : 'low',
    };
    setOcrReviewItems(updated);
  };

  const removeOcrItem = (index: number) => {
    if (!ocrReviewItems) return;
    setOcrReviewItems(ocrReviewItems.filter((_, i) => i !== index));
  };

  const updateOcrItemField = (index: number, field: 'quantity' | 'amount', value: number) => {
    if (!ocrReviewItems) return;
    const updated = [...ocrReviewItems];
    updated[index] = { ...updated[index], [field]: value };
    setOcrReviewItems(updated);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageExtract(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      {/* OCR Buttons */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={isExtracting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          Capture Bill
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isExtracting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload Bill
        </button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
      </div>

      {isExtracting && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground bg-secondary/30 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" />
          Extracting items from bill image...
        </div>
      )}

      {/* OCR Review Step */}
      {ocrReviewItems && ocrReviewItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-secondary/30 rounded-xl p-3 space-y-2 border border-accent/20"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">
              Review Extracted Items ({ocrReviewItems.length})
            </h3>
            <div className="flex gap-1.5">
              <button
                onClick={() => setOcrReviewItems(null)}
                className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmOcrItems}
                className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
              >
                Confirm All
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="grid grid-cols-12 gap-1 text-[10px] font-medium text-muted-foreground px-1">
            <div className="col-span-1">✓</div>
            <div className="col-span-3">Paper Name</div>
            <div className="col-span-4">Match To</div>
            <div className="col-span-1 text-center">Qty</div>
            <div className="col-span-2 text-right">Amt</div>
            <div className="col-span-1"></div>
          </div>

          {ocrReviewItems.map((item, idx) => (
            <div key={idx} className={cn(
              "grid grid-cols-12 gap-1 px-1 py-1.5 rounded-lg text-xs items-center",
              item.confidence === 'low' ? 'bg-destructive/5' : item.confidence === 'medium' ? 'bg-warning/5' : 'bg-success/5'
            )}>
              {/* Confirmed tick */}
              <div className="col-span-1 flex justify-center">
                <button
                  onClick={() => {
                    if (!ocrReviewItems) return;
                    const updated = [...ocrReviewItems];
                    updated[idx] = { ...updated[idx], confirmed: !updated[idx].confirmed };
                    setOcrReviewItems(updated);
                  }}
                  className={cn(
                    "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                    item.confirmed 
                      ? "bg-green-500 border-green-500 text-white" 
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  {item.confirmed && <Check className="w-3 h-3" />}
                </button>
              </div>

              {/* Extracted name - editable */}
              <div className="col-span-3">
                <input
                  type="text"
                  value={item.extractedName}
                  onChange={(e) => {
                    if (!ocrReviewItems) return;
                    const updated = [...ocrReviewItems];
                    updated[idx] = { ...updated[idx], extractedName: e.target.value };
                    setOcrReviewItems(updated);
                  }}
                  className="w-full h-6 px-1 text-[11px] bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent truncate"
                  title={item.extractedName}
                />
              </div>

              {/* Item master select */}
              <div className="col-span-4">
                <select
                  value={item.selectedItemId || ''}
                  onChange={(e) => updateOcrItemMatch(idx, e.target.value)}
                  className={cn(
                    "w-full h-7 px-1 text-[11px] bg-background/50 border rounded focus:ring-1 focus:ring-accent truncate",
                    !item.selectedItemId ? "border-destructive/50 text-destructive" : "border-border text-foreground"
                  )}
                >
                  <option value="">No match</option>
                  {allItems.map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>

              {/* Qty - editable */}
              <div className="col-span-1">
                <input
                  type="number"
                  value={item.quantity || ''}
                  onChange={(e) => updateOcrItemField(idx, 'quantity', parseFloat(e.target.value) || 0)}
                  className="w-full h-6 px-1 text-[11px] text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Amount - editable */}
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.amount || ''}
                  onChange={(e) => updateOcrItemField(idx, 'amount', parseFloat(e.target.value) || 0)}
                  className="w-full h-6 px-1 text-[11px] text-right bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Remove */}
              <div className="col-span-1 flex justify-center">
                <button onClick={() => removeOcrItem(idx)} className="text-destructive/60 hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="flex justify-between items-center pt-1 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">
              {ocrReviewItems.filter(i => i.selectedItemId).length}/{ocrReviewItems.length} matched
            </span>
            <span className="text-xs font-bold text-accent">
              ₹{ocrReviewItems.reduce((s, i) => s + i.amount, 0).toLocaleString('en-IN')}
            </span>
          </div>
        </motion.div>
      )}

      {billItems.map((item, index) => {
        const itemBatches = item.itemId ? batchesMap[item.itemId] || [] : [];
        const selectedBatch = itemBatches.find(b => b.id === item.batchId);
        const isExpanded = expandedItem === item.id;
        const selectedItem = allItems.find(i => i.id === item.itemId);
        const effectivePref = selectedItem ? getEffectiveBatchPreference(selectedItem) : 'latest';
        // Batch info label: qty*rate
        const batchInfoLabel = selectedBatch ? `${selectedBatch.primaryQuantity}*${selectedBatch.purchaseRate}` : null;

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-secondary/30 rounded-lg overflow-hidden"
          >
            {/* Row 1: Item + Batch Info + Actions (Mobile: full width) */}
            <div className="flex items-center gap-1.5 p-2 pb-1 md:pb-2">
              {/* Index */}
              <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{index + 1}</span>
              
              {/* Item Select/Input */}
              <div className="flex-1 min-w-0">
                {allItems.length > 0 ? (
                  <div className="flex items-center gap-1">
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
                            batchId: undefined,
                          });
                        }
                      }}
                      onPaste={(e) => handlePaste(e as any, item.id, 'itemName')}
                      className="flex-1 h-8 px-2 text-xs bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent truncate"
                    >
                      <option value="">Select Item</option>
                      {allItems.map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                    {/* Inline batch info */}
                    {batchInfoLabel && (
                      <span className="text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {batchInfoLabel}
                      </span>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={item.itemName}
                    onChange={(e) => updateBillItem(item.id, { itemName: e.target.value })}
                    onPaste={(e) => handlePaste(e, item.id, 'itemName')}
                    placeholder="Item Name"
                    className="w-full h-8 px-2 text-xs bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                  />
                )}
              </div>

              {/* Desktop only: Qty, Rate, Total inline */}
              <div className="hidden md:flex items-center gap-1.5">
                {/* Qty (Primary) */}
                <input
                  type="number"
                  value={item.primaryQuantity || ''}
                  onChange={(e) => updateBillItem(item.id, { primaryQuantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Qty"
                  className="w-14 h-8 px-1.5 text-xs text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />

                {/* Secondary Qty (if applicable) */}
                {item.secondaryUnit && (
                  <input
                    type="number"
                    value={item.secondaryQuantity || ''}
                    onChange={(e) => updateBillItem(item.id, { secondaryQuantity: parseFloat(e.target.value) || 0 })}
                    placeholder={item.secondaryUnit}
                    className="w-14 h-8 px-1.5 text-xs text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                  />
                )}

                {/* Rate */}
                <div className="relative w-16">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">₹</span>
                  <input
                    type="number"
                    value={item.rate || ''}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0;
                      updateBillItem(item.id, { rate, totalAmount: item.primaryQuantity * rate });
                    }}
                    placeholder="Rate"
                    className="w-full h-8 pl-4 pr-1 text-xs bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                  />
                </div>

                {/* Total */}
                <div className="relative w-16">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">₹</span>
                  <input
                    type="number"
                    value={item.totalAmount || ''}
                    onChange={(e) => updateBillItem(item.id, { totalAmount: parseFloat(e.target.value) || 0 })}
                    placeholder="Total"
                    className="w-full h-8 pl-4 pr-1 text-xs font-medium bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              {/* Expand/Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                {item.itemId && itemBatches.length > 0 && (
                  <button
                    onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/50 rounded"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
                {billItems.length > 1 && (
                  <button
                    onClick={() => removeBillItem(item.id)}
                    className="w-7 h-7 flex items-center justify-center text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Qty, Rate, Total (Mobile only) */}
            <div className="flex md:hidden items-center gap-1.5 px-2 pb-2 pt-1">
              <span className="w-5 shrink-0"></span>
              
              {/* Qty */}
              <div className="flex-1">
                <input
                  type="number"
                  value={item.primaryQuantity || ''}
                  onChange={(e) => updateBillItem(item.id, { primaryQuantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Qty"
                  className="w-full h-8 px-2 text-xs text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Secondary Qty (if applicable) */}
              {item.secondaryUnit && (
                <div className="flex-1">
                  <input
                    type="number"
                    value={item.secondaryQuantity || ''}
                    onChange={(e) => updateBillItem(item.id, { secondaryQuantity: parseFloat(e.target.value) || 0 })}
                    placeholder={item.secondaryUnit}
                    className="w-full h-8 px-2 text-xs text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}

              {/* Rate */}
              <div className="flex-1 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">₹</span>
                <input
                  type="number"
                  value={item.rate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0;
                    updateBillItem(item.id, { rate, totalAmount: item.primaryQuantity * rate });
                  }}
                  placeholder="Rate"
                  className="w-full h-8 pl-5 pr-1 text-xs bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Total */}
              <div className="flex-1 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">₹</span>
                <input
                  type="number"
                  value={item.totalAmount || ''}
                  onChange={(e) => updateBillItem(item.id, { totalAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="Total"
                  className="w-full h-8 pl-5 pr-1 text-xs font-medium bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Expanded: Batch Selection & Stock Info */}
            {isExpanded && item.itemId && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border/50 px-2 py-2 bg-background/30"
              >
                {/* Batch Preference Info */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-muted-foreground">Preference:</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    effectivePref === 'oldest' ? "bg-info/20 text-info" :
                    effectivePref === 'latest' ? "bg-success/20 text-success" :
                    "bg-warning/20 text-warning"
                  )}>
                    {effectivePref === 'oldest' ? 'FIFO (Oldest)' : 
                     effectivePref === 'latest' ? 'LIFO (Latest)' : 'Custom'}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Total: {getTotalStock(item.itemId)}
                  </span>
                </div>

                {/* Batch List */}
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground grid grid-cols-4 gap-1 px-1">
                    <span>Batch</span>
                    <span>Stock</span>
                    <span>P.Rate</span>
                    <span>Select</span>
                  </div>
                  {itemBatches.map((batch, idx) => (
                    <button
                      key={batch.id}
                      onClick={() => handleBatchSelect(item.id, batch.id)}
                      className={cn(
                        "w-full grid grid-cols-4 gap-1 px-1 py-1.5 rounded text-[11px] text-left transition-colors",
                        batch.id === item.batchId 
                          ? "bg-accent/20 text-accent border border-accent/30" 
                          : "hover:bg-secondary/50"
                      )}
                    >
                      <span className="truncate">
                        {batch.batchNumber || `#${idx + 1}`}
                      </span>
                      <span className="font-mono">{batch.stockLabel}</span>
                      <span className="font-mono">₹{batch.purchaseRate}</span>
                      <span className="text-center">
                        {batch.id === item.batchId ? '✓' : '○'}
                      </span>
                    </button>
                  ))}
                </div>

                {itemBatches.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">
                    No batches with stock available
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      })}

      {/* Add Item Button */}
      <button
        onClick={addBillItem}
        className="w-full py-2 rounded-lg border-2 border-dashed border-accent/30 text-accent text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-accent/5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Item
      </button>

      {/* Bill Total */}
      <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-muted-foreground">Bill Total</span>
          <span className="text-lg font-bold text-accent">
            ₹{billTotal.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
}
