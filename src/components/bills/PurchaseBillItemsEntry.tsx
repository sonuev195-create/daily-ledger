import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Plus, ChevronDown, ChevronUp, Package, Camera, Upload, Loader2, Check } from 'lucide-react';
import { BillItem, Item } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { useItems } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractedOcrItem {
  extractedName: string;
  matchedName: string | null;
  quantity: number;
  amount: number;
  confidence: 'high' | 'medium' | 'low';
  selectedItemId: string | null;
  confirmed: boolean;
}

interface PurchaseBillItemsEntryProps {
  billItems: BillItem[];
  setBillItems: (items: BillItem[]) => void;
}

export function PurchaseBillItemsEntry({ billItems, setBillItems }: PurchaseBillItemsEntryProps) {
  const { items: allItems } = useItems();
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrReviewItems, setOcrReviewItems] = useState<ExtractedOcrItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    setBillItems([...billItems, createEmptyBillItem()]);
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
        if ('primaryQuantity' in updates || 'rate' in updates) {
          const qty = updates.primaryQuantity ?? item.primaryQuantity;
          const rate = updates.rate ?? item.rate;
          updated.totalAmount = qty * rate;
        }
        return updated;
      }
      return item;
    }));
  };

  const handleItemSelect = (billItemId: string, itemId: string) => {
    const selectedItem = allItems.find(i => i.id === itemId);
    if (!selectedItem) return;
    updateBillItem(billItemId, {
      itemId,
      itemName: selectedItem.name,
      rate: selectedItem.sellingPrice,
      secondaryUnit: selectedItem.secondaryUnit,
      conversionRate: selectedItem.conversionRate,
    });
  };

  // Load bill format config
  const loadBillFormatConfig = async () => {
    const { data } = await supabase
      .from('bill_format_config')
      .select('*')
      .in('bill_type', ['purchase', 'both'])
      .limit(1)
      .maybeSingle();
    return data;
  };

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

      // Load column config
      const formatConfig = await loadBillFormatConfig();
      const columnMapping = formatConfig ? {
        totalColumns: formatConfig.total_columns,
        itemNameColumn: formatConfig.item_name_column,
        quantityColumn: formatConfig.quantity_column,
        quantityType: formatConfig.quantity_type,
        rateColumn: formatConfig.rate_column,
        amountColumn: formatConfig.amount_column,
        hasRate: formatConfig.has_rate,
        hasAmount: formatConfig.has_amount,
      } : undefined;

      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames, paperBillNames, columnMapping },
      });

      if (error) throw error;

      const extracted = data?.items || [];
      if (extracted.length === 0) {
        toast.error('No items found in image');
        return;
      }

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
          confirmed: isHighConfidence,
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

  const confirmOcrItems = () => {
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
        rate: ext.amount && ext.quantity ? ext.amount / ext.quantity : (masterItem?.sellingPrice || 0),
        totalAmount: ext.amount || 0,
      };
    });

    newBillItems.push(createEmptyBillItem());
    setBillItems(newBillItems);
    setOcrReviewItems(null);
    toast.success(`${ocrReviewItems.length} items added to purchase bill`);
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
      confirmed: !!itemId,
    };
    setOcrReviewItems(updated);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageExtract(file);
    e.target.value = '';
  };

  const billTotal = billItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

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
            <div className="col-span-3">Match To</div>
            <div className="col-span-2 text-center">Qty</div>
            <div className="col-span-2 text-right">Amt</div>
            <div className="col-span-1"></div>
          </div>

          {ocrReviewItems.map((item, idx) => (
            <div key={idx} className={cn(
              "grid grid-cols-12 gap-1 px-1 py-1.5 rounded-lg text-xs items-center",
              item.confidence === 'low' ? 'bg-destructive/5' : item.confidence === 'medium' ? 'bg-warning/5' : 'bg-success/5'
            )}>
              {/* Tick */}
              <div className="col-span-1 flex justify-center">
                <button
                  onClick={() => {
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

              {/* Extracted name */}
              <div className="col-span-3">
                <input
                  type="text"
                  value={item.extractedName}
                  onChange={(e) => {
                    const updated = [...ocrReviewItems];
                    updated[idx] = { ...updated[idx], extractedName: e.target.value };
                    setOcrReviewItems(updated);
                  }}
                  className="w-full h-6 px-1 text-[11px] bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent truncate"
                />
              </div>

              {/* Item dropdown */}
              <div className="col-span-3">
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

              {/* Qty */}
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.quantity || ''}
                  onChange={(e) => {
                    const updated = [...ocrReviewItems];
                    updated[idx] = { ...updated[idx], quantity: parseFloat(e.target.value) || 0 };
                    setOcrReviewItems(updated);
                  }}
                  className="w-full h-6 px-1 text-[11px] text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Amount */}
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.amount || ''}
                  onChange={(e) => {
                    const updated = [...ocrReviewItems];
                    updated[idx] = { ...updated[idx], amount: parseFloat(e.target.value) || 0 };
                    setOcrReviewItems(updated);
                  }}
                  className="w-full h-6 px-1 text-[11px] text-right bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Remove */}
              <div className="col-span-1 flex justify-center">
                <button
                  onClick={() => setOcrReviewItems(ocrReviewItems.filter((_, i) => i !== idx))}
                  className="text-destructive/60 hover:text-destructive"
                >
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

      {/* Manual bill items */}
      {billItems.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-secondary/30 rounded-lg overflow-hidden"
        >
          <div className="flex items-center gap-1.5 p-2">
            <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{index + 1}</span>

            {/* Item Select */}
            <div className="flex-1 min-w-0">
              {allItems.length > 0 ? (
                <select
                  value={item.itemId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleItemSelect(item.id, e.target.value);
                    } else {
                      updateBillItem(item.id, { itemId: undefined, itemName: '', rate: 0 });
                    }
                  }}
                  className="w-full h-8 px-2 text-xs bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent truncate"
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
                  className="w-full h-8 px-2 text-xs bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
                />
              )}
            </div>

            {billItems.length > 1 && (
              <button
                onClick={() => removeBillItem(item.id)}
                className="w-7 h-7 flex items-center justify-center text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Qty, Rate, Total row */}
          <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
            <span className="w-5 shrink-0"></span>
            <div className="flex-1">
              <input
                type="number"
                value={item.primaryQuantity || ''}
                onChange={(e) => updateBillItem(item.id, { primaryQuantity: parseFloat(e.target.value) || 0 })}
                placeholder="Qty"
                className="w-full h-8 px-2 text-xs text-center bg-background/50 border border-border rounded focus:ring-1 focus:ring-accent"
              />
            </div>
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
        </motion.div>
      ))}

      <button
        onClick={addBillItem}
        className="w-full py-2 rounded-lg border-2 border-dashed border-accent/30 text-accent text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-accent/5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Item
      </button>

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
