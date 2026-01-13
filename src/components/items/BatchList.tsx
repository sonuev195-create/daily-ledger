import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Trash2, Package2, Edit2, Check, X, Scissors, Plus } from 'lucide-react';
import { Batch, Item } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

interface BatchListProps {
  item: Item;
  onBatchesChange?: () => void;
}

function toYMD(date: Date) {
  return date.toISOString().split('T')[0];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function isOpeningBatchName(name?: string) {
  return !!name && name.toLowerCase().startsWith('opening stock');
}

function buildOpeningBatchName(qty: number, secQty: number, secUnit: string | undefined, rate: number) {
  return `0/Opening/${qty}*${rate}`;
}

function buildAutoBatchName(qty: number, rate: number) {
  return `${qty}*${rate}`;
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

  const loadBatches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('item_id', item.id)
      .order('purchase_date', { ascending: false });

    if (error) {
      console.error('Error loading batches:', error);
      toast.error('Failed to load batches');
      setBatches([]);
      setLoading(false);
      return;
    }

    setBatches(
      (data || []).map((b) => ({
        id: b.id,
        itemId: b.item_id,
        batchNumber: b.batch_number || undefined,
        purchaseDate: new Date(b.purchase_date),
        purchaseRate: Number(b.purchase_rate),
        primaryQuantity: Number(b.primary_quantity),
        secondaryQuantity: Number(b.secondary_quantity),
        expiryDate: b.expiry_date ? new Date(b.expiry_date) : undefined,
        createdAt: new Date(b.created_at),
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (isExpanded) loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, item.id]);

  useEffect(() => {
    const handler = () => {
      if (isExpanded) loadBatches();
    };
    window.addEventListener('batches:changed', handler);
    return () => window.removeEventListener('batches:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, item.id]);

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

  const handleAddBatch = async () => {
    const qty = parseFloat(primaryQty) || 0;
    const rate = parseFloat(purchaseRate) || 0;
    const secQty = parseFloat(secondaryQty) || 0;

    const batchNumber = buildAutoBatchName(qty, rate);

    const { error } = await supabase.from('batches').insert({
      id: uuidv4(),
      item_id: item.id,
      batch_number: batchNumber,
      purchase_date: purchaseDate,
      purchase_rate: rate,
      primary_quantity: qty,
      secondary_quantity: secQty,
    });

    if (error) {
      console.error('Error adding batch:', error);
      toast.error('Failed to add batch');
      return;
    }

    await loadBatches();
    onBatchesChange?.();
    window.dispatchEvent(new Event('batches:changed'));
    resetForm();
    toast.success('Batch added');
  };

  const handleStartEdit = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setSplittingBatchId(null);
    setIsAdding(false);
    setPurchaseDate(toYMD(new Date(batch.purchaseDate)));
    setPurchaseRate(batch.purchaseRate.toString());
    setPrimaryQty(batch.primaryQuantity.toString());
    setSecondaryQty(batch.secondaryQuantity.toString());
  };

  const handleSaveEdit = async (batchId: string) => {
    const qty = parseFloat(primaryQty) || 0;
    const rate = parseFloat(purchaseRate) || 0;
    const secQty = parseFloat(secondaryQty) || 0;

    const existing = batches.find((b) => b.id === batchId);
    const nextBatchNumber = isOpeningBatchName(existing?.batchNumber)
      ? buildOpeningBatchName(qty, secQty, item.secondaryUnit, rate)
      : buildAutoBatchName(qty, rate);

    const { error } = await supabase
      .from('batches')
      .update({
        batch_number: nextBatchNumber,
        purchase_date: purchaseDate,
        purchase_rate: rate,
        primary_quantity: qty,
        secondary_quantity: secQty,
      })
      .eq('id', batchId);

    if (error) {
      console.error('Error updating batch:', error);
      toast.error('Failed to update batch');
      return;
    }

    await loadBatches();
    onBatchesChange?.();
    window.dispatchEvent(new Event('batches:changed'));
    resetForm();
    toast.success('Batch updated');
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Delete this batch?')) return;

    const { error } = await supabase.from('batches').delete().eq('id', batchId);
    if (error) {
      console.error('Error deleting batch:', error);
      toast.error('Failed to delete batch');
      return;
    }

    await loadBatches();
    onBatchesChange?.();
    window.dispatchEvent(new Event('batches:changed'));
    toast.success('Batch deleted');
  };

  const handleStartSplit = (batch: Batch) => {
    setSplittingBatchId(batch.id);
    setEditingBatchId(null);
    setIsAdding(false);
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

    const remainingQty = originalBatch.primaryQuantity - splitQtyNum;
    const remainingSec = originalBatch.secondaryQuantity - splitSecQtyNum;

    const originalIsOpening = isOpeningBatchName(originalBatch.batchNumber);

    const updatedOriginalNumber = originalIsOpening
      ? buildOpeningBatchName(remainingQty, remainingSec, item.secondaryUnit, originalBatch.purchaseRate)
      : buildAutoBatchName(remainingQty, originalBatch.purchaseRate);

    const newBatchNumber = originalIsOpening
      ? buildOpeningBatchName(splitQtyNum, splitSecQtyNum, item.secondaryUnit, splitRateNum)
      : buildAutoBatchName(splitQtyNum, splitRateNum);

    const { error: updErr } = await supabase
      .from('batches')
      .update({
        batch_number: updatedOriginalNumber,
        primary_quantity: remainingQty,
        secondary_quantity: remainingSec,
      })
      .eq('id', originalBatch.id);

    if (updErr) {
      console.error('Error updating original batch:', updErr);
      toast.error('Failed to split batch');
      return;
    }

    const { error: insErr } = await supabase.from('batches').insert({
      id: uuidv4(),
      item_id: item.id,
      batch_number: newBatchNumber,
      purchase_date: toYMD(new Date(originalBatch.purchaseDate)),
      purchase_rate: splitRateNum,
      primary_quantity: splitQtyNum,
      secondary_quantity: splitSecQtyNum,
    });

    if (insErr) {
      console.error('Error creating split batch:', insErr);
      toast.error('Failed to split batch');
      return;
    }

    await loadBatches();
    onBatchesChange?.();
    window.dispatchEvent(new Event('batches:changed'));
    resetForm();
    toast.success('Batch split successfully');
  };

  const totalQuantity = batches.reduce((sum, b) => sum + (b.primaryQuantity || 0), 0);
  const stockDetailsString = batches
    .filter((b) => (b.primaryQuantity || 0) > 0)
    .map((b) => `${b.primaryQuantity}*${b.purchaseRate}`)
    .join(' + ');
  const totalValue = batches.reduce((sum, b) => sum + (b.primaryQuantity || 0) * (b.purchaseRate || 0), 0);

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
                        <div className="text-xs opacity-75">({stockDetailsString})</div>
                      )}
                    </div>
                  )}

                  {batches.map((batch) => {
                    const isEditing = editingBatchId === batch.id;
                    const isSplitting = splittingBatchId === batch.id;

                    if (isEditing) {
                      const qtyNum = parseFloat(primaryQty) || 0;
                      const rateNum = parseFloat(purchaseRate) || 0;
                      const secNum = parseFloat(secondaryQty) || 0;
                      const existing = batches.find((b) => b.id === batch.id);
                      const previewName = isOpeningBatchName(existing?.batchNumber)
                        ? buildOpeningBatchName(qtyNum, secNum, item.secondaryUnit, rateNum)
                        : buildAutoBatchName(qtyNum, rateNum);

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
                          <div className="text-xs text-muted-foreground">Batch Name: {previewName}</div>
                          <div className="flex gap-2">
                            <button
                              onClick={resetForm}
                              className="flex-1 py-2 text-sm rounded-lg bg-secondary flex items-center justify-center gap-1"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEdit(batch.id)}
                              className="flex-1 py-2 text-sm rounded-lg btn-accent flex items-center justify-center gap-1"
                            >
                              <Check className="w-3 h-3" /> Save
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (isSplitting) {
                      const splitQtyNum = parseFloat(splitQty) || 0;
                      const splitRateNum = parseFloat(splitRate) || batch.purchaseRate;
                      const remaining = batch.primaryQuantity - splitQtyNum;

                      return (
                        <div key={batch.id} className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-3">
                          <div className="text-xs font-medium text-warning mb-2 flex items-center gap-1">
                            <Scissors className="w-3 h-3" />
                            Split Batch: {batch.batchNumber || buildAutoBatchName(batch.primaryQuantity, batch.purchaseRate)} (Current: {batch.primaryQuantity})
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
                            Will create: {isOpeningBatchName(batch.batchNumber) ? buildOpeningBatchName(splitQtyNum, parseFloat(splitSecondaryQty) || 0, item.secondaryUnit, splitRateNum) : buildAutoBatchName(splitQtyNum, splitRateNum)}
                            <br />
                            Original becomes: {isOpeningBatchName(batch.batchNumber) ? buildOpeningBatchName(remaining, batch.secondaryQuantity - (parseFloat(splitSecondaryQty) || 0), item.secondaryUnit, batch.purchaseRate) : buildAutoBatchName(remaining, batch.purchaseRate)}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={resetForm}
                              className="flex-1 py-2 text-sm rounded-lg bg-secondary flex items-center justify-center gap-1"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                            <button
                              onClick={() => handleSplitBatch(batch)}
                              className="flex-1 py-2 text-sm rounded-lg bg-warning text-warning-foreground flex items-center justify-center gap-1"
                            >
                              <Scissors className="w-3 h-3" /> Split
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={batch.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 text-sm">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {batch.batchNumber || buildAutoBatchName(batch.primaryQuantity, batch.purchaseRate)}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(batch.purchaseDate)}</span>
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
                          <button onClick={() => handleStartEdit(batch)} className="p-1.5 rounded hover:bg-accent/10">
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
                        Auto Batch Name: {buildAutoBatchName(parseFloat(primaryQty) || 0, parseFloat(purchaseRate) || 0)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={resetForm}
                          className="flex-1 py-2 text-sm rounded-lg bg-secondary flex items-center justify-center gap-1"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                          onClick={handleAddBatch}
                          className="flex-1 py-2 text-sm rounded-lg btn-accent flex items-center justify-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsAdding(true);
                        setEditingBatchId(null);
                        setSplittingBatchId(null);
                      }}
                      className="w-full p-2 rounded-lg border border-dashed border-accent/30 text-accent text-sm hover:bg-accent/5 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Batch
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
