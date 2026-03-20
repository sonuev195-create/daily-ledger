import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, X, Pencil, Trash2, Users, Gift, Hammer, CreditCard } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

interface EmployeeResult {
  id: string;
  name: string;
  advance_balance: number;
  salary: number;
}

interface AllowanceCategory {
  id: string;
  name: string;
}

interface RateWorkType {
  id: string;
  name: string;
}

type EmployeeTab = 'attendance' | 'allowance' | 'ratework' | 'payment';
type PaymentDueType = 'present' | 'previous' | 'ratework';

interface AttendanceRow {
  employeeId: string;
  employeeName: string;
  present: boolean;
  daySalary: string;
  rateWorkTypeId: string;
  saved: boolean;
  transactionId?: string;
}

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
  const [activeTab, setActiveTab] = useState<EmployeeTab>('attendance');
  const [employees, setEmployees] = useState<EmployeeResult[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmployeeResult[]>([]);
  const [allowanceCategories, setAllowanceCategories] = useState<AllowanceCategory[]>([]);
  const [rateWorkTypes, setRateWorkTypes] = useState<RateWorkType[]>([]);
  const [saving, setSaving] = useState(false);
  const { selectableMethods } = usePaymentMethods();

  // Attendance state
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);

  // Allowance state
  const [allowanceEmployeeId, setAllowanceEmployeeId] = useState('');
  const [allowanceCategoryId, setAllowanceCategoryId] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');

  // Rate work state
  const [rateWorkEmployeeId, setRateWorkEmployeeId] = useState('');
  const [rateWorkTypeId, setRateWorkTypeId] = useState('');
  const [rateWorkAmount, setRateWorkAmount] = useState('');

  // Payment state
  const [paymentEmployeeId, setPaymentEmployeeId] = useState('');
  const [paymentDueType, setPaymentDueType] = useState<PaymentDueType>('present');
  const [paymentPayments, setPaymentPayments] = useState<PaymentEntry[]>([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
  const [showAdvanceToggle, setShowAdvanceToggle] = useState(false);
  const [employeeDues, setEmployeeDues] = useState<{
    currentMonthDue: number;
    previousDues: number;
    rateWorkDue: number;
    totalDue: number;
    rateWorkBreakdown: { typeName: string; amount: number }[];
  } | null>(null);

  const employeeTransactions = transactions.filter(t => t.section === 'employee');
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

  const currentMonthName = format(selectedDate, 'MMM');
  const previousMonthName = format(subMonths(selectedDate, 1), 'MMM');

  useEffect(() => {
    const fetchData = async () => {
      const [empRes, allowRes, rateRes] = await Promise.all([
        supabase.from('employees').select('id, name, advance_balance, salary').order('name'),
        supabase.from('allowance_categories').select('id, name').order('name'),
        supabase.from('rate_work_types').select('id, name').order('name'),
      ]);
      const emps = (empRes.data || []).map(e => ({ id: e.id, name: e.name, advance_balance: Number(e.advance_balance), salary: Number(e.salary) }));
      setAllEmployees(emps);
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

  // Build attendance rows - rate_work entries should NOT count as present
  useEffect(() => {
    if (allEmployees.length === 0) return;
    // Only salary/attendance type counts as present, NOT rate_work
    const todayAttendanceTxns = employeeTransactions.filter(t => t.type === 'salary' || t.type === 'attendance');
    const todayRateWorkTxns = employeeTransactions.filter(t => t.type === 'rate_work');

    const rows: AttendanceRow[] = allEmployees.map(emp => {
      const existingTxn = todayAttendanceTxns.find(t => t.employeeId === emp.id);
      const hasRateWork = todayRateWorkTxns.some(t => t.employeeId === emp.id);
      return {
        employeeId: emp.id,
        employeeName: emp.name,
        // Present only if has attendance/salary txn, rate_work alone does NOT mean present
        present: !!existingTxn,
        daySalary: existingTxn ? existingTxn.amount.toString() : emp.salary.toString(),
        rateWorkTypeId: existingTxn?.reference || '',
        saved: !!existingTxn,
        transactionId: existingTxn?.id,
      };
    });
    setAttendanceRows(rows);
  }, [allEmployees, transactions]);

  // Calculate dues when payment employee selected
  useEffect(() => {
    if (!paymentEmployeeId) { setEmployeeDues(null); return; }
    (async () => {
      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);

      const { data: currentMonthData } = await supabase.from('transactions')
        .select('amount, payments, type, rate_work_type_id, reference')
        .eq('employee_id', paymentEmployeeId)
        .eq('section', 'employee')
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'));

      const { data: prevData } = await supabase.from('transactions')
        .select('amount, payments, type, rate_work_type_id, reference')
        .eq('employee_id', paymentEmployeeId)
        .eq('section', 'employee')
        .lt('date', format(monthStart, 'yyyy-MM-dd'));

      const { data: rwTypes } = await supabase.from('rate_work_types').select('id, name');
      const rwMap = new Map((rwTypes || []).map(r => [r.id, r.name]));

      const getTotalPaid = (txns: any[]) => txns.reduce((s, t) => {
        const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
        return s + payments.reduce((ps: number, p: any) => ps + Number(p.amount || 0), 0);
      }, 0);

      const getTotalAmount = (txns: any[]) => txns.reduce((s, t) => s + Number(t.amount), 0);

      // Current month: salary + allowance (exclude rate_work and payments)
      const currentSalaryAllowance = (currentMonthData || []).filter(t => t.type !== 'rate_work' && t.type !== 'payment');
      const currentMonthSalary = getTotalAmount(currentSalaryAllowance);
      const currentMonthInlinePaid = getTotalPaid(currentSalaryAllowance);
      const currentPaymentTxns = (currentMonthData || []).filter(t => t.type === 'payment' && t.reference !== 'ratework');
      const currentPaymentPaid = currentPaymentTxns.reduce((s, t) => {
        const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
        return s + payments.reduce((ps: number, p: any) => ps + Number(p.amount || 0), 0);
      }, 0);
      const currentMonthDue = Math.max(0, currentMonthSalary - currentMonthInlinePaid - currentPaymentPaid);

      // Previous dues: salary + allowance before this month (exclude rate_work AND payment types)
      const prevSalaryAllowance = (prevData || []).filter(t => t.type !== 'rate_work' && t.type !== 'payment');
      const prevSalary = getTotalAmount(prevSalaryAllowance);
      const prevInlinePaid = getTotalPaid(prevSalaryAllowance);
      const prevPaymentTxns = (prevData || []).filter(t => t.type === 'payment' && t.reference !== 'ratework');
      const prevPaymentPaid = prevPaymentTxns.reduce((s, t) => {
        const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
        return s + payments.reduce((ps: number, p: any) => ps + Number(p.amount || 0), 0);
      }, 0);
      const previousDues = Math.max(0, prevSalary - prevInlinePaid - prevPaymentPaid);

      // Rate work due: all rate_work across all time
      const allRateWork = [...(currentMonthData || []), ...(prevData || [])].filter(t => t.type === 'rate_work');
      const rateWorkByType: Record<string, number> = {};
      allRateWork.forEach(t => {
        const typeId = t.rate_work_type_id || 'other';
        rateWorkByType[typeId] = (rateWorkByType[typeId] || 0) + Number(t.amount);
        const payments = Array.isArray(t.payments) ? t.payments as any[] : [];
        const paid = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        rateWorkByType[typeId] -= paid;
      });
      const rateWorkBreakdown = Object.entries(rateWorkByType)
        .filter(([, amt]) => amt > 0)
        .map(([typeId, amount]) => ({ typeName: rwMap.get(typeId) || 'Other', amount }));
      const rateWorkDue = rateWorkBreakdown.reduce((s, r) => s + r.amount, 0);

      setEmployeeDues({
        currentMonthDue,
        previousDues,
        rateWorkDue,
        totalDue: currentMonthDue + previousDues + rateWorkDue,
        rateWorkBreakdown,
      });
    })();
  }, [paymentEmployeeId, selectedDate, transactions]);

  const toggleAttendance = (index: number) => {
    setAttendanceRows(prev => prev.map((r, i) => i === index ? { ...r, present: !r.present } : r));
  };

  const updateAttendanceSalary = (index: number, value: string) => {
    setAttendanceRows(prev => prev.map((r, i) => i === index ? { ...r, daySalary: value } : r));
  };

  const updateAttendanceRateWork = (index: number, value: string) => {
    setAttendanceRows(prev => prev.map((r, i) => i === index ? { ...r, rateWorkTypeId: value } : r));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const presentRows = attendanceRows.filter(r => r.present && !r.saved);
      const removedRows = attendanceRows.filter(r => !r.present && r.saved && r.transactionId);

      for (const row of presentRows) {
        const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
          date: selectedDate,
          section: 'employee' as TransactionSection,
          type: 'salary',
          amount: parseFloat(row.daySalary) || 0,
          payments: [],
          employeeId: row.employeeId,
          billNumber: `EM${Date.now().toString().slice(-6)}`,
          reference: row.rateWorkTypeId || undefined,
        };
        await onSave(txn);
      }

      for (const row of removedRows) {
        if (row.transactionId) {
          await onDeleteTransaction(row.transactionId);
        }
      }

      toast.success(`Attendance saved (${presentRows.length} present)`);
    } catch (err) {
      toast.error('Error saving attendance');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const saveAllowance = async () => {
    if (!allowanceEmployeeId) { toast.error('Select an employee'); return; }
    if (!allowanceCategoryId) { toast.error('Select a category'); return; }
    if (!allowanceAmount || parseFloat(allowanceAmount) <= 0) { toast.error('Enter amount'); return; }

    setSaving(true);
    try {
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'allowance',
        amount: parseFloat(allowanceAmount),
        payments: [],
        employeeId: allowanceEmployeeId,
        billNumber: `EA${Date.now().toString().slice(-6)}`,
        allowanceCategoryId: allowanceCategoryId,
        reference: allowanceCategoryId,
      };
      await onSave(txn);
      setAllowanceEmployeeId('');
      setAllowanceCategoryId('');
      setAllowanceAmount('');
      toast.success('Allowance saved');
    } catch (err) {
      toast.error('Error saving allowance');
    } finally {
      setSaving(false);
    }
  };

  const saveRateWork = async () => {
    if (!rateWorkEmployeeId) { toast.error('Select an employee'); return; }
    if (!rateWorkTypeId) { toast.error('Select work type'); return; }
    if (!rateWorkAmount || parseFloat(rateWorkAmount) <= 0) { toast.error('Enter rate'); return; }

    setSaving(true);
    try {
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'rate_work',
        amount: parseFloat(rateWorkAmount),
        payments: [],
        employeeId: rateWorkEmployeeId,
        billNumber: `RW${Date.now().toString().slice(-6)}`,
        rateWorkTypeId: rateWorkTypeId,
        reference: rateWorkTypeId,
      };
      await onSave(txn);
      setRateWorkEmployeeId('');
      setRateWorkTypeId('');
      setRateWorkAmount('');
      toast.success('Rate work saved');
    } catch (err) {
      toast.error('Error saving rate work');
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async () => {
    if (!paymentEmployeeId) { toast.error('Select an employee'); return; }
    const totalPayment = paymentPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPayment <= 0) { toast.error('Enter payment amount'); return; }

    setSaving(true);
    try {
      // Store paymentDueType in reference so report can distinguish
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'payment',
        amount: 0,
        payments: paymentPayments.filter(p => p.amount > 0),
        employeeId: paymentEmployeeId,
        billNumber: `EP${Date.now().toString().slice(-6)}`,
        reference: paymentDueType,
      };
      await onSave(txn);
      setPaymentEmployeeId('');
      setPaymentDueType('present');
      setPaymentPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
      setEmployeeDues(null);
      toast.success('Payment saved');
    } catch (err) {
      toast.error('Error saving payment');
    } finally {
      setSaving(false);
    }
  };

  const saveAdvance = async () => {
    if (!paymentEmployeeId) { toast.error('Select an employee'); return; }
    const totalPayment = paymentPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPayment <= 0) { toast.error('Enter advance amount'); return; }

    setSaving(true);
    try {
      const txn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'employee' as TransactionSection,
        type: 'payment',
        amount: 0,
        payments: paymentPayments.filter(p => p.amount > 0),
        employeeId: paymentEmployeeId,
        billNumber: `EAD${Date.now().toString().slice(-6)}`,
        reference: 'advance',
      };
      await onSave(txn);
      // Update employee advance_balance
      const emp = allEmployees.find(e => e.id === paymentEmployeeId);
      if (emp) {
        await supabase.from('employees').update({
          advance_balance: emp.advance_balance + totalPayment,
        }).eq('id', paymentEmployeeId);
      }
      setPaymentEmployeeId('');
      setPaymentPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
      setShowAdvanceToggle(false);
      toast.success('Advance recorded');
    } catch (err) {
      toast.error('Error saving advance');
    } finally {
      setSaving(false);
    }
  };

  const updatePayment = (i: number, field: 'mode' | 'amount', value: string) => {
    setPaymentPayments(prev => {
      const payments = [...prev];
      if (field === 'amount') payments[i] = { ...payments[i], amount: parseFloat(value) || 0 };
      else payments[i] = { ...payments[i], mode: value as PaymentMode };
      return payments;
    });
  };

  const getCategoryName = (id: string) => {
    const ac = allowanceCategories.find(c => c.id === id);
    if (ac) return ac.name;
    const rw = rateWorkTypes.find(r => r.id === id);
    if (rw) return rw.name;
    return '';
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'salary': case 'attendance': return { label: 'Attendance', color: 'bg-success/10 text-success' };
      case 'allowance': return { label: 'Allowance', color: 'bg-info/10 text-info' };
      case 'rate_work': return { label: 'Rate Work', color: 'bg-accent/10 text-accent' };
      case 'payment': return { label: 'Payment', color: 'bg-warning/10 text-warning' };
      default: return { label: type, color: 'bg-secondary text-muted-foreground' };
    }
  };

  const tabs: { id: EmployeeTab; label: string; icon: React.ReactNode }[] = [
    { id: 'attendance', label: 'Attendance', icon: <Users className="w-3 h-3" /> },
    { id: 'allowance', label: 'Allowance', icon: <Gift className="w-3 h-3" /> },
    { id: 'ratework', label: 'Rate Work', icon: <Hammer className="w-3 h-3" /> },
    { id: 'payment', label: 'Pay & Due', icon: <CreditCard className="w-3 h-3" /> },
  ];

  const dueTypeLabels: { id: PaymentDueType; label: string }[] = [
    { id: 'present', label: `${currentMonthName} Due` },
    { id: 'previous', label: 'Previous Due' },
    { id: 'ratework', label: 'Rate Work Due' },
  ];

  return (
    <div className="space-y-3">
      {/* Existing Transactions Summary */}
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
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-4 text-[10px]">
                  {txn.payments.filter(p => p.amount > 0).map((p, pi) => (
                    <span key={pi} className={cn(
                      p.mode === 'cash' ? 'text-success' : p.mode === 'upi' ? 'text-info' : 'text-muted-foreground'
                    )}>
                      {p.mode === 'cash' ? '💵' : p.mode === 'upi' ? '📱' : '💳'}{formatINR(p.amount)}
                    </span>
                  ))}
                  {totalPaid > 0 && <span className="text-muted-foreground">Paid:{formatINR(totalPaid)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-medium transition-colors flex items-center justify-center gap-1",
              activeTab === tab.id ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="border rounded-lg p-3 space-y-2 border-accent/30 bg-accent/5">

        {/* ATTENDANCE TAB */}
        {activeTab === 'attendance' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-accent">Mark Attendance</span>
              <span className="text-[10px] text-muted-foreground">{attendanceRows.filter(r => r.present).length} / {attendanceRows.length} present</span>
            </div>

            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              <div className="grid grid-cols-12 gap-1 text-[10px] text-muted-foreground font-medium px-1">
                <div className="col-span-1"></div>
                <div className="col-span-4">Employee</div>
                <div className="col-span-3">Day Salary</div>
                <div className="col-span-4">Rate Work</div>
              </div>

              {attendanceRows.map((row, index) => (
                <div key={row.employeeId} className={cn(
                  "grid grid-cols-12 gap-1 items-center px-1 py-1 rounded",
                  row.present ? "bg-success/5" : "bg-secondary/20",
                  row.saved ? "opacity-70" : ""
                )}>
                  <div className="col-span-1">
                    <button
                      onClick={() => toggleAttendance(index)}
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        row.present ? "bg-success border-success text-white" : "border-border hover:border-accent"
                      )}
                    >
                      {row.present && <Check className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="col-span-4 text-xs font-medium truncate">{row.employeeName}</div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={row.present ? row.daySalary : ''}
                      onChange={e => updateAttendanceSalary(index, e.target.value)}
                      disabled={!row.present}
                      placeholder="₹0"
                      className="h-6 text-[10px] px-1"
                    />
                  </div>
                  <div className="col-span-4">
                    <Select
                      value={row.rateWorkTypeId || 'none'}
                      onValueChange={v => updateAttendanceRateWork(index, v === 'none' ? '' : v)}
                      disabled={!row.present}
                    >
                      <SelectTrigger className="h-6 text-[10px] px-1"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">None</SelectItem>
                        {rateWorkTypes.map(rw => (
                          <SelectItem key={rw.id} value={rw.id} className="text-xs">{rw.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={saveAttendance} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
              <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Attendance'}
            </Button>
          </div>
        )}

        {/* ALLOWANCE TAB */}
        {activeTab === 'allowance' && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-accent">Add Allowance</span>

            {employeeTransactions.filter(t => t.type === 'allowance').length > 0 && (
              <div className="text-[10px] text-muted-foreground">
                Today: {employeeTransactions.filter(t => t.type === 'allowance').length} allowance entries
              </div>
            )}

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Employee</label>
              <Select value={allowanceEmployeeId} onValueChange={setAllowanceEmployeeId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {allEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Allowance Type</label>
              <Select value={allowanceCategoryId} onValueChange={setAllowanceCategoryId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {allowanceCategories.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allowanceCategories.length === 0 && (
                <p className="text-[10px] text-warning mt-0.5">Add allowance types in Employee sidebar → Settings</p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
              <Input
                type="number"
                inputMode="numeric"
                value={allowanceAmount}
                onChange={e => setAllowanceAmount(e.target.value)}
                placeholder="₹0"
                className="h-8 text-xs"
              />
            </div>

            <Button onClick={saveAllowance} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
              <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Allowance'}
            </Button>
          </div>
        )}

        {/* RATE WORK TAB */}
        {activeTab === 'ratework' && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-accent">Add Rate Work</span>

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Employee</label>
              <Select value={rateWorkEmployeeId} onValueChange={setRateWorkEmployeeId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {allEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Work Type</label>
              <Select value={rateWorkTypeId} onValueChange={setRateWorkTypeId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select work..." /></SelectTrigger>
                <SelectContent>
                  {rateWorkTypes.map(rw => (
                    <SelectItem key={rw.id} value={rw.id} className="text-xs">{rw.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rateWorkTypes.length === 0 && (
                <p className="text-[10px] text-warning mt-0.5">Add work types in Employee sidebar → Settings</p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Total Rate</label>
              <Input
                type="number"
                inputMode="numeric"
                value={rateWorkAmount}
                onChange={e => setRateWorkAmount(e.target.value)}
                placeholder="₹0"
                className="h-8 text-xs"
              />
            </div>

            <Button onClick={saveRateWork} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
              <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Rate Work'}
            </Button>
          </div>
        )}

        {/* PAYMENT & DUE TAB */}
        {activeTab === 'payment' && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-accent">Payment & Due</span>

            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Employee</label>
              <Select value={paymentEmployeeId} onValueChange={v => {
                setPaymentEmployeeId(v);
                setPaymentDueType('present');
                setPaymentPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
                setShowAdvanceToggle(false);
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {allEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advance Toggle */}
            {paymentEmployeeId && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAdvanceToggle(!showAdvanceToggle)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                    showAdvanceToggle ? "bg-info/20 border-info text-info" : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
                  )}
                >
                  💰 Advance
                  {(() => {
                    const emp = allEmployees.find(e => e.id === paymentEmployeeId);
                    return emp && emp.advance_balance > 0 ? ` (${formatINR(emp.advance_balance)})` : '';
                  })()}
                </button>
              </div>
            )}

            {/* Advance Payment Section */}
            {showAdvanceToggle && paymentEmployeeId && (
              <div className="border border-info/30 rounded-lg p-2 bg-info/5 space-y-2">
                <span className="text-[10px] font-medium text-info">Record Advance Payment</span>
                <div className="space-y-1">
                  {paymentPayments.map((p, i) => (
                    <div key={p.id} className="flex gap-1">
                      <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                        <SelectTrigger className="h-7 text-[10px] w-16"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {selectableMethods.map(m => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={p.amount || ''}
                        onChange={e => updatePayment(i, 'amount', e.target.value)}
                        placeholder="₹0"
                        className="h-7 text-xs flex-1"
                      />
                      {paymentPayments.length > 1 && (
                        <button onClick={() => setPaymentPayments(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setPaymentPayments(prev => [...prev, { id: uuidv4(), mode: 'upi', amount: 0 }])} className="text-[10px] text-accent hover:underline">+ Add mode</button>
                </div>
                <Button onClick={saveAdvance} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
                  <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Advance'}
                </Button>
              </div>
            )}

            {!showAdvanceToggle && employeeDues && (
              <div className="space-y-1.5">
                {/* Current Month Due */}
                <div className={cn(
                  "border rounded-lg p-2 flex justify-between items-center cursor-pointer transition-colors",
                  paymentDueType === 'present' ? "bg-accent/20 border-accent" : "bg-accent/5 border-accent/30"
                )} onClick={() => setPaymentDueType('present')}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full border-2", paymentDueType === 'present' ? "border-accent bg-accent" : "border-muted-foreground")} />
                    <span className="text-xs font-medium text-accent">{currentMonthName} Due</span>
                  </div>
                  <span className="text-xs font-bold text-accent">{formatINR(employeeDues.currentMonthDue)}</span>
                </div>

                {/* Previous Dues */}
                <div className={cn(
                  "border rounded-lg p-2 flex justify-between items-center cursor-pointer transition-colors",
                  paymentDueType === 'previous' ? "bg-warning/20 border-warning" : "bg-warning/5 border-warning/30"
                )} onClick={() => setPaymentDueType('previous')}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full border-2", paymentDueType === 'previous' ? "border-warning bg-warning" : "border-muted-foreground")} />
                    <span className="text-xs font-medium text-warning">Previous Dues (till {previousMonthName})</span>
                  </div>
                  <span className="text-xs font-bold text-warning">{formatINR(employeeDues.previousDues)}</span>
                </div>

                {/* Rate Work Due */}
                {employeeDues.rateWorkDue > 0 && (
                  <div className={cn(
                    "border rounded-lg p-2 cursor-pointer transition-colors",
                    paymentDueType === 'ratework' ? "bg-info/20 border-info" : "bg-info/5 border-info/30"
                  )} onClick={() => setPaymentDueType('ratework')}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-full border-2", paymentDueType === 'ratework' ? "border-info bg-info" : "border-muted-foreground")} />
                        <span className="text-xs font-medium text-info">Rate Work Due</span>
                      </div>
                      <span className="text-xs font-bold text-info">{formatINR(employeeDues.rateWorkDue)}</span>
                    </div>
                    {employeeDues.rateWorkBreakdown.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {employeeDues.rateWorkBreakdown.map((rb, i) => (
                          <div key={i} className="flex justify-between text-[10px] text-info/80 pl-5">
                            <span>{rb.typeName}</span>
                            <span>{formatINR(rb.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Total Due */}
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 flex justify-between items-center">
                  <span className="text-xs font-bold text-destructive">Total Due</span>
                  <span className="text-sm font-bold text-destructive">{formatINR(employeeDues.totalDue)}</span>
                </div>
              </div>
            )}

            {/* Payment Mode */}
            {!showAdvanceToggle && paymentEmployeeId && (
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment for: <span className="font-semibold text-foreground">{dueTypeLabels.find(d => d.id === paymentDueType)?.label}</span></label>
                <div className="space-y-1">
                  {paymentPayments.map((p, i) => (
                    <div key={p.id} className="flex gap-1">
                      <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                        <SelectTrigger className="h-7 text-[10px] w-16"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {selectableMethods.map(m => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={p.amount || ''}
                        onChange={e => updatePayment(i, 'amount', e.target.value)}
                        placeholder="₹0"
                        className="h-7 text-xs flex-1"
                      />
                      {paymentPayments.length > 1 && (
                        <button onClick={() => setPaymentPayments(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setPaymentPayments(prev => [...prev, { id: uuidv4(), mode: 'upi', amount: 0 }])} className="text-[10px] text-accent hover:underline">+ Add mode</button>
                </div>
              </div>
            )}

            {!showAdvanceToggle && paymentEmployeeId && (
              <Button onClick={savePayment} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
                <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Payment'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
