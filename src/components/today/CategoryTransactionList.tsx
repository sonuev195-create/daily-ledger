import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Wallet, CreditCard, AlertTriangle, Plus, X, Check, Pencil, Trash2 } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { CategoryId } from './CategoryAccordion';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface CategoryTransactionListProps {
  categoryId: Exclude<CategoryId, 'drawer' | 'customer' | 'purchase' | 'employee'>;
  transactions: Transaction[];
  onAddTransaction: (section: TransactionSection, type: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

// ========== HOME SECTION ==========
function HomeInlineEntry({ transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction }: {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  const [direction, setDirection] = useState<'to_owner' | 'from_owner'>('to_owner');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [details, setDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const homeTransactions = transactions.filter(t => t.section === 'home');

  useEffect(() => {
    supabase.from('home_categories').select('*').order('name').then(({ data }) => {
      setCategories((data || []).map(c => ({ id: c.id, name: c.name })));
    });
  }, []);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const { data } = await supabase.from('home_categories').insert({ name: newCatName.trim() }).select().single();
    if (data) {
      setCategories(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(data.id);
    }
    setNewCatName('');
    setAddCatOpen(false);
  };

  const handleSave = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
      const type = direction === 'from_owner' ? 'home_credit' : 'home_debit';
      await onSave({
        date: selectedDate,
        section: 'home',
        type,
        amount: amt,
        payments: [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: amt }],
        reference: details || undefined,
      });
      setDetails('');
      setAmount('');
      toast.success('Saved');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Home</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddCatOpen(true)}>
          <Plus className="w-3 h-3" /> Add Category
        </Button>
      </div>

      {homeTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {homeTransactions.map(txn => (
            <div key={txn.id} className="flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs">
              <span className={cn("text-[10px] w-14 shrink-0 font-medium", txn.type === 'home_credit' ? 'text-success' : 'text-destructive')}>
                {txn.type === 'home_credit' ? 'From' : 'To'}
              </span>
              <span className="truncate flex-1">{txn.reference || '-'}</span>
              <span className="font-medium shrink-0">{formatINR(txn.amount)}</span>
              <div className="flex gap-0.5 shrink-0">
                <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Plus className="w-3.5 h-3.5" /> New Entry
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Direction</label>
            <Select value={direction} onValueChange={(v: string) => setDirection(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="to_owner" className="text-xs">To Owner</SelectItem>
                <SelectItem value="from_owner" className="text-xs">From Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Details</label>
            <Input value={details} onChange={e => setDetails(e.target.value)} placeholder="Details..." className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount (Cash)</label>
            <Input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Add Home Category</DialogTitle></DialogHeader>
          <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" className="h-9" />
          <DialogFooter>
            <Button size="sm" onClick={addCategory}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== EXCHANGE SECTION ==========
function ExchangeInlineEntry({ transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction }: {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  const [exchangeType, setExchangeType] = useState<'upi_to_cash' | 'cash_to_upi'>('upi_to_cash');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const exchangeTransactions = transactions.filter(t => t.section === 'exchange');

  const handleSave = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
      // UPI to Cash: customer gives UPI, you give Cash → cashOut, upiIn
      // Cash to UPI: customer gives Cash, you give UPI → cashIn, upiOut
      const payments: PaymentEntry[] = exchangeType === 'upi_to_cash'
        ? [{ id: uuidv4(), mode: 'upi' as PaymentMode, amount: amt }]
        : [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: amt }];
      const giveBack = exchangeType === 'upi_to_cash'
        ? [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: amt }]
        : [{ id: uuidv4(), mode: 'upi' as PaymentMode, amount: amt }];

      await onSave({
        date: selectedDate,
        section: 'exchange',
        type: 'exchange',
        amount: amt,
        payments,
        giveBack,
      });
      setAmount('');
      toast.success('Saved');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exchange</span>

      {exchangeTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {exchangeTransactions.map(txn => (
            <div key={txn.id} className="flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs">
              <span className="text-[10px] w-16 shrink-0 text-muted-foreground capitalize">{txn.type.replace(/_/g, ' ')}</span>
              <span className="font-medium flex-1">{formatINR(txn.amount)}</span>
              <div className="flex gap-0.5 shrink-0">
                <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Plus className="w-3.5 h-3.5" /> New Entry
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
            <Select value={exchangeType} onValueChange={(v: string) => setExchangeType(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi_to_cash" className="text-xs">UPI to Cash</SelectItem>
                <SelectItem value="cash_to_upi" className="text-xs">Cash to UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
            <Input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ========== EXPENSE SECTION ==========
function ExpenseInlineEntry({ transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction }: {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [details, setDetails] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const expenseTransactions = transactions.filter(t => t.section === 'expenses');

  useEffect(() => {
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => {
      setCategories((data || []).map(c => ({ id: c.id, name: c.name })));
    });
  }, []);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const { data } = await supabase.from('expense_categories').insert({ name: newCatName.trim() }).select().single();
    if (data) {
      setCategories(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(data.id);
    }
    setNewCatName('');
    setAddCatOpen(false);
  };

  const updatePayment = (i: number, field: 'mode' | 'amount', value: string) => {
    setPayments(prev => {
      const updated = [...prev];
      if (field === 'amount') updated[i] = { ...updated[i], amount: parseFloat(value) || 0 };
      else updated[i] = { ...updated[i], mode: value as PaymentMode };
      return updated;
    });
  };

  const addPaymentMode = () => setPayments(prev => [...prev, { id: uuidv4(), mode: 'upi', amount: 0 }]);
  const removePayment = (i: number) => { if (payments.length > 1) setPayments(prev => prev.filter((_, idx) => idx !== i)); };

  const handleSave = async () => {
    const total = payments.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) { toast.error('Payment required'); return; }
    setSaving(true);
    try {
      await onSave({
        date: selectedDate,
        section: 'expenses',
        type: 'other_expenses',
        amount: total,
        payments: payments.filter(p => p.amount > 0),
        reference: details || undefined,
      });
      setDetails('');
      setCategoryId('');
      setPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
      toast.success('Saved');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expenses</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddCatOpen(true)}>
          <Plus className="w-3 h-3" /> Add Category
        </Button>
      </div>

      {expenseTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {expenseTransactions.map(txn => {
            const cashAmt = txn.payments.filter(p => p.mode === 'cash').reduce((s, p) => s + p.amount, 0);
            const upiAmt = txn.payments.filter(p => p.mode === 'upi').reduce((s, p) => s + p.amount, 0);
            return (
              <div key={txn.id} className="flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs">
                <span className="truncate flex-1">{txn.reference || txn.type.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {cashAmt > 0 && <span className="text-success flex items-center gap-0.5"><Wallet className="w-3 h-3" />{formatINR(cashAmt)}</span>}
                  {upiAmt > 0 && <span className="text-info flex items-center gap-0.5"><CreditCard className="w-3 h-3" />{formatINR(upiAmt)}</span>}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Plus className="w-3.5 h-3.5" /> New Entry
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Details</label>
            <Input value={details} onChange={e => setDetails(e.target.value)} placeholder="Details..." className="h-8 text-xs" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
          <div className="space-y-1">
            {payments.map((p, i) => (
              <div key={p.id} className="flex gap-1">
                <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                  <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                    <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" inputMode="numeric" value={p.amount || ''} onChange={e => updatePayment(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
                {payments.length > 1 && (
                  <button onClick={() => removePayment(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                )}
              </div>
            ))}
            <button onClick={addPaymentMode} className="text-[10px] text-accent hover:underline">+ Add</button>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Add Expense Category</DialogTitle></DialogHeader>
          <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" className="h-9" />
          <DialogFooter>
            <Button size="sm" onClick={addCategory}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== MAIN EXPORT ==========
export function CategoryTransactionList({
  categoryId, transactions, onAddTransaction, onEditTransaction, onDeleteTransaction, selectedDate, onSave,
}: CategoryTransactionListProps) {
  if (categoryId === 'home') {
    return <HomeInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={onSave} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} />;
  }
  if (categoryId === 'exchange') {
    return <ExchangeInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={onSave} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} />;
  }
  if (categoryId === 'expense') {
    return <ExpenseInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={onSave} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} />;
  }
  return null;
}
