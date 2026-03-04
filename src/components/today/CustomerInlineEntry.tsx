import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, AlertTriangle, FileText, X, Check } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { searchCustomers, getDueBillsForCustomer, getOrCreateCustomer, updateCustomerBalance } from '@/hooks/useSupabaseData';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';

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
}

export function CustomerInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction,
}: CustomerInlineEntryProps) {
  const navigate = useNavigate();
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const customerTransactions = transactions.filter(t => t.section === 'sale');

  useEffect(() => { generateBillNumber(entry.type); }, [entry.type]);

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
      };

      await onSave(transaction);

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
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
            <Select value={entry.type} onValueChange={(v: string) => {
              const newType = v as CustomerSubType;
              setEntry(prev => ({ ...prev, type: newType, selectedBills: [], dueBills: [], customerQuery: '', customerId: undefined, customerAdvance: 0, amount: '' }));
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
                      <SelectItem value="bank" className="text-xs">Bank</SelectItem>
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

        {/* Add Bill button */}
        {(entry.type === 'sale' || entry.type === 'sales_return') && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full">
            <FileText className="w-3 h-3" /> Add Paper Bill (Upload/Capture)
          </Button>
        )}

        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save & Next'}
        </Button>
      </div>
    </div>
  );
}
