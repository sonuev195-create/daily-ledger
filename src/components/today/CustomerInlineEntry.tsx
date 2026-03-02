import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, AlertTriangle, FileText, X, Check } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { searchCustomers, getDueBillsForCustomer, getOrCreateCustomer, updateCustomerBalance } from '@/hooks/useSupabaseData';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

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

const formatCompact = (amount: number) => {
  if (amount === 0) return '₹0';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return `₹${amount}`;
};

interface CustomerInlineEntryProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

export function CustomerInlineEntry({
  transactions,
  selectedDate,
  onSave,
  onEditTransaction,
  onDeleteTransaction,
}: CustomerInlineEntryProps) {
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const customerTransactions = transactions.filter(t => t.section === 'sale');

  // Generate bill number on type change
  useEffect(() => {
    generateBillNumber(entry.type);
  }, [entry.type]);

  const generateBillNumber = async (type: CustomerSubType) => {
    const prefixMap: Record<CustomerSubType, string> = {
      sale: 'S', sales_return: 'SR', balance_paid: 'BP', customer_advance: 'CA',
    };
    const prefix = prefixMap[type];

    const { data } = await supabase
      .from('transactions')
      .select('bill_number')
      .like('bill_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (data && data.length > 0 && data[0].bill_number) {
      const lastNum = parseInt(data[0].bill_number.replace(prefix, ''), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    setEntry(prev => ({ ...prev, billNumber: `${prefix}${nextNum.toString().padStart(4, '0')}` }));
  };

  // Customer search
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

  // Load due bills for balance_paid
  useEffect(() => {
    if (entry.type === 'balance_paid' && entry.customerQuery.length >= 2) {
      getDueBillsForCustomer(entry.customerQuery).then(bills => {
        setEntry(prev => ({ ...prev, dueBills: bills }));
      });
    }
  }, [entry.type, entry.customerQuery, entry.customerId]);

  // Close dropdown on outside click
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
    setEntry(prev => ({
      ...prev,
      customerQuery: customer.name,
      customerId: customer.id,
      customerAdvance: customer.advanceBalance,
    }));
    setShowCustomerDropdown(false);
  };

  const updatePayment = (index: number, field: 'mode' | 'amount', value: string) => {
    setEntry(prev => {
      const payments = [...prev.payments];
      if (field === 'amount') {
        payments[index] = { ...payments[index], amount: parseFloat(value) || 0 };
      } else {
        payments[index] = { ...payments[index], mode: value as PaymentMode };
      }
      return { ...prev, payments };
    });
  };

  const addPaymentMode = () => {
    setEntry(prev => ({
      ...prev,
      payments: [...prev.payments, { id: uuidv4(), mode: 'upi', amount: 0 }],
    }));
  };

  const removePayment = (index: number) => {
    if (entry.payments.length > 1) {
      setEntry(prev => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) }));
    }
  };

  const toggleBillSelection = (billId: string) => {
    setEntry(prev => ({
      ...prev,
      selectedBills: prev.selectedBills.includes(billId)
        ? prev.selectedBills.filter(id => id !== billId)
        : [...prev.selectedBills, billId],
    }));
  };

  const computeDue = () => {
    const amountNum = parseFloat(entry.amount) || 0;
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);
    const advanceUsed = parseFloat(entry.useAdvance) || 0;
    return Math.max(0, amountNum - totalPayments - advanceUsed);
  };

  const handleSave = async () => {
    const amountNum = parseFloat(entry.amount) || 0;
    if (amountNum <= 0 && entry.type !== 'balance_paid') {
      toast.error('Amount is required');
      return;
    }

    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);
    let totalDuePayment = totalPayments;

    if (entry.type === 'balance_paid' && totalDuePayment <= 0) {
      toast.error('Payment amount is required');
      return;
    }

    const needsCustomer = entry.type === 'customer_advance' || entry.type === 'balance_paid' ||
      (entry.type === 'sale' && (parseFloat(entry.useAdvance) > 0 || computeDue() > 0));
    if (needsCustomer && !entry.customerQuery) {
      toast.error('Customer name is required');
      return;
    }

    setSaving(true);
    try {
      let finalCustomerId = entry.customerId;
      if (entry.customerQuery && !finalCustomerId) {
        finalCustomerId = await getOrCreateCustomer(entry.customerQuery) || undefined;
      }

      const advanceUsed = parseFloat(entry.useAdvance) || 0;
      const effectivePayment = totalPayments + advanceUsed;
      const due = entry.type === 'sale' ? Math.max(0, amountNum - effectivePayment) : 0;

      const advancePayments: PaymentEntry[] = advanceUsed > 0
        ? [{ id: uuidv4(), mode: 'advance' as PaymentMode, amount: advanceUsed }]
        : [];

      const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'sale' as TransactionSection,
        type: entry.type,
        amount: entry.type === 'balance_paid' ? totalDuePayment : amountNum,
        payments: [...entry.payments.filter(p => p.amount > 0), ...advancePayments],
        billNumber: entry.billNumber || undefined,
        customerId: finalCustomerId,
        customerName: entry.customerQuery || undefined,
        due: due > 0 ? due : undefined,
      };

      await onSave(transaction);

      // Update customer balance
      if (finalCustomerId) {
        if (due > 0) await updateCustomerBalance(finalCustomerId, due, 0);
        if (advanceUsed > 0) await updateCustomerBalance(finalCustomerId, 0, -advanceUsed);
        if (entry.type === 'customer_advance') await updateCustomerBalance(finalCustomerId, 0, amountNum);
        if (entry.type === 'balance_paid') {
          const selectedDueBills = entry.dueBills.filter(b => entry.selectedBills.includes(b.id));
          let remaining = totalDuePayment;
          for (const bill of selectedDueBills) {
            const payForBill = Math.min(remaining, bill.dueAmount);
            remaining -= payForBill;
            await supabase.from('transactions').update({ due: bill.dueAmount - payForBill }).eq('id', bill.id);
          }
          await updateCustomerBalance(finalCustomerId, -totalDuePayment, 0);
        }
      }

      setEntry(createEmptyRow());
      toast.success('Transaction saved');
    } catch (err) {
      toast.error('Error saving transaction');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const renderCustomerSearch = () => (
    <div className="relative">
      <label className="text-[10px] text-muted-foreground mb-0.5 block">Customer</label>
      <Input
        ref={customerInputRef}
        value={entry.customerQuery}
        onChange={e => setEntry(prev => ({ ...prev, customerQuery: e.target.value, customerId: undefined, customerAdvance: 0 }))}
        placeholder="Name or phone..."
        className="h-8 text-xs"
        enterKeyHint="next"
        onKeyDown={handleKeyDown}
      />
      <AnimatePresence>
        {showCustomerDropdown && customerResults.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto"
          >
            {customerResults.map(c => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className="w-full px-3 py-2 text-left hover:bg-secondary/50 text-xs border-b border-border/30 last:border-0"
              >
                <div className="flex justify-between">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex gap-2">
                    {c.advanceBalance > 0 && <span className="text-success">Adv: {formatCompact(c.advanceBalance)}</span>}
                    {c.dueBalance > 0 && <span className="text-warning">Due: {formatCompact(c.dueBalance)}</span>}
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

  const renderPaymentModes = () => (
    <div>
      <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
      <div className="space-y-1">
        {entry.payments.map((p, i) => (
          <div key={p.id} className="flex gap-1">
            <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
              <SelectTrigger className="h-7 text-[10px] w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                <SelectItem value="bank" className="text-xs">Bank</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              inputMode="numeric"
              value={p.amount || ''}
              onChange={e => updatePayment(i, 'amount', e.target.value)}
              placeholder="₹0"
              className="h-7 text-xs flex-1"
              enterKeyHint="next"
              onKeyDown={handleKeyDown}
            />
            {entry.payments.length > 1 && (
              <button onClick={() => removePayment(i)} className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addPaymentMode} className="text-[10px] text-accent hover:underline">
          + Add payment mode
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer Transactions</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Plus className="w-3 h-3" />
          Add Customer
        </Button>
      </div>

      {/* Existing transactions */}
      {customerTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[80px_auto_70px_70px_40px] gap-1 px-2 py-1.5 bg-secondary/50 text-[10px] font-medium text-muted-foreground uppercase">
            <span>Type</span>
            <span>Customer / Bill</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Paid</span>
            <span></span>
          </div>
          <div className="divide-y divide-border/50">
            {customerTransactions.map((txn, i) => {
              const totalPaid = txn.payments.reduce((s, p) => s + p.amount, 0);
              return (
                <motion.div
                  key={txn.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="grid grid-cols-[80px_auto_70px_70px_40px] gap-1 px-2 py-2 items-center hover:bg-secondary/20 text-xs"
                >
                  <span className="text-muted-foreground capitalize text-[10px]">
                    {txn.type.replace(/_/g, ' ')}
                  </span>
                  <div className="truncate">
                    <span className="font-medium">{txn.customerName || '-'}</span>
                    {txn.billNumber && <span className="text-muted-foreground ml-1">#{txn.billNumber}</span>}
                  </div>
                  <span className="text-right font-medium">{formatCompact(txn.amount)}</span>
                  <span className="text-right text-success">{formatCompact(totalPaid)}</span>
                  <div className="flex gap-0.5">
                    <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Entry Row */}
      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Plus className="w-3.5 h-3.5" />
          New Entry
        </div>

        {/* Type + Bill Number */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
            <Select
              value={entry.type}
              onValueChange={(v: string) => {
                const newType = v as CustomerSubType;
                setEntry(prev => ({ ...prev, type: newType, selectedBills: [], dueBills: [], customerQuery: '', customerId: undefined, customerAdvance: 0, amount: '' }));
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUB_TYPES.map(st => (
                  <SelectItem key={st.value} value={st.value} className="text-xs">{st.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(entry.type === 'sale' || entry.type === 'sales_return') && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Bill #</label>
              <Input
                value={entry.billNumber}
                onChange={e => setEntry(prev => ({ ...prev, billNumber: e.target.value }))}
                className="h-8 text-xs"
                enterKeyHint="next"
              />
            </div>
          )}
        </div>

        {/* Dynamic fields based on type */}
        <div className="space-y-2">
          {/* Customer search for sale, sales_return, customer_advance */}
          {(entry.type === 'sale' || entry.type === 'sales_return' || entry.type === 'customer_advance') && renderCustomerSearch()}

          {/* Balance Payment: search + due bills */}
          {entry.type === 'balance_paid' && (
            <>
              <div className="relative">
                <label className="text-[10px] text-muted-foreground mb-0.5 block">Search by Bill #, Name, or Phone</label>
                <Input
                  ref={customerInputRef}
                  value={entry.customerQuery}
                  onChange={e => setEntry(prev => ({ ...prev, customerQuery: e.target.value, customerId: undefined, selectedBills: [] }))}
                  placeholder="Bill #, name, or phone..."
                  className="h-8 text-xs"
                  enterKeyHint="next"
                  onKeyDown={handleKeyDown}
                />
                <AnimatePresence>
                  {showCustomerDropdown && customerResults.length > 0 && (
                    <motion.div
                      ref={dropdownRef}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto"
                    >
                      {customerResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className="w-full px-3 py-2 text-left hover:bg-secondary/50 text-xs border-b border-border/30 last:border-0"
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.dueBalance > 0 && <span className="text-warning ml-2">Due: {formatCompact(c.dueBalance)}</span>}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {entry.dueBills.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                    Select bills to pay
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-border/30">
                    {entry.dueBills.map(bill => (
                      <label
                        key={bill.id}
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/20 cursor-pointer text-xs"
                      >
                        <Checkbox
                          checked={entry.selectedBills.includes(bill.id)}
                          onCheckedChange={() => toggleBillSelection(bill.id)}
                        />
                        <span className="font-medium">{bill.billNumber || '-'}</span>
                        <span className="text-muted-foreground">{format(bill.createdAt, 'dd MMM')}</span>
                        <span className="ml-auto text-warning font-medium">{formatCompact(bill.dueAmount)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="px-2 py-1 bg-secondary/20 text-[10px] text-muted-foreground flex justify-between">
                    <span>Selected: {entry.selectedBills.length}</span>
                    <span className="font-medium text-foreground">
                      Total: {formatCompact(entry.dueBills.filter(b => entry.selectedBills.includes(b.id)).reduce((s, b) => s + b.dueAmount, 0))}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Amount (not for balance_paid) */}
          {entry.type !== 'balance_paid' && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input
                type="number"
                inputMode="numeric"
                value={entry.amount}
                onChange={e => setEntry(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="₹0"
                className="h-8 text-xs"
                enterKeyHint="next"
                onKeyDown={handleKeyDown}
              />
            </div>
          )}

          {/* Payment modes */}
          {renderPaymentModes()}

          {/* From Advance */}
          {entry.type === 'sale' && entry.customerAdvance > 0 && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">
                From Advance <span className="text-success">(Available: {formatCompact(entry.customerAdvance)})</span>
              </label>
              <Input
                type="number"
                inputMode="numeric"
                value={entry.useAdvance}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setEntry(prev => ({
                    ...prev,
                    useAdvance: val <= prev.customerAdvance ? e.target.value : prev.customerAdvance.toString(),
                  }));
                }}
                placeholder="₹0"
                className="h-8 text-xs"
                enterKeyHint="next"
                onKeyDown={handleKeyDown}
              />
            </div>
          )}

          {/* Due amount display */}
          {entry.type === 'sale' && computeDue() > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-warning/10 rounded-lg text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              <span className="text-warning font-medium">Due: {formatCompact(computeDue())}</span>
            </div>
          )}

          {/* Add Bill button */}
          {(entry.type === 'sale' || entry.type === 'sales_return') && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full">
              <FileText className="w-3 h-3" />
              Add Paper Bill (Upload/Capture)
            </Button>
          )}
        </div>

        {/* Save */}
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save & Next'}
        </Button>
      </div>
    </div>
  );
}
