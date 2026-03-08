import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, X, Pencil, Trash2, Camera, Upload, Loader2 } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useItems, saveBillToSupabase, createBatchFromPurchase } from '@/hooks/useSupabaseData';

type PurchaseSubType = 'purchase_payment' | 'purchase_bill_a' | 'purchase_bill_b' | 'purchase_bill_c' | 'purchase_delivered' | 'purchase_return_a' | 'purchase_return_b' | 'purchase_expenses';

interface SupplierResult {
  id: string;
  name: string;
  balance: number;
}

interface DueBill {
  id: string;
  billNumber: string;
  amount: number;
  due: number;
}

interface EntryRow {
  type: PurchaseSubType;
  supplierId?: string;
  supplierQuery: string;
  supplierBalance: number;
  billNumber: string;
  amount: string;
  reference: string;
  payments: PaymentEntry[];
  dueBills: DueBill[];
  selectedBills: string[];
}

const createEmptyRow = (): EntryRow => ({
  type: 'purchase_bill_a',
  supplierId: undefined,
  supplierQuery: '',
  supplierBalance: 0,
  billNumber: '',
  amount: '',
  reference: '',
  payments: [{ id: uuidv4(), mode: 'cash', amount: 0 }],
  dueBills: [],
  selectedBills: [],
});

const SUB_TYPES: { value: PurchaseSubType; label: string }[] = [
  { value: 'purchase_payment', label: 'Payment' },
  { value: 'purchase_bill_a', label: 'Bill A (G)' },
  { value: 'purchase_bill_b', label: 'Bill B (N)' },
  { value: 'purchase_bill_c', label: 'Bill C (N/G)' },
  { value: 'purchase_delivered', label: 'Delivered' },
  { value: 'purchase_return_a', label: 'Return A (G)' },
  { value: 'purchase_return_b', label: 'Return B (N)' },
  { value: 'purchase_expenses', label: 'Expenses' },
];

interface PurchaseInlineEntryProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}

export function PurchaseInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction,
  editingTransaction, onCancelEdit,
}: PurchaseInlineEntryProps) {
  const { items: allItems } = useItems();
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [supplierResults, setSupplierResults] = useState<SupplierResult[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const billFileRef = useRef<HTMLInputElement>(null);
  const billCameraRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedBillItems, setExtractedBillItems] = useState<any[]>([]);

  const purchaseTransactions = transactions.filter(t => t.section === 'purchase');

  // Supplier search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (entry.supplierQuery.length >= 2) {
        const { data } = await supabase.from('suppliers').select('*')
          .ilike('name', `%${entry.supplierQuery}%`).order('name').limit(10);
        setSupplierResults((data || []).map(s => ({ id: s.id, name: s.name, balance: Number(s.balance) })));
        setShowSupplierDropdown(true);
      } else {
        setSupplierResults([]);
        setShowSupplierDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [entry.supplierQuery]);

  // Load due bills for payment
  useEffect(() => {
    if (entry.type === 'purchase_payment' && entry.supplierId) {
      (async () => {
        const { data } = await supabase.from('transactions')
          .select('id, bill_number, amount, due')
          .eq('supplier_name', entry.supplierQuery)
          .gt('due', 0)
          .order('created_at', { ascending: false });
        setEntry(prev => ({
          ...prev,
          dueBills: (data || []).map(t => ({ id: t.id, billNumber: t.bill_number || '', amount: Number(t.amount), due: Number(t.due) })),
        }));
      })();
    }
  }, [entry.type, entry.supplierId]);

  // Populate entry from editingTransaction
  useEffect(() => {
    if (editingTransaction) {
      const typeMap: Record<string, PurchaseSubType> = {
        purchase_bill: 'purchase_bill_a', purchase_payment: 'purchase_payment',
        purchase_return: 'purchase_return_a', purchase_delivered: 'purchase_delivered',
        purchase_expenses: 'purchase_expenses',
      };
      let subType = typeMap[editingTransaction.type] || 'purchase_bill_a';
      if (editingTransaction.billType === 'n_bill') subType = editingTransaction.type.includes('return') ? 'purchase_return_b' : 'purchase_bill_b';
      if (editingTransaction.billType === 'ng_bill') subType = 'purchase_bill_c';
      setEntry({
        type: subType,
        supplierId: editingTransaction.supplierId,
        supplierQuery: editingTransaction.supplierName || '',
        supplierBalance: 0,
        billNumber: editingTransaction.billNumber || '',
        amount: editingTransaction.amount?.toString() || '',
        reference: editingTransaction.reference || '',
        payments: editingTransaction.payments.length > 0 ? editingTransaction.payments : [{ id: uuidv4(), mode: 'cash', amount: 0 }],
        dueBills: [],
        selectedBills: [],
      });
    }
  }, [editingTransaction]);

  const updateExtractedItemMatch = (index: number, itemId: string) => {
    const updated = [...extractedBillItems];
    const masterItem = allItems.find(i => i.id === itemId);
    updated[index] = { ...updated[index], selectedItemId: itemId || null, matchedName: masterItem?.name || null, confirmed: !!itemId };
    setExtractedBillItems(updated);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        supplierInputRef.current && !supplierInputRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Generate bill number
  useEffect(() => {
    if (['purchase_bill_a', 'purchase_bill_b', 'purchase_bill_c', 'purchase_return_a', 'purchase_return_b'].includes(entry.type)) {
      generateBillNumber();
    }
  }, [entry.type]);

  const generateBillNumber = async () => {
    const prefix = 'PB';
    const { data } = await supabase.from('transactions').select('bill_number')
      .like('bill_number', `${prefix}%`).order('created_at', { ascending: false }).limit(1);
    let next = 1;
    if (data?.[0]?.bill_number) {
      const last = parseInt(data[0].bill_number.replace(prefix, ''), 10);
      if (!isNaN(last)) next = last + 1;
    }
    setEntry(prev => ({ ...prev, billNumber: `${prefix}${next.toString().padStart(4, '0')}` }));
  };

  const selectSupplier = (s: SupplierResult) => {
    setEntry(prev => ({ ...prev, supplierQuery: s.name, supplierId: s.id, supplierBalance: s.balance }));
    setShowSupplierDropdown(false);
  };

  const updatePayment = (i: number, field: 'mode' | 'amount', value: string) => {
    setEntry(prev => {
      const payments = [...prev.payments];
      if (field === 'amount') payments[i] = { ...payments[i], amount: parseFloat(value) || 0 };
      else payments[i] = { ...payments[i], mode: value as PaymentMode };
      return { ...prev, payments };
    });
  };

  const addPaymentMode = () => setEntry(prev => ({ ...prev, payments: [...prev.payments, { id: uuidv4(), mode: 'upi', amount: 0 }] }));
  const removePayment = (i: number) => { if (entry.payments.length > 1) setEntry(prev => ({ ...prev, payments: prev.payments.filter((_, idx) => idx !== i) })); };

  const handleBillCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsExtracting(true);
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
      const { data: configData } = await supabase.from('bill_format_config').select('*').eq('config_name', 'default').maybeSingle();
      const columnMapping = configData ? {
        totalColumns: configData.total_columns, itemNameColumn: configData.item_name_column,
        quantityColumn: configData.quantity_column, quantityType: configData.quantity_type,
        rateColumn: configData.has_rate ? configData.rate_column : null,
        amountColumn: configData.amount_column, hasRate: configData.has_rate, hasAmount: configData.has_amount,
      } : undefined;
      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames, paperBillNames, columnMapping },
      });
      if (error) throw error;
      const items = data?.items || [];
      if (items.length === 0) { toast.error('No items found'); return; }
      const enriched = items.map((ext: any) => {
        const masterItem = allItems.find(i => i.name.toLowerCase() === (ext.matchedName || ext.extractedName)?.toLowerCase());
        return { ...ext, selectedItemId: masterItem?.id || null, confirmed: !!masterItem };
      });
      setExtractedBillItems(enriched);
      const total = enriched.reduce((s: number, i: any) => s + (i.amount || 0), 0);
      if (total > 0) setEntry(prev => ({ ...prev, amount: total.toString() }));
      toast.success(`Extracted ${enriched.length} items`);
    } catch (err: any) {
      toast.error('Extraction failed: ' + (err.message || 'Unknown'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    const amountNum = parseFloat(entry.amount) || 0;
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);

    if (entry.type === 'purchase_expenses') {
      if (amountNum <= 0) { toast.error('Amount required'); return; }
    } else if (entry.type === 'purchase_payment') {
      if (totalPayments <= 0) { toast.error('Payment required'); return; }
    } else {
      if (amountNum <= 0) { toast.error('Amount required'); return; }
    }

    setSaving(true);
    try {
      // Map type to actual DB type and bill_type
      let dbType = 'purchase_bill';
      let billType: string | undefined;
      if (entry.type === 'purchase_bill_a') { dbType = 'purchase_bill'; billType = 'g_bill'; }
      else if (entry.type === 'purchase_bill_b') { dbType = 'purchase_bill'; billType = 'n_bill'; }
      else if (entry.type === 'purchase_bill_c') { dbType = 'purchase_bill'; billType = 'ng_bill'; }
      else if (entry.type === 'purchase_return_a') { dbType = 'purchase_return'; billType = 'g_bill'; }
      else if (entry.type === 'purchase_return_b') { dbType = 'purchase_return'; billType = 'n_bill'; }
      else if (entry.type === 'purchase_payment') { dbType = 'purchase_payment'; }
      else if (entry.type === 'purchase_delivered') { dbType = 'purchase_delivered'; }
      else if (entry.type === 'purchase_expenses') { dbType = 'purchase_expenses'; }

      const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'purchase' as TransactionSection,
        type: dbType,
        amount: entry.type === 'purchase_payment' ? totalPayments : amountNum,
        payments: (isPayment || isExpenses) ? entry.payments.filter(p => p.amount > 0) : [],
        billNumber: entry.billNumber || undefined,
        supplierId: entry.supplierId,
        supplierName: entry.supplierQuery || undefined,
        reference: entry.reference || undefined,
        billType: billType as any,
      };

      await onSave(transaction);

      // Update supplier balance for bill types and returns
      if (entry.supplierId) {
        const affectsDue = ['purchase_bill_a', 'purchase_bill_b', 'purchase_return_a', 'purchase_return_b'].includes(entry.type);
        if (affectsDue) {
          const isReturn = entry.type.includes('return');
          const change = isReturn ? -amountNum : amountNum;
          const { data: supplier } = await supabase.from('suppliers').select('balance').eq('id', entry.supplierId).single();
          if (supplier) {
            await supabase.from('suppliers').update({ balance: Number(supplier.balance) + change }).eq('id', entry.supplierId);
          }
        }
        if (entry.type === 'purchase_payment') {
          const { data: supplier } = await supabase.from('suppliers').select('balance').eq('id', entry.supplierId).single();
          if (supplier) {
            await supabase.from('suppliers').update({ balance: Number(supplier.balance) - totalPayments }).eq('id', entry.supplierId);
          }
          // Update individual bill dues
          let remaining = totalPayments;
          for (const billId of entry.selectedBills) {
            const bill = entry.dueBills.find(b => b.id === billId);
            if (bill && remaining > 0) {
              const pay = Math.min(remaining, bill.due);
              remaining -= pay;
              await supabase.from('transactions').update({ due: bill.due - pay }).eq('id', bill.id);
            }
          }
        }
      }

      setEntry(createEmptyRow());
      toast.success('Saved');
    } catch (err) {
      toast.error('Error saving');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const isBillType = ['purchase_bill_a', 'purchase_bill_b', 'purchase_bill_c', 'purchase_delivered', 'purchase_return_a', 'purchase_return_b'].includes(entry.type);
  const isPayment = entry.type === 'purchase_payment';
  const isExpenses = entry.type === 'purchase_expenses';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchase Transactions</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: '/suppliers' }))}>
          <Plus className="w-3 h-3" /> Add Supplier
        </Button>
      </div>

      {/* Existing transactions */}
      {purchaseTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="divide-y divide-border/50">
            {purchaseTransactions.map((txn, i) => {
              const totalPaid = txn.payments.reduce((s, p) => s + p.amount, 0);
              return (
                <div key={txn.id} className="flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs">
                  <span className="text-muted-foreground capitalize text-[10px] w-16 shrink-0">{txn.type.replace(/_/g, ' ')}</span>
                  <span className="font-medium truncate flex-1">{txn.supplierName || '-'}</span>
                  {txn.billNumber && <span className="text-muted-foreground">#{txn.billNumber}</span>}
                  <span className="font-medium">{formatINR(txn.amount)}</span>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Entry */}
      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Plus className="w-3.5 h-3.5" /> New Entry
        </div>

        {/* Supplier + Type row */}
        <div className="grid grid-cols-2 gap-2">
          {/* Supplier search */}
          <div className="relative">
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Supplier</label>
            <Input ref={supplierInputRef} value={entry.supplierQuery}
              onChange={e => setEntry(prev => ({ ...prev, supplierQuery: e.target.value, supplierId: undefined, supplierBalance: 0 }))}
              placeholder="Supplier name..." className="h-8 text-xs" />
            {entry.supplierBalance > 0 && (
              <p className="text-[10px] text-warning mt-0.5">Due: {formatINR(entry.supplierBalance)}</p>
            )}
            <AnimatePresence>
              {showSupplierDropdown && supplierResults.length > 0 && (
                <motion.div ref={dropdownRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {supplierResults.map(s => (
                    <button key={s.id} onClick={() => selectSupplier(s)}
                      className="w-full px-3 py-2 text-left hover:bg-secondary/50 text-xs border-b border-border/30 last:border-0">
                      <div className="flex justify-between">
                        <span className="font-medium">{s.name}</span>
                        {s.balance > 0 && <span className="text-warning">Due: {formatINR(s.balance)}</span>}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
            <Select value={entry.type} onValueChange={(v: string) => setEntry(prev => ({ ...prev, type: v as PurchaseSubType, selectedBills: [], dueBills: [] }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUB_TYPES.map(st => <SelectItem key={st.value} value={st.value} className="text-xs">{st.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bill number for bill/return types */}
        {isBillType && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Bill #</label>
              <Input value={entry.billNumber} onChange={e => setEntry(prev => ({ ...prev, billNumber: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input type="number" inputMode="numeric" value={entry.amount}
                onChange={e => setEntry(prev => ({ ...prev, amount: e.target.value }))} placeholder="₹0" className="h-8 text-xs" />
            </div>
          </div>
        )}

        {/* Payment: due bills */}
        {isPayment && entry.dueBills.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">Select bills to pay</div>
            <div className="max-h-32 overflow-y-auto divide-y divide-border/30">
              {entry.dueBills.map(bill => (
                <label key={bill.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/20 cursor-pointer text-xs">
                  <Checkbox checked={entry.selectedBills.includes(bill.id)}
                    onCheckedChange={() => setEntry(prev => ({
                      ...prev,
                      selectedBills: prev.selectedBills.includes(bill.id)
                        ? prev.selectedBills.filter(id => id !== bill.id) : [...prev.selectedBills, bill.id],
                    }))} />
                  <span className="font-medium">{bill.billNumber || '-'}</span>
                  <span className="ml-auto text-warning font-medium">{formatINR(bill.due)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Expenses: amount + reference */}
        {isExpenses && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input type="number" inputMode="numeric" value={entry.amount}
                onChange={e => setEntry(prev => ({ ...prev, amount: e.target.value }))} placeholder="₹0" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Details</label>
              <Input value={entry.reference} onChange={e => setEntry(prev => ({ ...prev, reference: e.target.value }))}
                placeholder="Details..." className="h-8 text-xs" />
            </div>
          </div>
        )}

        {/* Payment modes - only for payment and expenses */}
        {(isPayment || isExpenses) && (
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
          <div className="space-y-1">
            {entry.payments.map((p, i) => (
              <div key={p.id} className="flex gap-1">
                <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                  <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                    <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" inputMode="numeric" value={p.amount || ''}
                  onChange={e => updatePayment(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
                {entry.payments.length > 1 && (
                  <button onClick={() => removePayment(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                )}
              </div>
            ))
            }
            <button onClick={addPaymentMode} className="text-[10px] text-accent hover:underline">+ Add payment mode</button>
          </div>
        </div>
        )}

        {/* Bill capture for purchase bills */}
        {isBillType && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => billCameraRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />} Capture
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => billFileRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
              </Button>
              <input ref={billCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleBillCapture} />
              <input ref={billFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleBillCapture} />
            </div>
            {extractedBillItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                  Extracted Items ({extractedBillItems.length})
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border/30">
                  {extractedBillItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1 px-2 py-1.5 text-xs">
                      <span className="flex-1 truncate font-medium">{item.matchedName || item.extractedName}</span>
                      <span className="text-muted-foreground">×{item.quantity}</span>
                      <span className="font-medium">{formatINR(item.amount)}</span>
                      <button onClick={() => setExtractedBillItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
                <div className="px-2 py-1 bg-accent/10 text-xs font-medium text-accent text-right">
                  Total: {formatINR(extractedBillItems.reduce((s, i) => s + i.amount, 0))}
                </div>
              </div>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save & Next'}
        </Button>
      </div>
    </div>
  );
}
