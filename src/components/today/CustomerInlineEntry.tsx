import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, AlertTriangle, FileText, X, Check, Camera, Upload, Loader2 } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { searchCustomers, getDueBillsForCustomer, getOrCreateCustomer, updateCustomerBalance, saveBillToSupabase, deductFromBatch, getBatchesForItem } from '@/hooks/useSupabaseData';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { useItems } from '@/hooks/useSupabaseData';

type CustomerSubType = 'sale' | 'sales_return' | 'balance_paid' | 'customer_advance';

interface CustomerResult {
  id: string;
  name: string;
  phone: string | null;
  dueBalance: number;
  advanceBalance: number;
}

interface DueBill {
  id: string;
  billNumber: string;
  totalAmount: number;
  dueAmount: number;
  createdAt: Date;
}

interface EntryRow {
  type: CustomerSubType;
  billNumber: string;
  customerQuery: string;
  customerId?: string;
  customerAdvance: number;
  amount: string;
  payments: PaymentEntry[];
  useAdvance: string;
  selectedBills: string[];
  dueBills: DueBill[];
  welderId?: string;
}

interface WelderOption {
  id: string;
  name: string;
}

const createEmptyRow = (): EntryRow => ({
  type: 'sale',
  billNumber: '',
  customerQuery: '',
  customerId: undefined,
  customerAdvance: 0,
  amount: '',
  payments: [{ id: uuidv4(), mode: 'cash', amount: 0 }],
  useAdvance: '',
  selectedBills: [],
  dueBills: [],
  welderId: undefined,
});

const SUB_TYPES: { value: CustomerSubType; label: string }[] = [
  { value: 'sale', label: 'Sale' },
  { value: 'sales_return', label: 'Sales Return' },
  { value: 'balance_paid', label: 'Balance Payment' },
  { value: 'customer_advance', label: 'Customer Advance' },
];

interface CustomerInlineEntryProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}

export function CustomerInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction,
  editingTransaction, onCancelEdit,
}: CustomerInlineEntryProps) {
  const navigate = useNavigate();
  const { items: allItems } = useItems();
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [welders, setWelders] = useState<WelderOption[]>([]);
  const billFileRef = useRef<HTMLInputElement>(null);
  const billCameraRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedBillItems, setExtractedBillItems] = useState<any[]>([]);
  const [billImageBase64, setBillImageBase64] = useState<string | null>(null);

  const customerTransactions = transactions.filter(t => t.section === 'sale');

  useEffect(() => { generateBillNumber(entry.type); }, [entry.type]);
  useEffect(() => {
    supabase.from('welders').select('id, name').order('name').then(({ data }) => setWelders(data || []));
  }, []);

  // Populate entry from editingTransaction
  useEffect(() => {
    if (editingTransaction) {
      const typeMap: Record<string, CustomerSubType> = {
        sale: 'sale', sales_return: 'sales_return', balance_paid: 'balance_paid', customer_advance: 'customer_advance',
      };
      setEntry({
        type: typeMap[editingTransaction.type] || 'sale',
        billNumber: editingTransaction.billNumber || '',
        customerQuery: editingTransaction.customerName || '',
        customerId: editingTransaction.customerId,
        customerAdvance: 0,
        amount: editingTransaction.amount?.toString() || '',
        payments: editingTransaction.payments.length > 0 ? editingTransaction.payments : [{ id: uuidv4(), mode: 'cash', amount: 0 }],
        useAdvance: '',
        selectedBills: [],
        dueBills: [],
        welderId: editingTransaction.welderId,
      });
    }
  }, [editingTransaction]);

  const generateBillNumber = async (type: CustomerSubType) => {
    const prefixMap: Record<CustomerSubType, string> = {
      sale: 'S', sales_return: 'SR', balance_paid: 'BP', customer_advance: 'CA',
    };
    const prefix = prefixMap[type];

    // Check settings for sale bill series start
    if (type === 'sale') {
      const { data: settings } = await supabase.from('bill_format_config')
        .select('*').eq('config_name', 'bill_series_start').maybeSingle();
      const startNum = settings ? parseInt((settings as any).total_columns?.toString() || '1') : 1;
      
      const { data } = await supabase.from('transactions').select('bill_number')
        .like('bill_number', `${prefix}%`).order('created_at', { ascending: false }).limit(1);
      let nextNum = startNum;
      if (data?.[0]?.bill_number) {
        const lastNum = parseInt(data[0].bill_number.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) nextNum = Math.max(startNum, lastNum + 1);
      }
      setEntry(prev => ({ ...prev, billNumber: `${prefix}${nextNum.toString().padStart(4, '0')}` }));
      return;
    }

    const { data } = await supabase.from('transactions').select('bill_number')
      .like('bill_number', `${prefix}%`).order('created_at', { ascending: false }).limit(1);
    let nextNum = 1;
    if (data?.[0]?.bill_number) {
      const lastNum = parseInt(data[0].bill_number.replace(prefix, ''), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    setEntry(prev => ({ ...prev, billNumber: `${prefix}${nextNum.toString().padStart(4, '0')}` }));
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (entry.customerQuery.length >= 2) {
        const results = await searchCustomers(entry.customerQuery);
        setCustomerResults(results);
        setShowCustomerDropdown(true);
      } else {
        setCustomerResults([]);
        setShowCustomerDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [entry.customerQuery]);

  useEffect(() => {
    if (entry.type === 'balance_paid' && entry.customerQuery.length >= 2) {
      getDueBillsForCustomer(entry.customerQuery).then(bills => {
        setEntry(prev => ({ ...prev, dueBills: bills }));
      });
    }
  }, [entry.type, entry.customerQuery, entry.customerId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        customerInputRef.current && !customerInputRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCustomer = (customer: CustomerResult) => {
    setEntry(prev => ({ ...prev, customerQuery: customer.name, customerId: customer.id, customerAdvance: customer.advanceBalance }));
    setShowCustomerDropdown(false);
  };

  const updatePayment = (index: number, field: 'mode' | 'amount', value: string) => {
    setEntry(prev => {
      const payments = [...prev.payments];
      if (field === 'amount') payments[index] = { ...payments[index], amount: parseFloat(value) || 0 };
      else payments[index] = { ...payments[index], mode: value as PaymentMode };
      return { ...prev, payments };
    });
  };

  const addPaymentMode = () => setEntry(prev => ({ ...prev, payments: [...prev.payments, { id: uuidv4(), mode: 'upi', amount: 0 }] }));
  const removePayment = (index: number) => { if (entry.payments.length > 1) setEntry(prev => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) })); };
  const toggleBillSelection = (billId: string) => {
    setEntry(prev => ({
      ...prev, selectedBills: prev.selectedBills.includes(billId)
        ? prev.selectedBills.filter(id => id !== billId) : [...prev.selectedBills, billId],
    }));
  };

  const computeDue = () => {
    const amountNum = parseFloat(entry.amount) || 0;
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);
    const advanceUsed = parseFloat(entry.useAdvance) || 0;
    const diff = amountNum - totalPayments - advanceUsed;
    return diff; // positive = due, negative = overpayment
  };

  const [giveBackPayments, setGiveBackPayments] = useState<PaymentEntry[]>([]);

  const addGiveBack = () => setGiveBackPayments(prev => [...prev, { id: uuidv4(), mode: 'cash' as PaymentMode, amount: 0 }]);
  const updateGiveBack = (i: number, field: 'mode' | 'amount', value: string) => {
    setGiveBackPayments(prev => {
      const updated = [...prev];
      if (field === 'amount') updated[i] = { ...updated[i], amount: parseFloat(value) || 0 };
      else updated[i] = { ...updated[i], mode: value as PaymentMode };
      return updated;
    });
  };
  const removeGiveBack = (i: number) => setGiveBackPayments(prev => prev.filter((_, idx) => idx !== i));

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
      setBillImageBase64(base64);
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

  const updateExtractedItemMatch = (index: number, itemId: string) => {
    const updated = [...extractedBillItems];
    const masterItem = allItems.find(i => i.id === itemId);
    updated[index] = { ...updated[index], selectedItemId: itemId || null, matchedName: masterItem?.name || null, confirmed: !!itemId };
    setExtractedBillItems(updated);
  };

  const handleSave = async () => {
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);

    if (entry.type === 'customer_advance') {
      if (totalPayments <= 0) { toast.error('Payment required'); return; }
      if (!entry.customerQuery) { toast.error('Customer required'); return; }
    } else if (entry.type === 'balance_paid') {
      if (totalPayments <= 0) { toast.error('Payment required'); return; }
    } else {
      const amountNum = parseFloat(entry.amount) || 0;
      if (amountNum <= 0) { toast.error('Amount required'); return; }
    }

    setSaving(true);
    try {
      let finalCustomerId = entry.customerId;
      if (entry.customerQuery && !finalCustomerId) {
        finalCustomerId = await getOrCreateCustomer(entry.customerQuery) || undefined;
      }

      const amountNum = parseFloat(entry.amount) || 0;
      const advanceUsed = parseFloat(entry.useAdvance) || 0;
      const effectivePayment = totalPayments + advanceUsed;
      const due = entry.type === 'sale' ? Math.max(0, amountNum - effectivePayment) : 0;

      const advancePayments: PaymentEntry[] = advanceUsed > 0
        ? [{ id: uuidv4(), mode: 'advance' as PaymentMode, amount: advanceUsed }] : [];

      const giveBack = giveBackPayments.filter(g => g.amount > 0);

      const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'sale' as TransactionSection,
        type: entry.type,
        amount: entry.type === 'customer_advance' ? totalPayments : (entry.type === 'balance_paid' ? totalPayments : amountNum),
        payments: [...entry.payments.filter(p => p.amount > 0), ...advancePayments],
        giveBack: giveBack.length > 0 ? giveBack : undefined,
        billNumber: entry.billNumber || undefined,
        customerId: finalCustomerId,
        customerName: entry.customerQuery || undefined,
        due: due > 0 ? due : undefined,
        overpayment: due < 0 ? Math.abs(due) : undefined,
        welderId: entry.welderId || undefined,
      };

      await onSave(transaction);

      // Save bill items and deduct inventory for sale/sales_return with extracted items
      if ((entry.type === 'sale' || entry.type === 'sales_return') && extractedBillItems.length > 0) {
        // Get the transaction ID from the most recent transaction
        const { data: savedTxn } = await supabase.from('transactions')
          .select('id').eq('bill_number', entry.billNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
        
        if (savedTxn) {
          const billItemsData = extractedBillItems.filter(i => i.selectedItemId).map(i => {
            const masterItem = allItems.find(mi => mi.id === i.selectedItemId);
            return {
              itemId: i.selectedItemId,
              batchId: undefined as string | undefined,
              itemName: masterItem?.name || i.extractedName,
              primaryQty: i.quantity || 0,
              secondaryQty: 0,
              rate: i.amount && i.quantity ? i.amount / i.quantity : (masterItem?.sellingPrice || 0),
              total: i.amount || 0,
            };
          });

          // Auto-select batches and deduct for sales
          if (entry.type === 'sale') {
            for (const bi of billItemsData) {
              if (bi.itemId) {
                const batches = await getBatchesForItem(bi.itemId);
                const withStock = batches.filter(b => b.primaryQuantity > 0)
                  .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
                if (withStock.length > 0) {
                  bi.batchId = withStock[0].id;
                  await deductFromBatch(withStock[0].id, bi.primaryQty, bi.secondaryQty);
                }
              }
            }
          }

          await saveBillToSupabase(savedTxn.id, entry.billNumber, entry.type, amountNum, entry.customerQuery, undefined, billItemsData);
        }
      }

      if (finalCustomerId) {
        if (due > 0) await updateCustomerBalance(finalCustomerId, due, 0);
        if (advanceUsed > 0) await updateCustomerBalance(finalCustomerId, 0, -advanceUsed);
        if (entry.type === 'customer_advance') await updateCustomerBalance(finalCustomerId, 0, totalPayments);
        if (entry.type === 'balance_paid') {
          const selectedDueBills = entry.dueBills.filter(b => entry.selectedBills.includes(b.id));
          let remaining = totalPayments;
          for (const bill of selectedDueBills) {
            const payForBill = Math.min(remaining, bill.dueAmount);
            remaining -= payForBill;
            await supabase.from('transactions').update({ due: bill.dueAmount - payForBill }).eq('id', bill.id);
          }
          await updateCustomerBalance(finalCustomerId, -totalPayments, 0);
        }
      }

      setEntry(createEmptyRow());
      setExtractedBillItems([]);
      if (editingTransaction) onCancelEdit?.();
      toast.success('Saved');
    } catch (err) {
      toast.error('Error saving');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const renderCustomerSearch = () => (
    <div className="relative">
      <Input ref={customerInputRef} value={entry.customerQuery}
        onChange={e => setEntry(prev => ({ ...prev, customerQuery: e.target.value, customerId: undefined, customerAdvance: 0 }))}
        placeholder="Name or phone..." className="h-8 text-xs" enterKeyHint="next" />
      <AnimatePresence>
        {showCustomerDropdown && customerResults.length > 0 && (
          <motion.div ref={dropdownRef} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {customerResults.map(c => (
              <button key={c.id} onClick={() => selectCustomer(c)}
                className="w-full px-3 py-2 text-left hover:bg-secondary/50 text-xs border-b border-border/30 last:border-0">
                <div className="flex justify-between">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex gap-2">
                    {c.advanceBalance > 0 && <span className="text-success">Adv: {formatINR(c.advanceBalance)}</span>}
                    {c.dueBalance > 0 && <span className="text-warning">Due: {formatINR(c.dueBalance)}</span>}
                  </div>
                </div>
                {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer Transactions</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/customers')}>
          <Plus className="w-3 h-3" /> Add Customer
        </Button>
      </div>

      {/* Existing transactions - single line each */}
      {customerTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {customerTransactions.map((txn) => {
            const totalPaid = txn.payments.reduce((s, p) => s + p.amount, 0);
            return (
              <div key={txn.id} className="flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs">
                <span className="text-muted-foreground capitalize text-[10px] w-14 shrink-0">{txn.type.replace(/_/g, ' ')}</span>
                <span className="font-medium truncate flex-1">{txn.customerName || '-'}</span>
                {txn.billNumber && <span className="text-muted-foreground text-[10px]">#{txn.billNumber}</span>}
                <span className="font-medium shrink-0">{formatINR(txn.amount)}</span>
                {txn.due && txn.due > 0 && <span className="text-warning text-[10px] shrink-0">D:{formatINR(txn.due)}</span>}
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Entry */}
      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Plus className="w-3.5 h-3.5" /> New Entry
        </div>

        {/* Desktop: single line | Mobile: 2-3 rows */}
        {/* Row 1: Type + Bill# + Customer */}
        <div className="grid grid-cols-3 gap-2 md:grid-cols-7">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
            <Select value={entry.type} onValueChange={(v: string) => {
              const newType = v as CustomerSubType;
              setEntry(prev => ({ ...prev, type: newType, selectedBills: [], dueBills: [], customerQuery: '', customerId: undefined, customerAdvance: 0, amount: '', welderId: undefined }));
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUB_TYPES.map(st => <SelectItem key={st.value} value={st.value} className="text-xs">{st.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(entry.type === 'sale' || entry.type === 'sales_return') && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Bill #</label>
              <Input value={entry.billNumber} onChange={e => setEntry(prev => ({ ...prev, billNumber: e.target.value }))} className="h-8 text-xs" />
            </div>
          )}

          <div className={entry.type === 'balance_paid' ? 'col-span-2' : ''}>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Customer</label>
            {renderCustomerSearch()}
          </div>

          {entry.type === 'sale' && welders.length > 0 && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Welder</label>
              <Select value={entry.welderId || 'none'} onValueChange={v => setEntry(prev => ({ ...prev, welderId: v === 'none' ? undefined : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  {welders.map(w => <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Balance paid: due bills */}
        {entry.type === 'balance_paid' && entry.dueBills.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">Select bills to pay</div>
            <div className="max-h-32 overflow-y-auto divide-y divide-border/30">
              {entry.dueBills.map(bill => (
                <label key={bill.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/20 cursor-pointer text-xs">
                  <Checkbox checked={entry.selectedBills.includes(bill.id)} onCheckedChange={() => toggleBillSelection(bill.id)} />
                  <span className="font-medium">{bill.billNumber || '-'}</span>
                  <span className="text-muted-foreground">{format(bill.createdAt, 'dd MMM')}</span>
                  <span className="ml-auto text-warning font-medium">{formatINR(bill.dueAmount)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Row 2: Amount + Payment */}
        <div className="grid grid-cols-2 gap-2">
          {entry.type !== 'balance_paid' && entry.type !== 'customer_advance' && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input type="number" inputMode="numeric" value={entry.amount}
                onChange={e => setEntry(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="₹0" className="h-8 text-xs" />
            </div>
          )}
          <div className={entry.type === 'customer_advance' || entry.type === 'balance_paid' ? 'col-span-2' : ''}>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
            <div className="space-y-1">
              {entry.payments.map((p, i) => (
                <div key={p.id} className="flex gap-1">
                  <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                    <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                      <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                      <SelectItem value="cheque" className="text-xs">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" inputMode="numeric" value={p.amount || ''}
                    onChange={e => updatePayment(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
                  {entry.payments.length > 1 && (
                    <button onClick={() => removePayment(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
              <button onClick={addPaymentMode} className="text-[10px] text-accent hover:underline">+ Add</button>
            </div>
          </div>
        </div>

        {/* Row 3: Advance + Due */}
        {entry.type === 'sale' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {entry.customerAdvance > 0 && (
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">
                    From Advance <span className="text-success">({formatINR(entry.customerAdvance)})</span>
                  </label>
                  <Input type="number" inputMode="numeric" value={entry.useAdvance}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setEntry(prev => ({ ...prev, useAdvance: val <= prev.customerAdvance ? e.target.value : prev.customerAdvance.toString() }));
                    }} placeholder="₹0" className="h-8 text-xs" />
                </div>
              )}
              {computeDue() > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-warning/10 rounded-lg text-xs shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-warning font-medium">Due: {formatINR(computeDue())}</span>
                </div>
              )}
            </div>

            {/* Overpayment give-back */}
            {computeDue() < 0 && (
              <div className="border border-success/30 rounded-lg p-2 bg-success/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-success">Overpayment: {formatINR(Math.abs(computeDue()))}</span>
                  {giveBackPayments.length === 0 && (
                    <button onClick={addGiveBack} className="text-[10px] text-accent hover:underline">+ Give Back</button>
                  )}
                </div>
                {giveBackPayments.map((g, i) => (
                  <div key={g.id} className="flex gap-1">
                    <Select value={g.mode} onValueChange={v => updateGiveBack(i, 'mode', v)}>
                      <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                        <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" inputMode="numeric" value={g.amount || ''}
                      onChange={e => updateGiveBack(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
                    <button onClick={() => removeGiveBack(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                {giveBackPayments.length > 0 && (
                  <button onClick={addGiveBack} className="text-[10px] text-accent hover:underline">+ Add mode</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bill Capture for sale/return - connects with inventory */}
        {(entry.type === 'sale' || entry.type === 'sales_return') && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => billCameraRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />} Capture Bill
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => billFileRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload Bill
              </Button>
              <input ref={billCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleBillCapture} />
              <input ref={billFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleBillCapture} />
            </div>
            {extractedBillItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                  Extracted Items ({extractedBillItems.length}) — {extractedBillItems.filter(i => i.selectedItemId).length} matched
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
                  {extractedBillItems.map((item, idx) => (
                    <div key={idx} className="px-2 py-1.5 space-y-1">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground text-[10px] truncate max-w-[80px]">{item.extractedName}</span>
                        <select
                          value={item.selectedItemId || ''}
                          onChange={(e) => updateExtractedItemMatch(idx, e.target.value)}
                          className={cn(
                            "flex-1 h-7 px-1 text-[11px] bg-background/50 border rounded truncate",
                            !item.selectedItemId ? "border-destructive/50 text-destructive" : "border-border text-foreground"
                          )}
                        >
                          <option value="">No match</option>
                          {allItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                        <span className="text-muted-foreground text-[10px]">×{item.quantity}</span>
                        <span className="font-medium text-[11px]">{formatINR(item.amount)}</span>
                        <button onClick={() => setExtractedBillItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                      </div>
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

        <div className="flex gap-2">
          {editingTransaction && (
            <Button variant="outline" onClick={() => { onCancelEdit?.(); setEntry(createEmptyRow()); setExtractedBillItems([]); }} size="sm" className="h-8 text-xs">
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 h-8 text-xs gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save & Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
