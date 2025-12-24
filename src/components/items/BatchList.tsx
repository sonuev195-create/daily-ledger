import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Plus, Trash2, Package2 } from 'lucide-react';
import { Batch, Item } from '@/types';
import { getBatchesByItem, addBatch, deleteBatch } from '@/lib/db';
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
  
  // Form state for adding batch
  const [batchNumber, setBatchNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseRate, setPurchaseRate] = useState('');
  const [primaryQty, setPrimaryQty] = useState('');
  const [secondaryQty, setSecondaryQty] = useState('');

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
    setBatchNumber('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPurchaseRate('');
    setPrimaryQty('');
    setSecondaryQty('');
    setIsAdding(false);
  };

  const handleAddBatch = async () => {
    const batch: Batch = {
      id: uuidv4(),
      itemId: item.id,
      batchNumber: batchNumber || undefined,
      purchaseDate: new Date(purchaseDate),
      purchaseRate: parseFloat(purchaseRate) || 0,
      primaryQuantity: parseFloat(primaryQty) || 0,
      secondaryQuantity: parseFloat(secondaryQty) || 0,
      createdAt: new Date(),
    };

    await addBatch(batch);
    await loadBatches();
    onBatchesChange?.();
    resetForm();
    toast.success('Batch added');
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
                    <div className="text-xs text-muted-foreground px-2 py-1 bg-secondary/30 rounded-lg flex justify-between">
                      <span>Total: {totalQuantity} units</span>
                      <span>Value: {formatCurrency(totalValue)}</span>
                    </div>
                  )}
                  
                  {batches.map((batch, index) => (
                    <div
                      key={batch.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 text-sm"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {batch.batchNumber || `Batch ${index + 1}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(batch.purchaseDate)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Qty: {batch.primaryQuantity}{batch.secondaryQuantity > 0 && ` / ${batch.secondaryQuantity}`} • Rate: {formatCurrency(batch.purchaseRate)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteBatch(batch.id)}
                        className="p-1.5 rounded hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}

                  {isAdding ? (
                    <div className="p-3 rounded-xl bg-secondary/30 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={batchNumber}
                          onChange={(e) => setBatchNumber(e.target.value)}
                          placeholder="Batch # (optional)"
                          className="input-field text-sm py-2"
                        />
                        <input
                          type="date"
                          value={purchaseDate}
                          onChange={(e) => setPurchaseDate(e.target.value)}
                          className="input-field text-sm py-2"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          value={primaryQty}
                          onChange={(e) => setPrimaryQty(e.target.value)}
                          placeholder="Qty"
                          className="input-field text-sm py-2"
                        />
                        <input
                          type="number"
                          value={secondaryQty}
                          onChange={(e) => setSecondaryQty(e.target.value)}
                          placeholder="Sec Qty"
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
