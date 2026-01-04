import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Plus, Trash2, Package2, Edit2, Check, X, Scissors } from 'lucide-react';
import { Batch, Item } from '@/types';
import { getBatchesByItem, addBatch, deleteBatch, updateBatch } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

interface BatchListProps {
  item: Item;
  onBatchesChange?: () => void;
}

export function BatchList({ item, onBatchesChange }: BatchListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [splittingBatchId, setSplittingBatchId] = useState<string | null>(null);
  
  // Form state for adding/editing batch
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseRate, setPurchaseRate] = useState('');
  const [primaryQty, setPrimaryQty] = useState('');
  const [secondaryQty, setSecondaryQty] = useState('');
  
  // Split form state
  const [splitQty, setSplitQty] = useState('');
  const [splitSecondaryQty, setSplitSecondaryQty] = useState('');
  const [splitRate, setSplitRate] = useState('');

  useEffect(() => {
    if (isExpanded) {
      loadBatches();
    }
  }, [isExpanded, item.id]);

  const loadBatches = async () => {
    setLoading(true);
    const data = await getBatchesByItem(item.id);
    setBatches(data);
    setLoading(false);
  };

  const resetForm = () => {
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPurchaseRate('');
    setPrimaryQty('');
    setSecondaryQty('');
    setIsAdding(false);
    setEditingBatchId(null);
    setSplittingBatchId(null);
    setSplitQty('');
    setSplitSecondaryQty('');
    setSplitRate('');
  };

  // Auto generate batch name as quantity * purchase rate
  const generateBatchName = (qty: number, rate: number): string => {
    return `${qty}*${rate}`;
  };

  const handleAddBatch = async () => {
    const qty = parseFloat(primaryQty) || 0;
    const rate = parseFloat(purchaseRate) || 0;
    
    const batch: Batch = {
      id: uuidv4(),
      itemId: item.id,
      batchNumber: generateBatchName(qty, rate),
      purchaseDate: new Date(purchaseDate),
      purchaseRate: rate,
      primaryQuantity: qty,
      secondaryQuantity: parseFloat(secondaryQty) || 0,
      createdAt: new Date(),
    };

    await addBatch(batch);
    await loadBatches();
    onBatchesChange?.();
    resetForm();
    toast.success('Batch added');
  };

  const handleStartEdit = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setSplittingBatchId(null);
    setPurchaseDate(new Date(batch.purchaseDate).toISOString().split('T')[0]);
    setPurchaseRate(batch.purchaseRate.toString());
    setPrimaryQty(batch.primaryQuantity.toString());
    setSecondaryQty(batch.secondaryQuantity.toString());
  };

  const handleStartSplit = (batch: Batch) => {
    setSplittingBatchId(batch.id);
    setEditingBatchId(null);
    setSplitQty('');
    setSplitSecondaryQty('');
    setSplitRate(batch.purchaseRate.toString());
  };

  const handleSplitBatch = async (originalBatch: Batch) => {
    const splitQtyNum = parseFloat(splitQty) || 0;
    const splitSecQtyNum = parseFloat(splitSecondaryQty) || 0;
    const splitRateNum = parseFloat(splitRate) || originalBatch.purchaseRate;
    
    if (splitQtyNum <= 0 || splitQtyNum >= originalBatch.primaryQuantity) {
      toast.error('Split quantity must be less than original batch quantity');
      return;
    }

    // Update original batch with reduced quantity
    const updatedOriginal: Batch = {
      ...originalBatch,
      primaryQuantity: originalBatch.primaryQuantity - splitQtyNum,
      secondaryQuantity: originalBatch.secondaryQuantity - splitSecQtyNum,
      batchNumber: generateBatchName(originalBatch.primaryQuantity - splitQtyNum, originalBatch.purchaseRate),
    };

    // Create new batch with split quantity
    const newBatch: Batch = {
      id: uuidv4(),
      itemId: item.id,
      batchNumber: generateBatchName(splitQtyNum, splitRateNum),
      purchaseDate: new Date(originalBatch.purchaseDate),
      purchaseRate: splitRateNum,
      primaryQuantity: splitQtyNum,
      secondaryQuantity: splitSecQtyNum,
      createdAt: new Date(),
    };

    await updateBatch(updatedOriginal);
    await addBatch(newBatch);
    await loadBatches();
    onBatchesChange?.();
    resetForm();
    toast.success('Batch split successfully');
  };

  const handleSaveEdit = async (batchId: string) => {
    const qty = parseFloat(primaryQty) || 0;
    const rate = parseFloat(purchaseRate) || 0;
    
    const updatedBatch: Batch = {
      id: batchId,
      itemId: item.id,
      batchNumber: generateBatchName(qty, rate),
      purchaseDate: new Date(purchaseDate),
      purchaseRate: rate,
      primaryQuantity: qty,
      secondaryQuantity: parseFloat(secondaryQty) || 0,
      createdAt: batches.find(b => b.id === batchId)?.createdAt || new Date(),
    };

    await updateBatch(updatedBatch);
    await loadBatches();
    onBatchesChange?.();
    resetForm();
    toast.success('Batch updated');
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (confirm('Delete this batch?')) {
      await deleteBatch(batchId);
      await loadBatches();
      onBatchesChange?.();
      toast.success('Batch deleted');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  };

  const totalQuantity = batches.reduce((sum, b) => sum + b.primaryQuantity, 0);
  
  // Generate stock details as: total quantity (batch1_stock*rate + batch2_stock*rate ...)
  const stockDetailsString = batches
    .filter(b => b.primaryQuantity > 0)
    .map(b => `${b.primaryQuantity}*${b.purchaseRate}`)
    .join(' + ');
  
  const totalValue = batches.reduce((sum, b) => sum + (b.primaryQuantity * b.purchaseRate), 0);

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <Package2 className="w-4 h-4" />
        <span>{batches.length > 0 ? `${batches.length} batches` : 'View batches'}</span>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 pl-2 border-l-2 border-primary/20">
              {loading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : (
                <>
                  {batches.length > 0 && (
                    <div className="text-xs text-muted-foreground px-2 py-2 bg-secondary/30 rounded-lg space-y-1">
                      <div className="flex justify-between">
                        <span>Total Stock: {totalQuantity} units</span>
                        <span className="font-medium">{formatCurrency(totalValue)}</span>
                      </div>
                      {stockDetailsString && (
                        <div className="text-xs opacity-75">
                          ({stockDetailsString})
                        </div>
                      )}
                    </div>
                  )}
                  
                  {batches.map((batch) => {
                    const isEditing = editingBatchId === batch.id;
                    const isSplitting = splittingBatchId === batch.id;
                    
                    if (isEditing) {
                      return (
                        <div key={batch.id} className="p-3 rounded-xl bg-accent/10 border border-accent/30 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={purchaseDate}
                              onChange={(e) => setPurchaseDate(e.target.value)}
                              className="input-field text-sm py-2"
                            />
                            <input
                              type="number"
                              value={purchaseRate}
                              onChange={(e) => setPurchaseRate(e.target.value)}
                              placeholder="Rate"
                              className="input-field text-sm py-2"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              value={primaryQty}
                              onChange={(e) => setPrimaryQty(e.target.value)}
                              placeholder="Primary Qty"
                              className="input-field text-sm py-2"
                            />
                            <input
                              type="number"
                              value={secondaryQty}
                              onChange={(e) => setSecondaryQty(e.target.value)}
                              placeholder="Secondary Qty"
                              className="input-field text-sm py-2"
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Auto Batch Name: {generateBatchName(parseFloat(primaryQty) || 0, parseFloat(purchaseRate) || 0)}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={resetForm} className="flex-1 py-2 text-sm rounded-lg bg-secondary flex items-center justify-center gap-1">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                            <button onClick={() => handleSaveEdit(batch.id)} className="flex-1 py-2 text-sm rounded-lg btn-accent flex items-center justify-center gap-1">
                              <Check className="w-3 h-3" /> Save
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (isSplitting) {
                      return (
                        <div key={batch.id} className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-3">
                          <div className="text-xs font-medium text-warning mb-2 flex items-center gap-1">
                            <Scissors className="w-3 h-3" />
                            Split Batch: {batch.batchNumber} (Current: {batch.primaryQuantity})
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="number"
                              value={splitQty}
                              onChange={(e) => setSplitQty(e.target.value)}
                              placeholder="Split Qty"
                              max={batch.primaryQuantity - 1}
                              className="input-field text-sm py-2"
                            />
                            <input
                              type="number"
                              value={splitSecondaryQty}
                              onChange={(e) => setSplitSecondaryQty(e.target.value)}
                              placeholder="Sec. Qty"
                              className="input-field text-sm py-2"
                            />
                            <input
                              type="number"
                              value={splitRate}
                              onChange={(e) => setSplitRate(e.target.value)}
                              placeholder="Rate"
                              className="input-field text-sm py-2"
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Will create: {generateBatchName(parseFloat(splitQty) || 0, parseFloat(splitRate) || batch.purchaseRate)}
                            <br />
                            Original becomes: {generateBatchName(batch.primaryQuantity - (parseFloat(splitQty) || 0), batch.purchaseRate)}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={resetForm} className="flex-1 py-2 text-sm rounded-lg bg-secondary flex items-center justify-center gap-1">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                            <button onClick={() => handleSplitBatch(batch)} className="flex-1 py-2 text-sm rounded-lg bg-warning text-warning-foreground flex items-center justify-center gap-1">
                              <Scissors className="w-3 h-3" /> Split
                            </button>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div
                        key={batch.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 text-sm"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {batch.batchNumber || `${batch.primaryQuantity}*${batch.purchaseRate}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(batch.purchaseDate)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Stock: {batch.primaryQuantity}{batch.secondaryQuantity > 0 && ` / ${batch.secondaryQuantity}`} • Rate: {formatCurrency(batch.purchaseRate)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartSplit(batch)}
                            className="p-1.5 rounded hover:bg-warning/10"
                            title="Split batch"
                          >
                            <Scissors className="w-3.5 h-3.5 text-warning" />
                          </button>
                          <button
                            onClick={() => handleStartEdit(batch)}
                            className="p-1.5 rounded hover:bg-accent/10"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-accent" />
                          </button>
                          <button
                            onClick={() => handleDeleteBatch(batch.id)}
                            className="p-1.5 rounded hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {isAdding ? (
                    <div className="p-3 rounded-xl bg-secondary/30 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={purchaseDate}
                          onChange={(e) => setPurchaseDate(e.target.value)}
                          className="input-field text-sm py-2"
                        />
                        <input
                          type="number"
                          value={purchaseRate}
                          onChange={(e) => setPurchaseRate(e.target.value)}
                          placeholder="Rate"
                          className="input-field text-sm py-2"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={primaryQty}
                          onChange={(e) => setPrimaryQty(e.target.value)}
                          placeholder="Primary Qty"
                          className="input-field text-sm py-2"
                        />
                        <input
                          type="number"
                          value={secondaryQty}
                          onChange={(e) => setSecondaryQty(e.target.value)}
                          placeholder="Secondary Qty"
                          className="input-field text-sm py-2"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Auto Batch Name: {generateBatchName(parseFloat(primaryQty) || 0, parseFloat(purchaseRate) || 0)}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={resetForm} className="flex-1 py-2 text-sm rounded-lg bg-secondary">
                          Cancel
                        </button>
                        <button onClick={handleAddBatch} className="flex-1 py-2 text-sm rounded-lg btn-accent">
                          Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAdding(true)}
                      className="w-full py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Batch
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}