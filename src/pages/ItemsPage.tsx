import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, Search, Edit2, Trash2, FileSpreadsheet, X, FolderOpen } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Item, Category } from '@/types';
import { useItems, useCategories } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Fab } from '@/components/ui/fab';
import { toast } from 'sonner';
import { CategorySheet } from '@/components/items/CategorySheet';
import { BatchList } from '@/components/items/BatchList';
import { cn } from '@/lib/utils';

export default function ItemsPage() {
  const { items: supabaseItems, loading: itemsLoading, addItem: addSupabaseItem, updateItem: updateSupabaseItem, deleteItem: deleteSupabaseItem, refetch: refetchItems } = useItems();
  const { categories, loading: categoriesLoading } = useCategories();
  
  // Enrich items with batch-computed fields (qty, rate, value)
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [activeTab, setActiveTab] = useState('single');
  const [bulkData, setBulkData] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [paperBillName, setPaperBillName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [secondaryUnit, setSecondaryUnit] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [conversionType, setConversionType] = useState<'permanent' | 'batch_wise'>('permanent');
  const [primaryQty, setPrimaryQty] = useState('');
  const [secondaryQty, setSecondaryQty] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [batchPreference, setBatchPreference] = useState<'latest' | 'oldest' | 'custom' | 'category'>('category');

  // Enrich items with batch data for display
  const enrichItemsWithBatches = useCallback(async (rawItems: Item[]) => {
    if (rawItems.length === 0) { setItems([]); setLoading(false); return; }
    
    const { data: batches } = await supabase.from('batches').select('item_id, primary_quantity, secondary_quantity, purchase_rate');
    
    const batchMap: Record<string, { totalPrimary: number; totalSecondary: number; totalValue: number; avgRate: number }> = {};
    (batches || []).forEach(b => {
      if (!batchMap[b.item_id]) batchMap[b.item_id] = { totalPrimary: 0, totalSecondary: 0, totalValue: 0, avgRate: 0 };
      const qty = Number(b.primary_quantity);
      const rate = Number(b.purchase_rate);
      batchMap[b.item_id].totalPrimary += qty;
      batchMap[b.item_id].totalSecondary += Number(b.secondary_quantity);
      batchMap[b.item_id].totalValue += qty * rate;
    });
    
    Object.values(batchMap).forEach(v => {
      v.avgRate = v.totalPrimary > 0 ? v.totalValue / v.totalPrimary : 0;
    });

    const enriched = rawItems.map(item => ({
      ...item,
      primaryQuantity: batchMap[item.id]?.totalPrimary || 0,
      secondaryQuantity: batchMap[item.id]?.totalSecondary || 0,
      purchaseRate: batchMap[item.id]?.avgRate || 0,
      inventoryValue: batchMap[item.id]?.totalValue || 0,
    }));
    
    setItems(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!itemsLoading) {
      enrichItemsWithBatches(supabaseItems);
    }
  }, [supabaseItems, itemsLoading, enrichItemsWithBatches]);

  const loadItems = async () => {
    await refetchItems();
  };

  const resetForm = () => {
    setName('');
    setPaperBillName('');
    setCategoryId('');
    setSecondaryUnit('');
    setConversionRate('');
    setConversionType('permanent');
    setPrimaryQty('');
    setSecondaryQty('');
    setPurchaseRate('');
    setSellingPrice('');
    setBatchPreference('category');
    setEditingItem(null);
    setBulkData('');
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setPaperBillName(item.paperBillName || '');
    setCategoryId(item.categoryId || '');
    setSecondaryUnit(item.secondaryUnit || '');
    setConversionRate(item.conversionRate?.toString() || '');
    setPrimaryQty((item.primaryQuantity || 0).toString());
    setSecondaryQty((item.secondaryQuantity || 0).toString());
    setPurchaseRate((item.purchaseRate || 0).toString());
    setSellingPrice(item.sellingPrice.toString());
    setBatchPreference(item.batchPreference || 'category');
    setActiveTab('single');
    setIsAddOpen(true);
  };

  const handleDelete = async (item: Item) => {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      await deleteSupabaseItem(item.id);
      window.dispatchEvent(new Event('items:changed'));
      toast.success('Item deleted');
    }
  };

  const handleSave = async () => {
    const primaryQtyNum = parseFloat(primaryQty) || 0;
    const purchaseRateNum = parseFloat(purchaseRate) || 0;
    const secondaryQtyNum = parseFloat(secondaryQty) || 0;

    if (editingItem) {
      await updateSupabaseItem(editingItem.id, {
        name,
        paperBillName: paperBillName || undefined,
        categoryId: categoryId || undefined,
        batchPreference: batchPreference,
        sellingPrice: parseFloat(sellingPrice) || 0,
        secondaryUnit: secondaryUnit || undefined,
        conversionRate: parseFloat(conversionRate) || undefined,
      });
      toast.success('Item updated');
    } else {
      const newId = await addSupabaseItem({
        name,
        paperBillName: paperBillName || undefined,
        categoryId: categoryId || undefined,
        batchPreference: batchPreference,
        sellingPrice: parseFloat(sellingPrice) || 0,
        secondaryUnit: secondaryUnit || undefined,
        conversionRate: parseFloat(conversionRate) || undefined,
      });

      // Create opening batch if any quantity is provided
      if (newId && (primaryQtyNum > 0 || secondaryQtyNum > 0)) {
        const rate = purchaseRateNum || 0;
        const batchName = `Opening Stock: ${primaryQtyNum}${secondaryQtyNum > 0 ? ` + ${secondaryQtyNum} ${secondaryUnit || 'pcs'}` : ''}${rate > 0 ? ` @₹${rate}` : ''}`;

        const { error } = await supabase.from('batches').insert({
          item_id: newId,
          batch_number: batchName,
          purchase_date: new Date().toISOString().split('T')[0],
          purchase_rate: rate,
          primary_quantity: primaryQtyNum,
          secondary_quantity: secondaryQtyNum,
        });

        if (error) {
          console.error('Error creating opening batch:', error);
          toast.error('Item added but failed to create opening batch');
        } else {
          toast.success('Item added with opening batch');
        }
      } else {
        toast.success('Item added');
      }
    }

    window.dispatchEvent(new Event('items:changed'));
    window.dispatchEvent(new Event('batches:changed'));
    setIsAddOpen(false);
    resetForm();
  };

  const parseBulkData = (data: string): Partial<Item>[] => {
    const lines = data.trim().split('\n');
    const parsedItems: Partial<Item>[] = [];

    lines.forEach((line) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      
      if (parts.length >= 1 && parts[0].trim()) {
        parsedItems.push({
          name: parts[0]?.trim() || '',
          primaryQuantity: parseFloat(parts[1]?.trim()) || 0,
          secondaryQuantity: parseFloat(parts[2]?.trim()) || 0,
          purchaseRate: parseFloat(parts[3]?.trim()) || 0,
          sellingPrice: parseFloat(parts[4]?.trim()) || 0,
        });
      }
    });

    return parsedItems;
  };

  const handleBulkImport = async () => {
    const parsedItems = parseBulkData(bulkData);
    
    if (parsedItems.length === 0) {
      toast.error('No valid items found. Check your data format.');
      return;
    }

    // Insert items into Supabase
    const itemRows = parsedItems.map(item => ({
      id: uuidv4(),
      name: item.name || '',
      batch_preference: 'latest',
      selling_price: item.sellingPrice || 0,
    }));

    const { error } = await supabase.from('items').insert(itemRows);
    if (error) {
      toast.error('Failed to import items');
      console.error(error);
      return;
    }

    // Create opening batches for items with quantities
    const batchRows = parsedItems
      .map((item, i) => {
        const qty = item.primaryQuantity || 0;
        const secQty = item.secondaryQuantity || 0;
        const rate = item.purchaseRate || 0;
        if (qty > 0 || secQty > 0) {
          return {
            item_id: itemRows[i].id,
            batch_number: `Opening Stock`,
            purchase_date: new Date().toISOString().split('T')[0],
            purchase_rate: rate,
            primary_quantity: qty,
            secondary_quantity: secQty,
          };
        }
        return null;
      })
      .filter(Boolean);

    if (batchRows.length > 0) {
      await supabase.from('batches').insert(batchRows);
    }

    await refetchItems();
    window.dispatchEvent(new Event('items:changed'));
    setIsAddOpen(false);
    resetForm();
    toast.success(`${parsedItems.length} items imported successfully`);
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalInventoryValue = items.reduce((sum, item) => sum + (item.inventoryValue || 0), 0);

  return (
    <AppLayout title="Items & Inventory">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:py-8">
        {/* Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Items & Inventory</h1>
            <p className="text-muted-foreground">Manage your products and stock</p>
          </div>
          <button
            onClick={() => setIsCategoryOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Categories
          </button>
        </div>

        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="drawer-summary-card mb-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalInventoryValue)}</p>
              <p className="text-xs text-muted-foreground">Inventory Value</p>
            </div>
          </div>
        </motion.div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="input-field pl-12"
          />
        </div>

        {/* Items List */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-secondary/50 animate-pulse" />
            ))
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary/50 flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">No items yet</h3>
              <p className="text-sm text-muted-foreground">Add your first item to get started</p>
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="transaction-card p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{item.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>Qty: {item.primaryQuantity || 0} / {item.secondaryQuantity || 0}</span>
                      <span>Rate: {formatCurrency(item.purchaseRate || 0)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-foreground">{formatCurrency(item.sellingPrice)}</p>
                    <p className="text-xs text-muted-foreground">Stock: {formatCurrency(item.inventoryValue || 0)}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => handleEdit(item)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </div>
                <BatchList item={item} onBatchesChange={loadItems} />
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <Fab onClick={() => {
        resetForm();
        setIsAddOpen(true);
      }} />

      {/* Add/Edit Sheet */}
      <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 bg-background">
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <SheetTitle>{editingItem ? 'Edit Item' : 'Add Items'}</SheetTitle>
                <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </SheetHeader>

            {!editingItem && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <TabsList className="mx-6 mt-4 grid grid-cols-2 bg-secondary/50">
                  <TabsTrigger value="single" className="data-[state=active]:bg-background">
                    <Plus className="w-4 h-4 mr-2" />
                    Single Item
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="data-[state=active]:bg-background">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Bulk Import
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Item Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter item name"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Paper Bill Name
                      <span className="text-xs text-muted-foreground/70 ml-1">(how it's usually written on bills)</span>
                    </label>
                    <input
                      type="text"
                      value={paperBillName}
                      onChange={(e) => setPaperBillName(e.target.value)}
                      placeholder="e.g., wel 10g, 1x1½ 16g"
                      className="input-field"
                    />
                  </div>

                  {/* Category Selector */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Category <span className="text-destructive">*</span></label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="input-field"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Secondary Unit & Conversion */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Secondary Unit</label>
                      <input
                        type="text"
                        value={secondaryUnit}
                        onChange={(e) => setSecondaryUnit(e.target.value)}
                        placeholder="e.g., pcs, kg"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Conversion Type</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConversionType('permanent')}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                            conversionType === 'permanent' ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground"
                          )}
                        >
                          Permanent
                        </button>
                        <button
                          onClick={() => setConversionType('batch_wise')}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                            conversionType === 'batch_wise' ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground"
                          )}
                        >
                          Batch-wise
                        </button>
                      </div>
                    </div>
                  </div>

                  {conversionType === 'permanent' && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Conversion Rate</label>
                      <input
                        type="number"
                        value={conversionRate}
                        onChange={(e) => setConversionRate(e.target.value)}
                        placeholder="1 primary = ? secondary"
                        className="input-field"
                      />
                    </div>
                  )}

                  {conversionType === 'batch_wise' && (
                    <div className="bg-info/10 rounded-xl p-3 text-xs text-info">
                      Conversion rate will be auto-calculated from each batch's primary & secondary quantities.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Primary Qty</label>
                      <input
                        type="number"
                        value={primaryQty}
                        onChange={(e) => setPrimaryQty(e.target.value)}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Secondary Qty</label>
                      <input
                        type="number"
                        value={secondaryQty}
                        onChange={(e) => setSecondaryQty(e.target.value)}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Purchase Rate</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                        <input
                          type="number"
                          value={purchaseRate}
                          onChange={(e) => setPurchaseRate(e.target.value)}
                          placeholder="0"
                          className="input-field pl-8"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Selling Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                        <input
                          type="number"
                          value={sellingPrice}
                          onChange={(e) => setSellingPrice(e.target.value)}
                          placeholder="0"
                          className="input-field pl-8"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inventory Value Preview */}
                  <div className="bg-secondary/50 rounded-xl p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Inventory Value</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency((parseFloat(primaryQty) || 0) * (parseFloat(purchaseRate) || 0))}
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="bulk" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-4">
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <h4 className="font-medium text-foreground mb-2">Import from Excel/Google Sheets</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Copy and paste data from Excel or Google Sheets. Each row should have:
                    </p>
                    <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 font-mono">
                      Name, Primary Qty, Secondary Qty, Purchase Rate, Selling Price
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Paste your data here
                    </label>
                    <textarea
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      placeholder="Product A&#9;10&#9;5&#9;100&#9;150&#10;Product B&#9;20&#9;10&#9;200&#9;300"
                      className="input-field min-h-[200px] font-mono text-sm"
                    />
                  </div>

                  {bulkData && (
                    <div className="bg-secondary/30 rounded-xl p-4">
                      <p className="text-sm text-muted-foreground">
                        Found <span className="font-semibold text-foreground">{parseBulkData(bulkData).length}</span> items to import
                      </p>
                    </div>
                  )}
                </TabsContent>

                <div className="px-6 py-4 border-t border-border">
                  {activeTab === 'single' ? (
                    <button
                      onClick={handleSave}
                      disabled={!name}
                      className="btn-accent w-full py-3 disabled:opacity-50"
                    >
                      Add Item
                    </button>
                  ) : (
                    <button
                      onClick={handleBulkImport}
                      disabled={!bulkData.trim()}
                      className="btn-accent w-full py-3 disabled:opacity-50"
                    >
                      Import Items
                    </button>
                  )}
                </div>
              </Tabs>
            )}

            {editingItem && (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Item Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter item name"
                      className="input-field"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Primary Qty</label>
                      <input
                        type="number"
                        value={primaryQty}
                        onChange={(e) => setPrimaryQty(e.target.value)}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Secondary Qty</label>
                      <input
                        type="number"
                        value={secondaryQty}
                        onChange={(e) => setSecondaryQty(e.target.value)}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Purchase Rate</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                        <input
                          type="number"
                          value={purchaseRate}
                          onChange={(e) => setPurchaseRate(e.target.value)}
                          placeholder="0"
                          className="input-field pl-8"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Selling Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                        <input
                          type="number"
                          value={sellingPrice}
                          onChange={(e) => setSellingPrice(e.target.value)}
                          placeholder="0"
                          className="input-field pl-8"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/50 rounded-xl p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Inventory Value</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency((parseFloat(primaryQty) || 0) * (parseFloat(purchaseRate) || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-border">
                  <button
                    onClick={handleSave}
                    disabled={!name}
                    className="btn-accent w-full py-3 disabled:opacity-50"
                  >
                    Update Item
                  </button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
