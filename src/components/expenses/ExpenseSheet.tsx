import { useState, useEffect } from 'react';
import { X, Wallet, Receipt, ArrowUpRight, Package, Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { PaymentEntry, PaymentMode } from '@/types';
import { ItemSearchSelect } from '@/components/items/ItemSearchSelect';
import { useItems, deductFromBatch, planBatchAllocations } from '@/hooks/useSupabaseData';

interface ExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedDate: Date;
}

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
];

interface ExpenseItem {
  itemId: string;
  itemName: string;
  qty: number;
  rate: number;
}

export function ExpenseSheet({ isOpen, onClose, onSuccess, selectedDate }: ExpenseSheetProps) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [isItemTaken, setIsItemTaken] = useState(false);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const { items: allItems } = useItems();

  useEffect(() => {
    if (isOpen) {
      supabase.from('expense_categories').select('id, name').order('name').then(({ data }) => setCategories(data || []));
    }
  }, [isOpen]);

  const amountNum = parseFloat(amount) || 0;
  const itemTakenTotal = expenseItems.reduce((s, i) => s + (i.qty * i.rate), 0);
  const finalAmount = isItemTaken ? itemTakenTotal : amountNum;

  const addExpenseItem = (itemId: string) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    supabase.from('batches').select('purchase_rate, primary_quantity').eq('item_id', itemId).then(({ data }) => {
      const totalQty = (data || []).reduce((s, b) => s + Number(b.primary_quantity), 0);
      const totalVal = (data || []).reduce((s, b) => s + Number(b.purchase_rate) * Number(b.primary_quantity), 0);
      const avgRate = totalQty > 0 ? totalVal / totalQty : 0;
      setExpenseItems(prev => [...prev, { itemId, itemName: item.name, qty: 1, rate: Math.round(avgRate) }]);
    });
  };

  const handleSave = async () => {
    if (!selectedCategoryId) { toast.error('Select a category'); return; }
    if (!isItemTaken && finalAmount <= 0) { toast.error('Enter a valid amount'); return; }
    if (isItemTaken && expenseItems.length === 0) { toast.error('Add at least one item'); return; }

    setLoading(true);
    try {
      // Deduct inventory for item taken
      if (isItemTaken) {
        for (const item of expenseItems) {
          const { allocations } = await planBatchAllocations(item.itemId, item.qty, 0);
          for (const alloc of allocations) {
            await deductFromBatch(alloc.batchId, alloc.primaryQty, alloc.secondaryQty);
          }
        }
      }

      const { data: lastTx } = await supabase.from('transactions').select('bill_number')
        .like('bill_number', 'EX%').order('created_at', { ascending: false }).limit(1);
      let nextNum = 1;
      if (lastTx?.[0]?.bill_number) {
        const lastNum = parseInt(lastTx[0].bill_number.replace('EX', ''), 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      const billNumber = `EX${nextNum.toString().padStart(4, '0')}`;

      const payments: PaymentEntry[] = isItemTaken ? [] : [{ id: uuidv4(), mode: paymentMode, amount: finalAmount }];

      const { error } = await supabase.from('transactions').insert({
        id: uuidv4(),
        date: selectedDate.toISOString().split('T')[0],
        section: 'expenses',
        type: isItemTaken ? 'item_taken' : 'out',
        amount: finalAmount,
        payments: payments as any,
        bill_number: billNumber,
        expense_category_id: selectedCategoryId,
        reference: isItemTaken
          ? `Items: ${expenseItems.map(i => `${i.itemName}×${i.qty}`).join(', ')}`
          : (reference || null),
      });

      if (error) throw error;
      toast.success(`Expense of ₹${finalAmount.toLocaleString('en-IN')} recorded`);
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedCategoryId('');
    setAmount('');
    setPaymentMode('cash');
    setReference('');
    setIsItemTaken(false);
    setExpenseItems([]);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-destructive" />
                Add Expense
              </SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Category */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Category *</label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Item Taken Toggle */}
            <button
              onClick={() => setIsItemTaken(!isItemTaken)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                isItemTaken ? "border-accent bg-accent/10 text-accent" : "border-border bg-secondary/30 text-muted-foreground"
              )}
            >
              <Package className="w-4 h-4" />
              Item Taken
              {isItemTaken && <span className="text-[10px] ml-1">(amount = purchase cost)</span>}
            </button>

            {isItemTaken ? (
              <div className="space-y-2">
                <ItemSearchSelect
                  items={allItems.map(i => ({ id: i.id, name: i.name, sellingPrice: i.sellingPrice, primaryStock: i.primaryQuantity, secondaryStock: i.secondaryQuantity, secondaryUnit: i.secondaryUnit }))}
                  value={null}
                  onChange={(itemId) => { if (itemId) addExpenseItem(itemId); }}
                />
                {expenseItems.length > 0 && (
                  <div className="border border-border rounded-xl overflow-hidden">
                    {expenseItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 last:border-0 text-xs">
                        <span className="flex-1 truncate font-medium">{item.itemName}</span>
                        <Input type="number" value={item.qty} onChange={e => {
                          const updated = [...expenseItems];
                          updated[idx] = { ...updated[idx], qty: parseInt(e.target.value) || 0 };
                          setExpenseItems(updated);
                        }} className="h-7 w-14 text-xs" />
                        <span className="text-muted-foreground">×</span>
                        <Input type="number" value={item.rate} onChange={e => {
                          const updated = [...expenseItems];
                          updated[idx] = { ...updated[idx], rate: parseFloat(e.target.value) || 0 };
                          setExpenseItems(updated);
                        }} className="h-7 w-16 text-xs" />
                        <span className="font-medium w-14 text-right">₹{(item.qty * item.rate).toLocaleString('en-IN')}</span>
                        <button onClick={() => setExpenseItems(prev => prev.filter((_, i) => i !== idx))} className="text-destructive"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 bg-secondary/30 text-sm font-semibold">
                      <span>Total</span>
                      <span>₹{itemTakenTotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Amount */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Amount *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0" className="input-field pl-8 text-xl font-semibold" />
                  </div>
                </div>

                {/* Payment Mode */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> Payment Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentModes.map(mode => (
                      <button key={mode.value} onClick={() => setPaymentMode(mode.value)}
                        className={cn("py-3 rounded-xl border text-sm font-medium transition-all",
                          paymentMode === mode.value ? "border-accent bg-accent/10 text-accent" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary"
                        )}>{mode.label}</button>
                    ))}
                  </div>
                </div>

                {/* Reference */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Description</label>
                  <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g., Fuel, Repairs" />
                </div>
              </>
            )}

            {/* Summary */}
            {finalAmount > 0 && (
              <div className="bg-destructive/10 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{isItemTaken ? 'Item Expense' : 'Expense'}</span>
                  <span className="text-lg font-bold text-destructive">₹{finalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border">
            <Button onClick={handleSave} disabled={loading || finalAmount <= 0}
              className="w-full py-6 text-lg gap-2 bg-destructive hover:bg-destructive/90">
              <ArrowUpRight className="w-5 h-5" />
              {loading ? 'Saving...' : 'Record Expense'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
