import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Camera, Upload, FileText, ChevronDown, Check, Package } from 'lucide-react';
import { BillItem, Item, Batch, Category, BatchPreference } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useItems, useCategories, getBatchesForItem, getAllCategoriesAsync } from '@/hooks/useSupabaseData';

interface BillItemWithBatch extends BillItem {
  itemId?: string;
  batchId?: string;
  selectedBatch?: Batch;
}

interface BillSheetWithBatchProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (items: BillItemWithBatch[], totalAmount: number, imageUrl?: string) => void;
  existingItems?: BillItemWithBatch[];
  isPurchase?: boolean; // If true, don't require batch selection (will create new batches)
}

export function BillSheetWithBatch({ isOpen, onClose, onSave, existingItems = [], isPurchase = false }: BillSheetWithBatchProps) {
  const [items, setItems] = useState<BillItemWithBatch[]>(
    existingItems.length > 0 ? existingItems : [createEmptyItem()]
  );
  const [activeTab, setActiveTab] = useState('manual');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { items: allItems, loading: itemsLoading } = useItems();
  const { categories } = useCategories();

  function createEmptyItem(): BillItemWithBatch {
    return {
      id: uuidv4(),
      itemName: '',
      primaryQuantity: 0,
      secondaryQuantity: 0,
      rate: 0,
      totalAmount: 0,
    };
  }

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = async (id: string, field: keyof BillItemWithBatch, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleItemSelect = async (billItemId: string, selectedItem: Item) => {
    // Load batches for selected item
    const batches = await getBatchesForItem(selectedItem.id);
    const cats = await getAllCategoriesAsync();
    
    // Auto-select batch based on preference
    let selectedBatch: Batch | undefined;
    if (!isPurchase && batches.length > 0) {
      const preference = getEffectivePreference(selectedItem, cats);
      selectedBatch = selectBatchByPreference(batches, preference);
    }
    
    setItems(prev => prev.map(item => {
      if (item.id === billItemId) {
        return {
          ...item,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          batchId: selectedBatch?.id,
          selectedBatch,
          rate: selectedBatch?.purchaseRate || selectedItem.sellingPrice || 0,
        };
      }
      return item;
    }));
  };

  const handleBatchSelect = (billItemId: string, batch: Batch) => {
    setItems(prev => prev.map(item => {
      if (item.id === billItemId) {
        return {
          ...item,
          batchId: batch.id,
          selectedBatch: batch,
          rate: batch.purchaseRate,
        };
      }
      return item;
    }));
  };

  const getEffectivePreference = (item: Item, cats: Category[]): Exclude<BatchPreference, 'category'> => {
    if (item.batchPreference === 'category' && item.categoryId) {
      const category = cats.find(c => c.id === item.categoryId);
      return category?.batchPreference || 'latest';
    }
    return item.batchPreference === 'category' ? 'latest' : item.batchPreference;
  };

  const selectBatchByPreference = (batches: Batch[], preference: Exclude<BatchPreference, 'category'>): Batch | undefined => {
    if (batches.length === 0) return undefined;
    
    switch (preference) {
      case 'latest':
        return batches[0]; // Already sorted descending
      case 'oldest':
        return batches[batches.length - 1];
      case 'custom':
        return batches[0];
      default:
        return batches[0];
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  const handleSave = () => {
    const validItems = items.filter(item => item.itemName.trim() !== '');
    onSave(validItems, totalAmount, capturedImage || undefined);
    onClose();
  };

  const handleCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.capture = 'environment';
      fileInputRef.current.click();
    }
  };

  const handleUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*,.pdf';
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
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

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">
                {isPurchase ? 'Add Purchase Items' : 'Add Sale Items'}
              </SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-6 mt-4 grid grid-cols-3 bg-secondary/50">
              <TabsTrigger value="manual" className="data-[state=active]:bg-background">
                <FileText className="w-4 h-4 mr-2" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="capture" className="data-[state=active]:bg-background">
                <Camera className="w-4 h-4 mr-2" />
                Capture
              </TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-background">
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              <div className="space-y-4">
                {items.map((item, index) => (
                  <BillItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    allItems={allItems}
                    categories={categories}
                    isPurchase={isPurchase}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                    onItemSelect={handleItemSelect}
                    onBatchSelect={handleBatchSelect}
                    canRemove={items.length > 1}
                  />
                ))}
                
                <button
                  onClick={addItem}
                  className="w-full py-3 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
            </TabsContent>

            <TabsContent value="capture" className="flex-1 px-6 py-4 mt-0">
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {capturedImage ? (
                  <div className="relative w-full max-w-sm">
                    <img src={capturedImage} alt="Captured bill" className="w-full rounded-xl" />
                    <button
                      onClick={() => setCapturedImage(null)}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground p-2 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center">
                      <Camera className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-center">
                      Capture a photo of your bill to extract items automatically
                    </p>
                    <button onClick={handleCapture} className="btn-accent px-6 py-3">
                      Open Camera
                    </button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="flex-1 px-6 py-4 mt-0">
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {capturedImage ? (
                  <div className="relative w-full max-w-sm">
                    <img src={capturedImage} alt="Uploaded bill" className="w-full rounded-xl" />
                    <button
                      onClick={() => setCapturedImage(null)}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground p-2 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center">
                      <Upload className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-center">
                      Upload a bill image or PDF to extract items
                    </p>
                    <button onClick={handleUpload} className="btn-accent px-6 py-3">
                      Choose File
                    </button>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Footer with Total */}
          <div className="px-6 py-4 border-t border-border bg-background">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">Bill Total</span>
              <span className="text-2xl font-bold text-foreground">{formatCurrency(totalAmount)}</span>
            </div>
            <button
              onClick={handleSave}
              disabled={items.every(item => !item.itemName.trim())}
              className="btn-accent w-full py-3 disabled:opacity-50"
            >
              Save Bill Items
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Bill Item Card Component
interface BillItemCardProps {
  item: BillItemWithBatch;
  index: number;
  allItems: Item[];
  categories: Category[];
  isPurchase: boolean;
  onUpdate: (id: string, field: keyof BillItemWithBatch, value: any) => void;
  onRemove: (id: string) => void;
  onItemSelect: (billItemId: string, item: Item) => void;
  onBatchSelect: (billItemId: string, batch: Batch) => void;
  canRemove: boolean;
}

function BillItemCard({
  item,
  index,
  allItems,
  categories,
  isPurchase,
  onUpdate,
  onRemove,
  onItemSelect,
  onBatchSelect,
  canRemove,
}: BillItemCardProps) {
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (item.itemId) {
      loadBatches();
    }
  }, [item.itemId]);

  const loadBatches = async () => {
    if (item.itemId) {
      const batchData = await getBatchesForItem(item.itemId);
      setBatches(batchData);
    }
  };

  const filteredItems = allItems.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
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

  const selectedItemObj = allItems.find(i => i.id === item.itemId);
  const effectivePreference = selectedItemObj ? 
    (selectedItemObj.batchPreference === 'category' && selectedItemObj.categoryId
      ? categories.find(c => c.id === selectedItemObj.categoryId)?.batchPreference || 'latest'
      : selectedItemObj.batchPreference === 'category' ? 'latest' : selectedItemObj.batchPreference
    ) : 'latest';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-secondary/30 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
        {canRemove && (
          <button
            onClick={() => onRemove(item.id)}
            className="text-destructive hover:bg-destructive/10 p-1 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Item Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowItemPicker(!showItemPicker)}
          className="w-full flex items-center justify-between p-3 rounded-lg bg-background border border-border text-left"
        >
          <span className={item.itemName ? 'text-foreground' : 'text-muted-foreground'}>
            {item.itemName || 'Select Item'}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showItemPicker ? 'rotate-180' : ''}`} />
        </button>

        {showItemPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowItemPicker(false)} />
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                className="w-full p-3 border-b border-border text-sm outline-none"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto">
                {filteredItems.length > 0 ? (
                  filteredItems.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => {
                        onItemSelect(item.id, i);
                        setShowItemPicker(false);
                        setSearchQuery('');
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3 text-sm hover:bg-secondary/50 transition-colors",
                        item.itemId === i.id && 'bg-primary/10'
                      )}
                    >
                      <div>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(i.sellingPrice)}
                        </div>
                      </div>
                      {item.itemId === i.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    {searchQuery ? 'No items found' : 'No items available. Add items in Items page.'}
                  </div>
                )}
                
                {/* Option to add as new item (manual entry) */}
                {searchQuery && !filteredItems.some(i => i.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <button
                    onClick={() => {
                      onUpdate(item.id, 'itemName', searchQuery);
                      setShowItemPicker(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center gap-2 p-3 text-sm text-primary hover:bg-primary/10 border-t border-border"
                  >
                    <Plus className="w-4 h-4" />
                    Add "{searchQuery}" as new item
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Batch Selector (only for sales, not purchases) */}
      {!isPurchase && item.itemId && batches.length > 0 && (
        <div className="relative">
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <Package className="w-3 h-3" />
            Batch ({effectivePreference === 'latest' ? 'Latest First' : effectivePreference === 'oldest' ? 'Oldest First' : 'Custom'})
          </label>
          <button
            type="button"
            onClick={() => setShowBatchPicker(!showBatchPicker)}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/50 text-sm"
          >
            {item.selectedBatch ? (
              <span>
                {item.selectedBatch.batchNumber || formatDate(item.selectedBatch.purchaseDate)} • 
                Qty: {item.selectedBatch.primaryQuantity} • 
                {formatCurrency(item.selectedBatch.purchaseRate)}
              </span>
            ) : (
              <span className="text-muted-foreground">Select batch</span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${showBatchPicker ? 'rotate-180' : ''}`} />
          </button>

          {showBatchPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowBatchPicker(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-40 overflow-y-auto">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => {
                        onBatchSelect(item.id, batch);
                        setShowBatchPicker(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3 text-sm hover:bg-secondary/50 transition-colors",
                        item.batchId === batch.id && 'bg-primary/10'
                      )}
                    >
                      <div className="text-left">
                        <div className="font-medium">
                          {batch.batchNumber || `Batch ${formatDate(batch.purchaseDate)}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Qty: {batch.primaryQuantity} • Rate: {formatCurrency(batch.purchaseRate)}
                        </div>
                      </div>
                      {item.batchId === batch.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!isPurchase && item.itemId && batches.length === 0 && (
        <div className="text-xs text-warning bg-warning/10 p-2 rounded-lg">
          No batches available for this item
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Primary Qty</label>
          <input
            type="number"
            value={item.primaryQuantity || ''}
            onChange={(e) => onUpdate(item.id, 'primaryQuantity', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="input-field"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Secondary Qty</label>
          <input
            type="number"
            value={item.secondaryQuantity || ''}
            onChange={(e) => onUpdate(item.id, 'secondaryQuantity', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="input-field"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Rate</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <input
              type="number"
              value={item.rate || ''}
              onChange={(e) => onUpdate(item.id, 'rate', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="input-field pl-7"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Total</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <input
              type="number"
              value={item.totalAmount || ''}
              onChange={(e) => onUpdate(item.id, 'totalAmount', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="input-field pl-7"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
