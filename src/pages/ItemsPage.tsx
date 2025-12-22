import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Item } from '@/types';
import { getAllItems, addItem, updateItem } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Fab } from '@/components/ui/fab';
import { cn } from '@/lib/utils';

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [primaryQty, setPrimaryQty] = useState('');
  const [secondaryQty, setSecondaryQty] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const data = await getAllItems();
    setItems(data);
    setLoading(false);
  };

  const resetForm = () => {
    setName('');
    setPrimaryQty('');
    setSecondaryQty('');
    setPurchaseRate('');
    setSellingPrice('');
    setEditingItem(null);
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setPrimaryQty(item.primaryQuantity.toString());
    setSecondaryQty(item.secondaryQuantity.toString());
    setPurchaseRate(item.purchaseRate.toString());
    setSellingPrice(item.sellingPrice.toString());
    setIsAddOpen(true);
  };

  const handleSave = async () => {
    const primaryQtyNum = parseFloat(primaryQty) || 0;
    const purchaseRateNum = parseFloat(purchaseRate) || 0;

    const itemData: Item = {
      id: editingItem?.id || uuidv4(),
      name,
      primaryQuantity: primaryQtyNum,
      secondaryQuantity: parseFloat(secondaryQty) || 0,
      purchaseRate: purchaseRateNum,
      sellingPrice: parseFloat(sellingPrice) || 0,
      inventoryValue: primaryQtyNum * purchaseRateNum,
      createdAt: editingItem?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    if (editingItem) {
      await updateItem(itemData);
    } else {
      await addItem(itemData);
    }

    await loadItems();
    setIsAddOpen(false);
    resetForm();
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

  const totalInventoryValue = items.reduce((sum, item) => sum + item.inventoryValue, 0);

  return (
    <AppLayout title="Items & Inventory">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:py-8">
        {/* Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Items & Inventory</h1>
            <p className="text-muted-foreground">Manage your products and stock</p>
          </div>
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
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">{item.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>Qty: {item.primaryQuantity} / {item.secondaryQuantity}</span>
                      <span>Rate: {formatCurrency(item.purchaseRate)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{formatCurrency(item.sellingPrice)}</p>
                    <p className="text-xs text-muted-foreground">Stock: {formatCurrency(item.inventoryValue)}</p>
                  </div>
                  <button
                    onClick={() => handleEdit(item)}
                    className="ml-4 w-10 h-10 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
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
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl p-0 bg-background">
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 py-4 border-b border-border">
              <SheetTitle>{editingItem ? 'Edit Item' : 'Add Item'}</SheetTitle>
            </SheetHeader>

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

              {/* Inventory Value Preview */}
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
                {editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
