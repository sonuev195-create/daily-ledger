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
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}

// ========== HOME SECTION ==========
type HomeTab = 'to_owner' | 'from_owner' | 'bank';

function HomeInlineEntry({ transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction, editingTransaction, onCancelEdit }: {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<HomeTab>('to_owner');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [details, setDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [bankShopCash, setBankShopCash] = useState('');
  const [bankOwnerCash, setBankOwnerCash] = useState('');
  const [saving, setSaving] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  const homeTransactions = transactions.filter(t => t.section === 'home');

  useEffect(() => {
    supabase.from('home_categories').select('*').order('name').then(({ data }) => {
      setCategories((data || []).map(c => ({ id: c.id, name: c.name })));
    });
  }, []);

  // Pre-fill form when editing
  useEffect(() => {
    if (editingTransaction && editingTransaction.section === 'home') {
      if (editingTransaction.type === 'bank_deposit') {
        setActiveTab('bank');
        // Parse reference for shop/owner amounts
        const ref = editingTransaction.reference || '';
        const parts = ref.split('|');
        setBankShopCash(parts[0] || '');
        setBankOwnerCash(parts[1] || '');
      } else {
        setActiveTab(editingTransaction.type === 'home_credit' ? 'from_owner' : 'to_owner');
        setDetails(editingTransaction.details || editingTransaction.reference || '');
        setAmount(editingTransaction.amount.toString());
        setCategoryId(editingTransaction.homeCategoryId || '');
      }
    }
  }, [editingTransaction]);

  const bankTotal = (parseFloat(bankShopCash) || 0) + (parseFloat(bankOwnerCash) || 0);

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

  const updateCategory = async () => {
    if (!editCatId || !editCatName.trim()) return;
    await supabase.from('home_categories').update({ name: editCatName.trim() }).eq('id', editCatId);
    setCategories(prev => prev.map(c => c.id === editCatId ? { ...c, name: editCatName.trim() } : c).sort((a, b) => a.name.localeCompare(b.name)));
    setEditCatId(null);
    setEditCatName('');
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    await supabase.from('home_categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
    if (categoryId === id) setCategoryId('');
  };

  const resetForm = () => {
    setDetails('');
    setAmount('');
    setCategoryId('');
    setBankShopCash('');
    setBankOwnerCash('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'bank') {
        const total = bankTotal;
        if (total <= 0) { toast.error('Enter amounts'); setSaving(false); return; }
        await onSave({
          date: selectedDate,
          section: 'home',
          type: 'bank_deposit',
          amount: total,
          payments: [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: total }],
          reference: `${bankShopCash || '0'}|${bankOwnerCash || '0'}`,
          details: `Shop: ₹${bankShopCash || 0}, Owner: ₹${bankOwnerCash || 0}`,
        });
      } else {
        const amt = parseFloat(amount) || 0;
        if (amt <= 0) { toast.error('Amount required'); setSaving(false); return; }
        const type = activeTab === 'from_owner' ? 'home_credit' : 'home_debit';
        await onSave({
          date: selectedDate,
          section: 'home',
          type,
          amount: amt,
          payments: [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: amt }],
          reference: details || undefined,
          details: details || undefined,
          homeCategoryId: categoryId || undefined,
        });
      }
      resetForm();
      onCancelEdit?.();
      toast.success(editingTransaction ? 'Updated' : 'Saved');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    resetForm();
    onCancelEdit?.();
  };

  const getTypeLabel = (type: string) => {
    if (type === 'home_credit') return 'From Owner';
    if (type === 'bank_deposit') return 'Bank';
    return 'To Owner';
  };

  const tabs: { id: HomeTab; label: string }[] = [
    { id: 'to_owner', label: 'To Owner' },
    { id: 'from_owner', label: 'From Owner' },
    { id: 'bank', label: 'Bank Deposit' },
  ];

  return (
    <div className="space-y-3">
      {/* Existing transactions */}
      {homeTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {homeTransactions.map(txn => (
            <div key={txn.id} className={cn("flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs", editingTransaction?.id === txn.id && "bg-accent/10 ring-1 ring-accent/30")}>
              <span className={cn("text-[10px] w-16 shrink-0 font-medium",
                txn.type === 'home_credit' ? 'text-success' : txn.type === 'bank_deposit' ? 'text-info' : 'text-destructive'
              )}>
                {getTypeLabel(txn.type)}
              </span>
              <span className="truncate flex-1">{txn.details || txn.reference || '-'}</span>
              <span className="font-medium shrink-0">{formatINR(txn.amount)}</span>
              <div className="flex gap-0.5 shrink-0">
                <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              activeTab === tab.id ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TO OWNER */}
      {activeTab === 'to_owner' && (
        <div className={cn("border rounded-lg p-3 space-y-2", editingTransaction ? "border-warning/50 bg-warning/5" : "border-accent/30 bg-accent/5")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: editingTransaction ? 'hsl(var(--warning))' : 'hsl(var(--accent))' }}>
              {editingTransaction ? '✏️ Editing To Owner' : 'To Owner (Cash)'}
            </span>
            <div className="flex items-center gap-1">
              {editingTransaction && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCancel}><X className="w-3 h-3 mr-1" /> Cancel</Button>}
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setAddCatOpen(true)}>⚙ Cat</Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
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
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save'}
          </Button>
        </div>
      )}

      {/* FROM OWNER */}
      {activeTab === 'from_owner' && (
        <div className={cn("border rounded-lg p-3 space-y-2", editingTransaction ? "border-warning/50 bg-warning/5" : "border-accent/30 bg-accent/5")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: editingTransaction ? 'hsl(var(--warning))' : 'hsl(var(--accent))' }}>
              {editingTransaction ? '✏️ Editing From Owner' : 'From Owner (Cash)'}
            </span>
            {editingTransaction && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCancel}><X className="w-3 h-3 mr-1" /> Cancel</Button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Details</label>
              <Input value={details} onChange={e => setDetails(e.target.value)} placeholder="Details..." className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save'}
          </Button>
        </div>
      )}

      {/* BANK DEPOSIT */}
      {activeTab === 'bank' && (
        <div className={cn("border rounded-lg p-3 space-y-2", editingTransaction ? "border-warning/50 bg-warning/5" : "border-accent/30 bg-accent/5")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: editingTransaction ? 'hsl(var(--warning))' : 'hsl(var(--accent))' }}>
              {editingTransaction ? '✏️ Editing Bank Deposit' : 'Bank Deposit'}
            </span>
            {editingTransaction && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCancel}><X className="w-3 h-3 mr-1" /> Cancel</Button>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Cash from Shop</label>
              <Input type="number" inputMode="numeric" value={bankShopCash} onChange={e => setBankShopCash(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Cash from Owner</label>
              <Input type="number" inputMode="numeric" value={bankOwnerCash} onChange={e => setBankOwnerCash(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Total</label>
              <div className="h-8 flex items-center px-3 bg-secondary/50 rounded-md text-xs font-bold">{formatINR(bankTotal)}</div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save'}
          </Button>
        </div>
      )}

      {/* Category Management Dialog */}
      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Home Categories</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name" className="h-9 flex-1" />
              <Button size="sm" onClick={addCategory}>Add</Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {categories.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-secondary/30 text-xs">
                  {editCatId === c.id ? (
                    <>
                      <Input value={editCatName} onChange={e => setEditCatName(e.target.value)} className="h-7 text-xs flex-1" />
                      <button onClick={updateCategory} className="text-success"><Check className="w-3 h-3" /></button>
                      <button onClick={() => setEditCatId(null)} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">{c.name}</span>
                      <button onClick={() => { setEditCatId(c.id); setEditCatName(c.name); }} className="text-muted-foreground hover:text-accent"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => deleteCategory(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== EXCHANGE SECTION ==========
function ExchangeInlineEntry({ transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction, editingTransaction, onCancelEdit }: {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}) {
  const [exchangeType, setExchangeType] = useState<'upi_to_cash' | 'cash_to_upi'>('upi_to_cash');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const exchangeTransactions = transactions.filter(t => t.section === 'exchange');

  // Pre-fill form when editing
  useEffect(() => {
    if (editingTransaction && editingTransaction.section === 'exchange') {
      setAmount(editingTransaction.amount.toString());
      // Determine type from payments
      const hasCashPayment = editingTransaction.payments.some(p => p.mode === 'cash');
      setExchangeType(hasCashPayment ? 'cash_to_upi' : 'upi_to_cash');
    }
  }, [editingTransaction]);

  const resetForm = () => {
    setAmount('');
    setExchangeType('upi_to_cash');
  };

  const handleSave = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
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
      resetForm();
      onCancelEdit?.();
      toast.success(editingTransaction ? 'Updated' : 'Saved');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    resetForm();
    onCancelEdit?.();
  };

  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exchange</span>

      {exchangeTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {exchangeTransactions.map(txn => (
            <div key={txn.id} className={cn("flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs", editingTransaction?.id === txn.id && "bg-accent/10 ring-1 ring-accent/30")}>
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

      <div className={cn("border rounded-lg p-3 space-y-2", editingTransaction ? "border-warning/50 bg-warning/5" : "border-accent/30 bg-accent/5")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: editingTransaction ? 'hsl(var(--warning))' : 'hsl(var(--accent))' }}>
            {editingTransaction ? <><Pencil className="w-3.5 h-3.5" /> Editing</> : <><Plus className="w-3.5 h-3.5" /> New Entry</>}
          </div>
          {editingTransaction && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCancel}><X className="w-3 h-3 mr-1" /> Cancel</Button>
          )}
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
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ========== EXPENSE SECTION ==========
function ExpenseInlineEntry({ transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction, editingTransaction, onCancelEdit }: {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
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

  // Pre-fill form when editing
  useEffect(() => {
    if (editingTransaction && editingTransaction.section === 'expenses') {
      setDetails(editingTransaction.reference || '');
      setPayments(editingTransaction.payments.length > 0 ? editingTransaction.payments : [{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    }
  }, [editingTransaction]);

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

  const resetForm = () => {
    setDetails('');
    setCategoryId('');
    setPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
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
      resetForm();
      onCancelEdit?.();
      toast.success(editingTransaction ? 'Updated' : 'Saved');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    resetForm();
    onCancelEdit?.();
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
              <div key={txn.id} className={cn("flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs", editingTransaction?.id === txn.id && "bg-accent/10 ring-1 ring-accent/30")}>
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

      <div className={cn("border rounded-lg p-3 space-y-2", editingTransaction ? "border-warning/50 bg-warning/5" : "border-accent/30 bg-accent/5")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: editingTransaction ? 'hsl(var(--warning))' : 'hsl(var(--accent))' }}>
            {editingTransaction ? <><Pencil className="w-3.5 h-3.5" /> Editing</> : <><Plus className="w-3.5 h-3.5" /> New Entry</>}
          </div>
          {editingTransaction && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCancel}><X className="w-3 h-3 mr-1" /> Cancel</Button>
          )}
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
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save'}
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
  categoryId, transactions, onAddTransaction, onEditTransaction, onDeleteTransaction, selectedDate, onSave, editingTransaction, onCancelEdit,
}: CategoryTransactionListProps) {
  if (categoryId === 'home') {
    return <HomeInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={onSave} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} editingTransaction={editingTransaction} onCancelEdit={onCancelEdit} />;
  }
  if (categoryId === 'exchange') {
    return <ExchangeInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={onSave} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} editingTransaction={editingTransaction} onCancelEdit={onCancelEdit} />;
  }
  if (categoryId === 'expense') {
    return <ExpenseInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={onSave} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} editingTransaction={editingTransaction} onCancelEdit={onCancelEdit} />;
  }
  return null;
}
