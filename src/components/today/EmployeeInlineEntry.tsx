import { useState, useEffect } from 'react';
import { Check, X, Pencil, Trash2, Users, Hammer, Search } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { generateDailyBillNumber } from '@/lib/billNumbers';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface EmployeeResult {
  id: string;
  name: string;
  advance_balance: number;
  salary: number;
}

interface AllowanceCategory { id: string; name: string; }
interface RateWorkType { id: string; name: string; }

type SalaryTab = 'daily' | 'ratework';

interface EmployeeInlineEntryProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}

export function EmployeeInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction, editingTransaction, onCancelEdit,
}: EmployeeInlineEntryProps) {
  const [activeTab, setActiveTab] = useState<SalaryTab>('daily');
  const [allEmployees, setAllEmployees] = useState<EmployeeResult[]>([]);
  const [allowanceCategories, setAllowanceCategories] = useState<AllowanceCategory[]>([]);
  const [rateWorkTypes, setRateWorkTypes] = useState<RateWorkType[]>([]);
  const [saving, setSaving] = useState(false);
  const { selectableMethods } = usePaymentMethods();

  // Employee selection popup
  const [showEmpPopup, setShowEmpPopup] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  // Daily salary state
  const [dailyEmployeeId, setDailyEmployeeId] = useState('');
  const [dailyAttendance, setDailyAttendance] = useState(true);
  const [dailyAmount, setDailyAmount] = useState('');
  const [selectedAllowances, setSelectedAllowances] = useState<string[]>([]);
  const [allowanceAmounts, setAllowanceAmounts] = useState<Record<string, string>>({});
  const [dailyPayments, setDailyPayments] = useState<PaymentEntry[]>([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
  const [dailyRunningDue, setDailyRunningDue] = useState(0);

  // Rate work state
  const [rwEmployeeId, setRwEmployeeId] = useState('');
  const [rwTypeId, setRwTypeId] = useState('');
  const [rwAmount, setRwAmount] = useState('');
  const [rwPayments, setRwPayments] = useState<PaymentEntry[]>([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
  const [rwRunningDue, setRwRunningDue] = useState(0);

  // Which popup is for
  const [popupFor, setPopupFor] = useState<'daily' | 'ratework'>('daily');

  const employeeTransactions = transactions.filter(t => t.section === 'employee');
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      const [empRes, allowRes, rateRes] = await Promise.all([
        supabase.from('employees').select('id, name, advance_balance, salary').order('name'),
        supabase.from('allowance_categories').select('id, name').order('name'),
        supabase.from('rate_work_types').select('id, name').order('name'),
      ]);
      setAllEmployees((empRes.data || []).map(e => ({ id: e.id, name: e.name, advance_balance: Number(e.advance_balance), salary: Number(e.salary) })));
      setAllowanceCategories(allowRes.data || []);
      setRateWorkTypes(rateRes.data || []);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const empIds = [...new Set(employeeTransactions.map(t => t.employeeId).filter(Boolean))];
    if (empIds.length === 0) return;
    supabase.from('employees').select('id, name').in('id', empIds as string[]).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach(e => { map[e.id] = e.name; });
      setEmployeeNames(map);
    });
  }, [transactions]);

  // Calculate running due for daily salary up to selectedDate
  useEffect(() => {
    if (!dailyEmployeeId) { setDailyRunningDue(0); return; }
    calculateRunningDue(dailyEmployeeId, 'daily');
  }, [dailyEmployeeId, selectedDate, transactions]);

  // Calculate running due for rate work up to selectedDate
  useEffect(() => {
    if (!rwEmployeeId) { setRwRunningDue(0); return; }
    calculateRunningDue(rwEmployeeId, 'ratework');
  }, [rwEmployeeId, selectedDate, transactions]);

  const calculateRunningDue = async (empId: string, type: 'daily' | 'ratework') => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const { data: allTxns } = await supabase.from('transactions')
      .select('amount, payments, type, reference')
      .eq('employee_id', empId)
      .eq('section', 'employee')
      .lte('date', dateStr);

    if (!allTxns) { type === 'daily' ? setDailyRunningDue(0) : setRwRunningDue(0); return; }

    const getTotalPaid = (txns: any[]) => txns.reduce((s, t) => {
      const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
      return s + payments.reduce((ps: number, p: any) => ps + Number(p.amount || 0), 0);
    }, 0);

    if (type === 'daily') {
      // Daily salary due = (salary + allowance amounts) - (inline payments) - (payment transactions for present/previous)
      const salaryTxns = allTxns.filter(t => t.type === 'salary' || t.type === 'attendance' || t.type === 'allowance');
      const totalEarned = salaryTxns.reduce((s, t) => s + Number(t.amount), 0);
      const inlinePaid = getTotalPaid(salaryTxns);
      const paymentTxns = allTxns.filter(t => t.type === 'payment' && t.reference !== 'ratework' && t.reference !== 'advance');
      const paymentPaid = getTotalPaid(paymentTxns);
      setDailyRunningDue(Math.max(0, totalEarned - inlinePaid - paymentPaid));
    } else {
      // Rate work due = rate work amounts - inline paid - rate work payments
      const rwTxns = allTxns.filter(t => t.type === 'rate_work');
      const totalEarned = rwTxns.reduce((s, t) => s + Number(t.amount), 0);
      const inlinePaid = getTotalPaid(rwTxns);
      const paymentTxns = allTxns.filter(t => t.type === 'payment' && t.reference === 'ratework');
      const paymentPaid = getTotalPaid(paymentTxns);
      setRwRunningDue(Math.max(0, totalEarned - inlinePaid - paymentPaid));
    }
  };

  // Auto-fill salary when employee selected
  useEffect(() => {
    if (dailyEmployeeId) {
      const emp = allEmployees.find(e => e.id === dailyEmployeeId);
      if (emp) setDailyAmount(emp.salary.toString());
    }
  }, [dailyEmployeeId, allEmployees]);

  const openEmployeePopup = (forTab: 'daily' | 'ratework') => {
    setPopupFor(forTab);
    setEmpSearch('');
    setShowEmpPopup(true);
  };

  const selectEmployee = (emp: EmployeeResult) => {
    if (popupFor === 'daily') {
      setDailyEmployeeId(emp.id);
      setDailyAmount(emp.salary.toString());
      setDailyAttendance(true);
      setSelectedAllowances([]);
      setAllowanceAmounts({});
      setDailyPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    } else {
      setRwEmployeeId(emp.id);
      setRwAmount('');
      setRwTypeId('');
      setRwPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    }
    setShowEmpPopup(false);
  };

  const filteredEmps = allEmployees.filter(e =>
    e.name.toLowerCase().includes(empSearch.toLowerCase())
  );

  const toggleAllowance = (id: string) => {
    setSelectedAllowances(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const totalAllowanceAmount = selectedAllowances.reduce((s, id) => s + (parseFloat(allowanceAmounts[id] || '0') || 0), 0);
  const dailySalaryNum = parseFloat(dailyAmount) || 0;
  const totalDailyAmount = (dailyAttendance ? dailySalaryNum : 0) + totalAllowanceAmount;

  const saveDailySalary = async () => {
    if (!dailyEmployeeId) { toast.error('Select an employee'); return; }
    if (!dailyAttendance && selectedAllowances.length === 0) { toast.error('Mark attendance or add allowance'); return; }

    setSaving(true);
    try {
      // Save attendance if present
      if (dailyAttendance) {
        const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
          date: selectedDate,
          section: 'employee' as TransactionSection,
          type: 'salary',
          amount: dailySalaryNum,
          payments: dailyPayments.filter(p => p.amount > 0),
          employeeId: dailyEmployeeId,
          billNumber: await generateDailyBillNumber('EM', selectedDate),
        };
        await onSave(txn);
      }

      // Save each allowance as separate transaction
      for (const alId of selectedAllowances) {
        const alAmt = parseFloat(allowanceAmounts[alId] || '0') || 0;
        if (alAmt <= 0) continue;
        const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
          date: selectedDate,
          section: 'employee' as TransactionSection,
          type: 'allowance',
          amount: alAmt,
          payments: !dailyAttendance ? dailyPayments.filter(p => p.amount > 0) : [],
          employeeId: dailyEmployeeId,
          billNumber: await generateDailyBillNumber('EA', selectedDate),
          allowanceCategoryId: alId,
          reference: alId,
        };
        await onSave(txn);
      }

      toast.success('Daily salary saved');
      // Reset
      setDailyEmployeeId('');
      setDailyAttendance(true);
      setDailyAmount('');
      setSelectedAllowances([]);
      setAllowanceAmounts({});
      setDailyPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    } catch (err) {
      toast.error('Error saving');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const saveDailyPayment = async () => {
    if (!dailyEmployeeId) { toast.error('Select an employee'); return; }
    const totalPay = dailyPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPay <= 0) { toast.error('Enter payment amount'); return; }

    setSaving(true);
    try {
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'payment',
        amount: 0,
        payments: dailyPayments.filter(p => p.amount > 0),
        employeeId: dailyEmployeeId,
        billNumber: await generateDailyBillNumber('EP', selectedDate),
        reference: 'present',
      };
      await onSave(txn);
      toast.success('Payment saved');
      setDailyPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    } catch (err) {
      toast.error('Error saving payment');
    } finally {
      setSaving(false);
    }
  };

  const saveRateWork = async () => {
    if (!rwEmployeeId) { toast.error('Select an employee'); return; }
    if (!rwTypeId) { toast.error('Select work type'); return; }
    if (!rwAmount || parseFloat(rwAmount) <= 0) { toast.error('Enter rate'); return; }

    setSaving(true);
    try {
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'rate_work',
        amount: parseFloat(rwAmount),
        payments: rwPayments.filter(p => p.amount > 0),
        employeeId: rwEmployeeId,
        billNumber: await generateDailyBillNumber('RW', selectedDate),
        rateWorkTypeId: rwTypeId,
        reference: rwTypeId,
      };
      await onSave(txn);
      toast.success('Rate work saved');
      setRwEmployeeId('');
      setRwTypeId('');
      setRwAmount('');
      setRwPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    } catch (err) {
      toast.error('Error saving rate work');
    } finally {
      setSaving(false);
    }
  };

  const saveRateWorkPayment = async () => {
    if (!rwEmployeeId) { toast.error('Select an employee'); return; }
    const totalPay = rwPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPay <= 0) { toast.error('Enter payment amount'); return; }

    setSaving(true);
    try {
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'payment',
        amount: 0,
        payments: rwPayments.filter(p => p.amount > 0),
        employeeId: rwEmployeeId,
        billNumber: await generateDailyBillNumber('EP', selectedDate),
        reference: 'ratework',
      };
      await onSave(txn);
      toast.success('Rate work payment saved');
      setRwPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    } catch (err) {
      toast.error('Error saving payment');
    } finally {
      setSaving(false);
    }
  };

  const updateDailyPayment = (i: number, field: 'mode' | 'amount', value: string) => {
    setDailyPayments(prev => prev.map((p, idx) => idx === i
      ? { ...p, [field]: field === 'amount' ? (parseFloat(value) || 0) : value as PaymentMode }
      : p
    ));
  };

  const updateRwPayment = (i: number, field: 'mode' | 'amount', value: string) => {
    setRwPayments(prev => prev.map((p, idx) => idx === i
      ? { ...p, [field]: field === 'amount' ? (parseFloat(value) || 0) : value as PaymentMode }
      : p
    ));
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'salary': case 'attendance': return { label: 'Present', color: 'bg-success/10 text-success' };
      case 'allowance': return { label: 'Allowance', color: 'bg-info/10 text-info' };
      case 'rate_work': return { label: 'Rate Work', color: 'bg-accent/10 text-accent' };
      case 'payment': return { label: 'Payment', color: 'bg-warning/10 text-warning' };
      default: return { label: type, color: 'bg-secondary text-muted-foreground' };
    }
  };

  const getCategoryName = (id: string) => {
    const ac = allowanceCategories.find(c => c.id === id);
    if (ac) return ac.name;
    const rw = rateWorkTypes.find(r => r.id === id);
    if (rw) return rw.name;
    return '';
  };

  const selectedDailyEmp = allEmployees.find(e => e.id === dailyEmployeeId);
  const selectedRwEmp = allEmployees.find(e => e.id === rwEmployeeId);

  const tabs: { id: SalaryTab; label: string; icon: React.ReactNode }[] = [
    { id: 'daily', label: 'Daily Salary', icon: <Users className="w-3 h-3" /> },
    { id: 'ratework', label: 'Rate Work', icon: <Hammer className="w-3 h-3" /> },
  ];

  const renderPaymentRow = (payments: PaymentEntry[], updateFn: (i: number, f: 'mode' | 'amount', v: string) => void, setFn: React.Dispatch<React.SetStateAction<PaymentEntry[]>>) => (
    <div className="space-y-1">
      {payments.map((p, i) => (
        <div key={p.id} className="flex gap-1">
          <Select value={p.mode} onValueChange={v => updateFn(i, 'mode', v)}>
            <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {selectableMethods.map(m => (
                <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" inputMode="numeric" value={p.amount || ''} onChange={e => updateFn(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
          {payments.length > 1 && (
            <button onClick={() => setFn(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
          )}
        </div>
      ))}
      <button onClick={() => setFn(prev => [...prev, { id: uuidv4(), mode: 'upi', amount: 0 }])} className="text-[10px] text-accent hover:underline">+ Add mode</button>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Existing Transactions */}
      {employeeTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {employeeTransactions.map(txn => {
            const empName = txn.employeeId ? employeeNames[txn.employeeId] : undefined;
            const totalPaid = txn.payments.reduce((s, p) => s + p.amount, 0);
            const badge = getTypeBadge(txn.type);
            const refName = txn.reference ? getCategoryName(txn.reference) : '';
            return (
              <div key={txn.id} className="px-2 py-2 hover:bg-secondary/20 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", badge.color)}>{badge.label}</span>
                  <span className="font-medium truncate flex-1">{empName || txn.employeeName || '-'}</span>
                  {refName && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{refName}</span>}
                  <span className="font-semibold shrink-0">{txn.amount > 0 ? formatINR(txn.amount) : ''}</span>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => onEditTransaction(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => onDeleteTransaction(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                {totalPaid > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-4 text-[10px]">
                    {txn.payments.filter(p => p.amount > 0).map((p, pi) => (
                      <span key={pi} className={cn(
                        p.mode === 'cash' ? 'text-success' : p.mode === 'upi' ? 'text-info' : 'text-muted-foreground'
                      )}>
                        {p.mode === 'cash' ? '💵' : p.mode === 'upi' ? '📱' : '💳'}{formatINR(p.amount)}
                      </span>
                    ))}
                    <span className="text-muted-foreground">Paid:{formatINR(totalPaid)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab Navigation - 2 toggles */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
              activeTab === tab.id ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
            )}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* DAILY SALARY TAB */}
      {activeTab === 'daily' && (
        <div className="border rounded-lg p-3 space-y-3 border-accent/30 bg-accent/5">
          <span className="text-xs font-semibold text-accent">Daily Salary</span>

          {/* Employee Selection */}
          <button onClick={() => openEmployeePopup('daily')}
            className="w-full h-9 border border-input rounded-lg px-3 text-left text-xs bg-background flex items-center justify-between">
            <span className={selectedDailyEmp ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {selectedDailyEmp ? selectedDailyEmp.name : 'Select Employee...'}
            </span>
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {dailyEmployeeId && (
            <>
              {/* Attendance + Amount row */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Checkbox checked={dailyAttendance} onCheckedChange={(c) => setDailyAttendance(!!c)} id="attendance" />
                  <label htmlFor="attendance" className="text-xs font-medium cursor-pointer">Present</label>
                </div>
                <Input type="number" inputMode="numeric" value={dailyAttendance ? dailyAmount : ''} onChange={e => setDailyAmount(e.target.value)}
                  disabled={!dailyAttendance} placeholder="Day salary" className="h-8 text-xs flex-1" />
              </div>

              {/* Allowance Selection (multiple) */}
              {allowanceCategories.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Allowances</span>
                  <div className="space-y-1">
                    {allowanceCategories.map(al => (
                      <div key={al.id} className="flex items-center gap-2">
                        <Checkbox checked={selectedAllowances.includes(al.id)} onCheckedChange={() => toggleAllowance(al.id)} id={`al-${al.id}`} />
                        <label htmlFor={`al-${al.id}`} className="text-xs cursor-pointer flex-1">{al.name}</label>
                        {selectedAllowances.includes(al.id) && (
                          <Input type="number" inputMode="numeric" value={allowanceAmounts[al.id] || ''}
                            onChange={e => setAllowanceAmounts(prev => ({ ...prev, [al.id]: e.target.value }))}
                            placeholder="₹0" className="h-7 text-xs w-24" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center bg-secondary/50 rounded-lg px-3 py-1.5">
                <span className="text-xs text-muted-foreground">Total Amount</span>
                <span className="text-sm font-bold text-foreground">{formatINR(totalDailyAmount)}</span>
              </div>

              {/* Running Due (up to selected date) */}
              <div className={cn("rounded-lg px-3 py-2 flex justify-between items-center",
                dailyRunningDue > 0 ? "bg-destructive/10 border border-destructive/30" : "bg-success/10 border border-success/30"
              )}>
                <span className="text-xs font-medium">{dailyRunningDue > 0 ? 'Running Due' : 'No Due'}</span>
                <span className={cn("text-sm font-bold", dailyRunningDue > 0 ? "text-destructive" : "text-success")}>
                  {formatINR(dailyRunningDue)}
                </span>
              </div>

              {/* Payment Modes */}
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-medium">Payment</span>
                {renderPaymentRow(dailyPayments, updateDailyPayment, setDailyPayments)}
              </div>

              {/* Save Buttons */}
              <div className="flex gap-2">
                <Button onClick={saveDailySalary} disabled={saving} size="sm" className="flex-1 h-8 text-xs gap-1">
                  <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Entry'}
                </Button>
                {dailyRunningDue > 0 && (
                  <Button onClick={saveDailyPayment} disabled={saving} size="sm" variant="outline" className="h-8 text-xs gap-1">
                    Pay Due
                  </Button>
                )}
              </div>

              {/* After payment, show updated due */}
              {dailyPayments.reduce((s, p) => s + p.amount, 0) > 0 && (
                <div className="text-[10px] text-muted-foreground text-center">
                  After payment: {formatINR(Math.max(0, dailyRunningDue + totalDailyAmount - dailyPayments.reduce((s, p) => s + p.amount, 0)))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* RATE WORK TAB */}
      {activeTab === 'ratework' && (
        <div className="border rounded-lg p-3 space-y-3 border-accent/30 bg-accent/5">
          <span className="text-xs font-semibold text-accent">Rate Work</span>

          {/* Employee Selection */}
          <button onClick={() => openEmployeePopup('ratework')}
            className="w-full h-9 border border-input rounded-lg px-3 text-left text-xs bg-background flex items-center justify-between">
            <span className={selectedRwEmp ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {selectedRwEmp ? selectedRwEmp.name : 'Select Employee...'}
            </span>
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {rwEmployeeId && (
            <>
              {/* Work Type */}
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">Work Type</label>
                <Select value={rwTypeId} onValueChange={setRwTypeId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    {rateWorkTypes.map(rw => (
                      <SelectItem key={rw.id} value={rw.id} className="text-xs">{rw.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">Rate Amount</label>
                <Input type="number" inputMode="numeric" value={rwAmount} onChange={e => setRwAmount(e.target.value)} placeholder="₹0" className="h-8 text-xs" />
              </div>

              {/* Running Due */}
              <div className={cn("rounded-lg px-3 py-2 flex justify-between items-center",
                rwRunningDue > 0 ? "bg-destructive/10 border border-destructive/30" : "bg-success/10 border border-success/30"
              )}>
                <span className="text-xs font-medium">{rwRunningDue > 0 ? 'Rate Work Due' : 'No Due'}</span>
                <span className={cn("text-sm font-bold", rwRunningDue > 0 ? "text-destructive" : "text-success")}>
                  {formatINR(rwRunningDue)}
                </span>
              </div>

              {/* Payment */}
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-medium">Payment</span>
                {renderPaymentRow(rwPayments, updateRwPayment, setRwPayments)}
              </div>

              {/* Save Buttons */}
              <div className="flex gap-2">
                <Button onClick={saveRateWork} disabled={saving} size="sm" className="flex-1 h-8 text-xs gap-1">
                  <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Rate Work'}
                </Button>
                {rwRunningDue > 0 && (
                  <Button onClick={saveRateWorkPayment} disabled={saving} size="sm" variant="outline" className="h-8 text-xs gap-1">
                    Pay Due
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Employee Search Popup */}
      <Dialog open={showEmpPopup} onOpenChange={setShowEmpPopup}>
        <DialogContent className="max-w-sm max-h-[60vh] p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm">Select Employee</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search..." className="h-8 pl-8 text-xs" autoFocus />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[40vh] px-2 pb-3">
            {filteredEmps.map(emp => (
              <button key={emp.id} onClick={() => selectEmployee(emp)}
                className="w-full px-3 py-2.5 text-left hover:bg-secondary/50 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{emp.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">₹{emp.salary}/day</span>
                </div>
                {emp.advance_balance > 0 && (
                  <span className="text-[10px] text-warning font-medium">Adv: {formatINR(emp.advance_balance)}</span>
                )}
              </button>
            ))}
            {filteredEmps.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">No employees found</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
