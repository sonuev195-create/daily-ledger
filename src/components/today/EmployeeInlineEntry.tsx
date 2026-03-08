import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

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
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}

type EntryMode = 'this_month' | 'previous';

export function EmployeeInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction, editingTransaction, onCancelEdit,
}: EmployeeInlineEntryProps) {
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [mode, setMode] = useState<EntryMode>('this_month');
  const [employees, setEmployees] = useState<EmployeeResult[]>([]);
  const { selectableMethods } = usePaymentMethods();
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
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [previousDue, setPreviousDue] = useState<number>(0);
  const [thisMonthDue, setThisMonthDue] = useState<number>(0);

  // Filter out "Previous" from categories for display
  const filteredCategories = categories.filter(c => c.name.toLowerCase() !== 'previous');

  useEffect(() => {
    supabase.from('salary_categories').select('*').order('name').then(({ data }) => setCategories(data || []));
  }, []);

  // Fetch employee names for existing transactions
  useEffect(() => {
    const empIds = [...new Set(employeeTransactions.map(t => t.employeeId).filter(Boolean))];
    if (empIds.length === 0) return;
    supabase.from('employees').select('id, name').in('id', empIds as string[]).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach(e => { map[e.id] = e.name; });
      setEmployeeNames(map);
    });
  }, [transactions]);

  // Calculate previous month due when in previous mode
  useEffect(() => {
    if (!entry.employeeId || mode !== 'previous') { setPreviousDue(0); return; }
    (async () => {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(firstOfMonth);
      lastMonth.setDate(lastMonth.getDate() - 1);
      const firstOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);

      const { data } = await supabase.from('transactions')
        .select('amount, payments')
        .eq('employee_id', entry.employeeId!)
        .eq('section', 'employee')
        .gte('date', format(firstOfLastMonth, 'yyyy-MM-dd'))
        .lte('date', format(lastMonth, 'yyyy-MM-dd'));

      let totalSalary = 0;
      let totalPaid = 0;
      (data || []).forEach(t => {
        totalSalary += Number(t.amount);
        const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
        totalPaid += payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      });
      const due = Math.max(0, totalSalary - totalPaid);
      setPreviousDue(due);
      if (due > 0) {
        setEntry(prev => ({
          ...prev,
          salary: due.toString(),
          payments: [{ id: uuidv4(), mode: prev.payments[0]?.mode || 'cash', amount: due }],
        }));
      }
    })();
  }, [entry.employeeId, mode]);

  // Calculate this month due
  useEffect(() => {
    if (!entry.employeeId || mode !== 'this_month') { setThisMonthDue(0); return; }
    (async () => {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data } = await supabase.from('transactions')
        .select('amount, payments')
        .eq('employee_id', entry.employeeId!)
        .eq('section', 'employee')
        .gte('date', format(firstOfMonth, 'yyyy-MM-dd'))
        .lte('date', format(lastOfMonth, 'yyyy-MM-dd'));

      let totalSalary = 0;
      let totalPaid = 0;
      (data || []).forEach(t => {
        totalSalary += Number(t.amount);
        const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
        totalPaid += payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      });
      setThisMonthDue(Math.max(0, totalSalary - totalPaid));
    })();
  }, [entry.employeeId, mode]);

  useEffect(() => {
    if (entry.employeeId) { setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      if (entry.employeeId) return;
      if (entry.employeeQuery.length >= 1) {
        const { data } = await supabase.from('employees').select('id, name, advance_balance, salary')
          .ilike('name', `%${entry.employeeQuery}%`).order('name').limit(10);
        if (entry.employeeId) return;
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

  // Pre-fill form when editing
  useEffect(() => {
    if (editingTransaction && editingTransaction.section === 'employee') {
      const empId = editingTransaction.employeeId;
      // Check if this is a "previous" category transaction
      const prevCat = categories.find(c => c.name.toLowerCase() === 'previous');
      if (prevCat && editingTransaction.reference === prevCat.id) {
        setMode('previous');
      } else {
        setMode('this_month');
      }
      if (empId) {
        supabase.from('employees').select('id, name, advance_balance, salary').eq('id', empId).single().then(({ data }) => {
          if (data) {
            setEntry(prev => ({
              ...prev,
              employeeQuery: data.name,
              employeeId: data.id,
              employeeAdvance: Number(data.advance_balance),
              salary: editingTransaction.amount.toString(),
              categoryId: editingTransaction.reference || '',
              payments: editingTransaction.payments.length > 0 ? editingTransaction.payments : [{ id: uuidv4(), mode: 'cash', amount: 0 }],
            }));
          }
        });
      }
    }
  }, [editingTransaction, categories]);

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

  const handleModeChange = (newMode: EntryMode) => {
    setMode(newMode);
    // Reset payment when switching modes
    setEntry(prev => ({
      ...prev,
      categoryId: '',
      salary: newMode === 'this_month' && prev.employeeId ? prev.salary : '',
      payments: [{ id: uuidv4(), mode: 'cash', amount: 0 }],
    }));
  };

  const handleSave = async () => {
    if (!entry.employeeId) { toast.error('Select an employee'); return; }
    if (mode === 'this_month' && !entry.categoryId) { toast.error('Select a category'); return; }
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);
    const salaryAmount = parseFloat(entry.salary) || 0;

    // For previous mode, find/create the "Previous" category
    let categoryId = entry.categoryId;
    if (mode === 'previous') {
      let prevCat = categories.find(c => c.name.toLowerCase() === 'previous');
      if (!prevCat) {
        const { data } = await supabase.from('salary_categories').insert({ name: 'Previous' }).select().single();
        if (data) {
          prevCat = data;
          setCategories(prev => [...prev, data]);
        }
      }
      categoryId = prevCat?.id || '';
    }

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
        reference: categoryId,
      };

      await onSave(transaction);

      if (totalPayments > 0) {
        const { data: emp } = await supabase.from('employees').select('advance_balance').eq('id', entry.employeeId).single();
        if (emp && Number(emp.advance_balance) > 0) {
          await supabase.from('employees').update({
            advance_balance: Math.max(0, Number(emp.advance_balance) - totalPayments),
          }).eq('id', entry.employeeId);
        }
      }

      setEntry(createEmptyRow());
      onCancelEdit?.();
      toast.success(editingTransaction ? 'Updated' : 'Saved');
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
          {employeeTransactions.map(txn => {
            const empName = txn.employeeId ? employeeNames[txn.employeeId] : undefined;
            const catName = txn.reference ? getCategoryName(txn.reference) : undefined;
            const totalPaid = txn.payments.reduce((s, p) => s + p.amount, 0);
            return (
              <div key={txn.id} className={cn("px-2 py-2 hover:bg-secondary/20 space-y-0.5", editingTransaction?.id === txn.id && "bg-accent/10 ring-1 ring-accent/30")}>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium truncate flex-1">{empName || txn.employeeName || '-'}</span>
                  {catName && catName !== 'Unknown' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{catName}</span>}
                  {txn.billNumber && <span className="text-[10px] text-muted-foreground">#{txn.billNumber}</span>}
                  <span className="font-semibold shrink-0">{formatINR(txn.amount)}</span>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-4 text-[10px]">
                  {txn.payments.filter(p => p.amount > 0).map((p, pi) => (
                    <span key={pi} className={cn(
                      p.mode === 'cash' ? 'text-success' : p.mode === 'upi' ? 'text-info' : 'text-muted-foreground'
                    )}>
                      {p.mode === 'cash' ? '💵' : p.mode === 'upi' ? '📱' : '💳'}{formatINR(p.amount)}
                    </span>
                  ))}
                  {totalPaid > 0 && <span className="text-muted-foreground">Paid:{formatINR(totalPaid)}</span>}
                  {txn.amount > 0 && totalPaid < txn.amount && <span className="text-warning">Due:{formatINR(txn.amount - totalPaid)}</span>}
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
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEntry(createEmptyRow()); onCancelEdit?.(); }}><X className="w-3 h-3 mr-1" /> Cancel</Button>
          )}
        </div>

        {/* Previous / This Month Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border">
          <button
            onClick={() => handleModeChange('this_month')}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium transition-colors",
              mode === 'this_month' ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
            )}
          >
            This Month
          </button>
          <button
            onClick={() => handleModeChange('previous')}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium transition-colors",
              mode === 'previous' ? "bg-warning text-warning-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
            )}
          >
            Previous
          </button>
        </div>

        {/* Employee Search */}
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

        {/* Previous Mode: Due + Payment only */}
        {mode === 'previous' && (
          <div className="space-y-2">
            {entry.employeeId && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-2">
                <span className="text-xs font-medium text-warning">Previous Month Due: {formatINR(previousDue)}</span>
              </div>
            )}
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
              <div className="space-y-1">
                {entry.payments.map((p, i) => (
                  <div key={p.id} className="flex gap-1">
                    <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                      <SelectTrigger className="h-7 text-[10px] w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {selectableMethods.map(m => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                        ))}
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
        )}

        {/* This Month Mode: Category + Salary + Payment */}
        {mode === 'this_month' && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Category</label>
              <Select value={entry.categoryId} onValueChange={v => setEntry(prev => ({ ...prev, categoryId: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {entry.employeeId && thisMonthDue > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-2">
                <span className="text-xs font-medium text-accent">This Month Due: {formatINR(thisMonthDue)}</span>
              </div>
            )}

            {entry.employeeId && Object.keys(categoryBalances).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(categoryBalances).map(([catId, total]) => {
                  const catName = catId === 'uncategorized' ? 'Other' : getCategoryName(catId);
                  if (catName.toLowerCase() === 'previous') return null;
                  return (
                    <span key={catId} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {catName}: {formatINR(total)}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">Day Salary</label>
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
                          {selectableMethods.map(m => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                          ))}
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
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save & Next'}
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
