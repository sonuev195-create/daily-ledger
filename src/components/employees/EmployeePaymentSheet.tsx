import { useState, useEffect } from 'react';
import { X, Users, Tag, Banknote, Wallet, ArrowUpRight, Calculator } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { PaymentEntry, PaymentMode } from '@/types';

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  salary: number;
  advance_balance: number;
}

interface SalaryCategory {
  id: string;
  name: string;
  description: string | null;
}

interface EmployeePaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedDate: Date;
}

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
];

export function EmployeePaymentSheet({ isOpen, onClose, onSuccess, selectedDate }: EmployeePaymentSheetProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<SalaryCategory[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: uuidv4(), mode: 'cash', amount: 0 },
  ]);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
      fetchCategories();
    }
  }, [isOpen]);

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').order('name');
    setEmployees(data || []);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('salary_categories').select('*').order('name');
    setCategories(data || []);
    if (data && data.length > 0 && !selectedCategory) {
      setSelectedCategory(data[0].id);
    }
  };

  const currentEmployee = employees.find(e => e.id === selectedEmployee);
  const currentCategory = categories.find(c => c.id === selectedCategory);

  // Calculate balances for the selected employee
  const [employeeBalances, setEmployeeBalances] = useState({
    totalBalance: 0,
    previousMonthBalance: 0,
    currentMonthBalance: 0,
    dayBalance: 0,
    rateWorkBalance: 0,
  });

  useEffect(() => {
    if (selectedEmployee) {
      calculateEmployeeBalances(selectedEmployee);
    }
  }, [selectedEmployee]);

  const calculateEmployeeBalances = async (empId: string) => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    // Get all transactions for employee
    const { data: allTx } = await supabase
      .from('transactions')
      .select('*')
      .eq('employee_id', empId);

    // Get rate work category id
    const rateWorkCat = categories.find(c => 
      c.name.toLowerCase().includes('rate') || c.name.toLowerCase().includes('piece')
    );

    let prevMonthBalance = 0;
    let currentMonthBalance = 0;
    let dayBalance = 0;
    let rateWorkBalance = 0;
    let totalBalance = 0;

    if (allTx) {
      allTx.forEach(tx => {
        const txDate = new Date(tx.date);
        totalBalance += tx.amount;

        if (txDate >= startOfPrevMonth && txDate <= endOfPrevMonth) {
          prevMonthBalance += tx.amount;
        }
        if (txDate >= startOfMonth) {
          currentMonthBalance += tx.amount;
        }
        if (txDate.toDateString() === today.toDateString()) {
          dayBalance += tx.amount;
        }
        if (rateWorkCat && tx.salary_category_id === rateWorkCat.id) {
          rateWorkBalance += tx.amount;
        }
      });
    }

    // Get employee's advance balance
    const emp = employees.find(e => e.id === empId);
    
    setEmployeeBalances({
      totalBalance: totalBalance,
      previousMonthBalance: prevMonthBalance,
      currentMonthBalance: currentMonthBalance,
      dayBalance: dayBalance,
      rateWorkBalance: rateWorkBalance,
    });
  };

  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
  const amountNum = parseFloat(amount) || 0;

  const updatePayment = (id: string, field: 'mode' | 'amount', value: any) => {
    setPayments(payments.map(p =>
      p.id === id ? { ...p, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : p
    ));
  };

  const addPaymentMode = () => {
    setPayments([...payments, { id: uuidv4(), mode: 'upi', amount: 0 }]);
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  // Auto-fill amount to payments
  useEffect(() => {
    if (amountNum > 0 && payments.length === 1) {
      setPayments([{ ...payments[0], amount: amountNum }]);
    }
  }, [amount]);

  const handleSave = async () => {
    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }
    if (!selectedCategory) {
      toast.error('Please select a category');
      return;
    }
    if (amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      // Generate bill number
      const { data: lastTx } = await supabase
        .from('transactions')
        .select('bill_number')
        .like('bill_number', 'EM%')
        .order('created_at', { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (lastTx && lastTx.length > 0 && lastTx[0].bill_number) {
        const lastNum = parseInt(lastTx[0].bill_number.replace('EM', ''), 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      const billNumber = `EM${nextNum.toString().padStart(4, '0')}`;

      // Create transaction
      const { error } = await supabase.from('transactions').insert({
        id: uuidv4(),
        date: selectedDate.toISOString().split('T')[0],
        section: 'employee',
        type: 'salary',
        amount: amountNum,
        payments: payments.filter(p => p.amount > 0) as any,
        bill_number: billNumber,
        employee_id: selectedEmployee,
        salary_category_id: selectedCategory,
        reference: reference || null,
      });

      if (error) throw error;

      // Update employee advance balance (reduce if paying advance due)
      const cat = categories.find(c => c.id === selectedCategory);
      if (cat && (cat.name.toLowerCase().includes('advance') || cat.name.toLowerCase().includes('previous'))) {
        await supabase
          .from('employees')
          .update({ 
            advance_balance: Math.max(0, (currentEmployee?.advance_balance || 0) - amountNum),
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedEmployee);
      }

      toast.success(`Payment recorded for ${currentEmployee?.name}`);
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving payment:', error);
      toast.error('Failed to save payment');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedEmployee('');
    setAmount('');
    setPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    setReference('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold flex items-center gap-2">
                <Banknote className="w-5 h-5 text-accent" />
                Employee Payment
              </SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Employee Selection */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Select Employee <span className="text-destructive">*</span>
              </label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="input-field">
                  <SelectValue placeholder="Choose employee" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex items-center gap-2">
                        <span>{emp.name}</span>
                        {emp.role && <span className="text-xs text-muted-foreground">({emp.role})</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Balance Ledger */}
            {currentEmployee && (
              <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-accent" />
                  {currentEmployee.name}'s Balance Ledger
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Total Paid</p>
                    <p className="font-semibold text-foreground">{formatCurrency(employeeBalances.totalBalance)}</p>
                  </div>
                  <div className={cn("rounded-lg p-2", currentEmployee.advance_balance > 0 ? "bg-warning/10" : "bg-background")}>
                    <p className="text-xs text-muted-foreground">Advance Balance</p>
                    <p className={cn("font-semibold", currentEmployee.advance_balance > 0 ? "text-warning" : "text-foreground")}>
                      {formatCurrency(currentEmployee.advance_balance)}
                    </p>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Previous Month</p>
                    <p className="font-semibold text-foreground">{formatCurrency(employeeBalances.previousMonthBalance)}</p>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Current Month</p>
                    <p className="font-semibold text-foreground">{formatCurrency(employeeBalances.currentMonthBalance)}</p>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Today's Payment</p>
                    <p className="font-semibold text-foreground">{formatCurrency(employeeBalances.dayBalance)}</p>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Rate Work Total</p>
                    <p className="font-semibold text-foreground">{formatCurrency(employeeBalances.rateWorkBalance)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Monthly Salary:</span>
                  <span className="font-medium text-foreground">{formatCurrency(currentEmployee.salary)}</span>
                </div>
              </div>
            )}

            {/* Category Selection */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Salary Category <span className="text-destructive">*</span>
              </label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="input-field">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div>
                        <span>{cat.name}</span>
                        {cat.description && (
                          <span className="text-xs text-muted-foreground ml-2">- {cat.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentCategory && (
                <p className="text-xs text-accent mt-1">
                  {currentCategory.name}: This will be added to the category-wise balance
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Amount <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="input-field pl-8 text-xl font-semibold"
                />
              </div>
            </div>

            {/* Payment Modes */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Payment Mode
              </label>
              <div className="space-y-2">
                {payments.map((payment, index) => (
                  <div key={payment.id} className="flex items-center gap-2">
                    <Select
                      value={payment.mode}
                      onValueChange={(val) => updatePayment(payment.id, 'mode', val)}
                    >
                      <SelectTrigger className="w-24 input-field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {paymentModes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                      <input
                        type="number"
                        value={payment.amount || ''}
                        onChange={(e) => updatePayment(payment.id, 'amount', e.target.value)}
                        placeholder="0"
                        className="input-field pl-7"
                      />
                    </div>
                    {payments.length > 1 && (
                      <button
                        onClick={() => removePayment(payment.id)}
                        className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addPaymentMode}
                  className="text-sm text-accent hover:underline"
                >
                  + Add payment mode
                </button>
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Reference (Optional)
              </label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., Weekly payment, Bonus, etc."
              />
            </div>

            {/* Summary */}
            <div className="bg-accent/10 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-medium">{formatCurrency(amountNum)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Total:</span>
                <span className="font-medium">{formatCurrency(totalPayments)}</span>
              </div>
              {amountNum !== totalPayments && totalPayments > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span>Difference:</span>
                  <span className="font-medium">{formatCurrency(Math.abs(amountNum - totalPayments))}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={loading || !selectedEmployee || !selectedCategory || amountNum <= 0}
              className="w-full py-6 text-lg gap-2"
            >
              <ArrowUpRight className="w-5 h-5" />
              {loading ? 'Saving...' : `Pay ${currentEmployee?.name || 'Employee'}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
