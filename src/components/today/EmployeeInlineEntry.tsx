import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface EmployeeResult {
  id: string;
  name: string;
  advance_balance: number;
  salary: number;
}

interface SalaryCategory {
  id: string;
  name: string;
}

interface EntryRow {
  employeeId?: string;
  employeeQuery: string;
  categoryId: string;
  salary: string;
  payments: PaymentEntry[];
  employeeAdvance: number;
}

const createEmptyRow = (): EntryRow => ({
  employeeId: undefined,
  employeeQuery: '',
  categoryId: '',
  salary: '',
  payments: [{ id: uuidv4(), mode: 'cash', amount: 0 }],
  employeeAdvance: 0,
});

interface EmployeeInlineEntryProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

export function EmployeeInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction,
}: EmployeeInlineEntryProps) {
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [employees, setEmployees] = useState<EmployeeResult[]>([]);
  const [categories, setCategories] = useState<SalaryCategory[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryBalances, setCategoryBalances] = useState<Record<string, number>>({});
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpSalary, setNewEmpSalary] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const employeeTransactions = transactions.filter(t => t.section === 'employee');

  useEffect(() => {
    supabase.from('salary_categories').select('*').order('name').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (entry.employeeId) { setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      if (entry.employeeQuery.length >= 1) {
        const { data } = await supabase.from('employees').select('id, name, advance_balance, salary')
          .ilike('name', `%${entry.employeeQuery}%`).order('name').limit(10);
        setEmployees((data || []).map(e => ({ id: e.id, name: e.name, advance_balance: Number(e.advance_balance), salary: Number(e.salary) })));
        setShowDropdown(true);
      } else {
        setEmployees([]);
        setShowDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [entry.employeeQuery, entry.employeeId]);

  useEffect(() => {
    if (entry.employeeId) {
      (async () => {
        const { data } = await supabase.from('transactions')
          .select('salary_category_id, amount')
          .eq('employee_id', entry.employeeId!)
          .eq('section', 'employee');
        const balances: Record<string, number> = {};
        (data || []).forEach(t => {
          const catId = t.salary_category_id || 'uncategorized';
          balances[catId] = (balances[catId] || 0) + Number(t.amount);
        });
        setCategoryBalances(balances);
      })();
    }
  }, [entry.employeeId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectEmployee = (e: EmployeeResult) => {
    setEntry(prev => ({ ...prev, employeeQuery: e.name, employeeId: e.id, employeeAdvance: e.advance_balance, salary: e.salary.toString() }));
    setShowDropdown(false);
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

  const handleSave = async () => {
    if (!entry.employeeId) { toast.error('Select an employee'); return; }
    if (!entry.categoryId) { toast.error('Select a category'); return; }
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);
    const salaryAmount = parseFloat(entry.salary) || 0;
    // Allow zero salary (presence only) and zero payment (salary recorded, payment later)

    setSaving(true);
    try {
      const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'salary',
        amount: salaryAmount,
        payments: entry.payments.filter(p => p.amount > 0),
        employeeId: entry.employeeId,
        billNumber: `EM${Date.now().toString().slice(-6)}`,
        reference: entry.categoryId,
      };

      await onSave(transaction);

      // Only deduct advance if payment was actually made
      if (totalPayments > 0) {
        const { data: emp } = await supabase.from('employees').select('advance_balance').eq('id', entry.employeeId).single();
        if (emp && Number(emp.advance_balance) > 0) {
          await supabase.from('employees').update({
            advance_balance: Math.max(0, Number(emp.advance_balance) - totalPayments),
          }).eq('id', entry.employeeId);
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

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const { data } = await supabase.from('salary_categories').insert({ name: newCatName.trim() }).select().single();
    if (data) setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewCatName('');
    setAddCatOpen(false);
  };

  const addEmployee = async () => {
    if (!newEmpName.trim()) return;
    const { data } = await supabase.from('employees').insert({
      name: newEmpName.trim(),
      phone: newEmpPhone || null,
      salary: parseFloat(newEmpSalary) || 0,
    }).select().single();
    if (data) {
      setEntry(prev => ({
        ...prev,
        employeeQuery: data.name,
        employeeId: data.id,
        employeeAdvance: 0,
        salary: data.salary.toString(),
      }));
    }
    setNewEmpName('');
    setNewEmpPhone('');
    setNewEmpSalary('');
    setAddEmpOpen(false);
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee Transactions</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddCatOpen(true)}>
            <Plus className="w-3 h-3" /> Category
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddEmpOpen(true)}>
            <Plus className="w-3 h-3" /> Employee
          </Button>
        </div>
      </div>

      {employeeTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {employeeTransactions.map(txn => (
            <div key={txn.id} className="flex items-center gap-2 px-2 py-2 hover:bg-secondary/20 text-xs">
              <span className="font-medium truncate flex-1">{txn.employeeName || txn.reference || '-'}</span>
              <span className="font-medium">{formatINR(txn.amount)}</span>
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
          <div className="relative">
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Employee</label>
            <Input ref={inputRef} value={entry.employeeQuery}
              onChange={e => setEntry(prev => ({ ...prev, employeeQuery: e.target.value, employeeId: undefined, employeeAdvance: 0 }))}
              placeholder="Employee name..." className="h-8 text-xs" />
            {entry.employeeAdvance > 0 && (
              <p className="text-[10px] text-warning mt-0.5">Advance: {formatINR(entry.employeeAdvance)}</p>
            )}
            <AnimatePresence>
              {showDropdown && employees.length > 0 && (
                <motion.div ref={dropdownRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {employees.map(e => (
                    <button key={e.id} onClick={() => selectEmployee(e)}
                      className="w-full px-3 py-2 text-left hover:bg-secondary/50 text-xs border-b border-border/30 last:border-0">
                      <div className="flex justify-between">
                        <span className="font-medium">{e.name}</span>
                        {e.advance_balance > 0 && <span className="text-warning">Adv: {formatINR(e.advance_balance)}</span>}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Category</label>
            <Select value={entry.categoryId} onValueChange={v => setEntry(prev => ({ ...prev, categoryId: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {entry.employeeId && Object.keys(categoryBalances).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(categoryBalances).map(([catId, total]) => (
              <span key={catId} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {catId === 'uncategorized' ? 'Other' : getCategoryName(catId)}: {formatINR(total)}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Salary</label>
            <Input type="number" inputMode="numeric" value={entry.salary}
              onChange={e => setEntry(prev => ({ ...prev, salary: e.target.value }))} placeholder="₹0" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
            <div className="space-y-1">
              {entry.payments.map((p, i) => (
                <div key={p.id} className="flex gap-1">
                  <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                    <SelectTrigger className="h-7 text-[10px] w-16"><SelectValue /></SelectTrigger>
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
              ))}
              <button onClick={addPaymentMode} className="text-[10px] text-accent hover:underline">+ Add</button>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save & Next'}
        </Button>
      </div>

      {/* Add Category Dialog */}
      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Add Salary Category</DialogTitle></DialogHeader>
          <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" className="h-9" />
          <DialogFooter>
            <Button size="sm" onClick={addCategory}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={addEmpOpen} onOpenChange={setAddEmpOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Add Employee</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input value={newEmpName} onChange={e => setNewEmpName(e.target.value)} placeholder="Name" className="h-9" />
            <Input value={newEmpPhone} onChange={e => setNewEmpPhone(e.target.value)} placeholder="Phone (optional)" className="h-9" />
            <Input type="number" value={newEmpSalary} onChange={e => setNewEmpSalary(e.target.value)} placeholder="Salary" className="h-9" />
          </div>
          <DialogFooter>
            <Button size="sm" onClick={addEmployee}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
