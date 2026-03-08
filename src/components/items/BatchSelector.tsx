import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Batch, Item, Category, BatchPreference } from '@/types';
import { getBatchesByItem, getAllCategories } from '@/lib/db';

interface BatchSelectorProps {
  item: Item;
  selectedBatchId?: string;
  onSelect: (batch: Batch) => void;
}

export function BatchSelector({ item, selectedBatchId, onSelect }: BatchSelectorProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [item.id]);

  const loadData = async () => {
    setLoading(true);
    const [batchData, categoryData] = await Promise.all([
      getBatchesByItem(item.id),
      getAllCategories()
    ]);
    setBatches(batchData);
    setCategories(categoryData);
    
    // Auto-select based on preference if no batch selected
    if (!selectedBatchId && batchData.length > 0) {
      const preference = getEffectivePreference(item, categoryData);
      const autoSelectedBatch = selectBatchByPreference(batchData, preference);
      if (autoSelectedBatch) {
        onSelect(autoSelectedBatch);
      }
    }
    setLoading(false);
  };

  const getEffectivePreference = (item: Item, cats: Category[]): Exclude<BatchPreference, 'category'> => {
    if (item.batchPreference === 'category') {
      return 'latest';
    }
    return item.batchPreference as Exclude<BatchPreference, 'category'>;
  };

  const selectBatchByPreference = (batches: Batch[], preference: Exclude<BatchPreference, 'category'>): Batch | null => {
    if (batches.length === 0) return null;
    
    // Batches are already sorted by purchaseDate descending (newest first)
    switch (preference) {
      case 'latest':
        return batches[0]; // Newest first
      case 'oldest':
        return batches[batches.length - 1]; // Oldest
      case 'custom':
        return batches[0]; // Default to latest, user can change
      default:
        return batches[0];
    }
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const effectivePreference = getEffectivePreference(item, categories);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return <div className="h-10 rounded-lg bg-secondary/50 animate-pulse" />;
  }

  if (batches.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-2 bg-secondary/30 rounded-lg">
        No batches available
      </div>
    );
  }

  // For non-custom preference with only one batch, just show it
  if (effectivePreference !== 'custom' && batches.length === 1) {
    const batch = batches[0];
    return (
      <div className="text-xs text-muted-foreground p-2 bg-secondary/30 rounded-lg">
        {batch.batchNumber || formatDate(batch.purchaseDate)} • Qty: {batch.primaryQuantity} • {formatCurrency(batch.purchaseRate)}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors text-sm"
      >
        <div className="text-left">
          {selectedBatch ? (
            <span>
              {selectedBatch.batchNumber || formatDate(selectedBatch.purchaseDate)} • Qty: {selectedBatch.primaryQuantity} • {formatCurrency(selectedBatch.purchaseRate)}
            </span>
          ) : (
            <span className="text-muted-foreground">Select batch</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="text-xs text-muted-foreground px-3 py-2 bg-secondary/30">
              {effectivePreference === 'latest' && 'Auto: Latest First (LIFO)'}
              {effectivePreference === 'oldest' && 'Auto: Oldest First (FIFO)'}
              {effectivePreference === 'custom' && 'Select batch manually'}
            </div>
            <div className="max-h-48 overflow-y-auto">
              {batches.map((batch, index) => (
                <button
                  key={batch.id}
                  onClick={() => {
                    onSelect(batch);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 text-sm hover:bg-secondary/50 transition-colors ${
                    selectedBatchId === batch.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="text-left">
                    <div className="font-medium">
                      {batch.batchNumber || `Batch ${batches.length - index}`}
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatDate(batch.purchaseDate)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Qty: {batch.primaryQuantity} • Rate: {formatCurrency(batch.purchaseRate)}
                    </div>
                  </div>
                  {selectedBatchId === batch.id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
