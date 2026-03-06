import { useState, useEffect } from 'react';
import { X, Wallet, Receipt, ArrowUpRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { PaymentEntry, PaymentMode } from '@/types';

interface ExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedDate: Date;
}

const expenseTypes = [
  { value: 'other_expenses', label: 'Other Expenses' },
  { value: 'vehicle_expenses', label: 'Vehicle Expenses' },
  { value: 'workshop_expenses', label: 'Workshop Expenses' },
];

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
];

export function ExpenseSheet({ isOpen, onClose, onSuccess, selectedDate }: ExpenseSheetProps) {
  const [expenseType, setExpenseType] = useState('other_expenses');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);

  const amountNum = parseFloat(amount) || 0;

  const handleSave = async () => {
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
        .like('bill_number', 'EX%')
        .order('created_at', { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (lastTx && lastTx.length > 0 && lastTx[0].bill_number) {
        const lastNum = parseInt(lastTx[0].bill_number.replace('EX', ''), 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      const billNumber = `EX${nextNum.toString().padStart(4, '0')}`;

      const payments: PaymentEntry[] = [{ id: uuidv4(), mode: paymentMode, amount: amountNum }];

      // Create transaction
      const { error } = await supabase.from('transactions').insert({
        id: uuidv4(),
        date: selectedDate.toISOString().split('T')[0],
        section: 'expenses',
        type: expenseType,
        amount: amountNum,
        payments: payments as any,
        bill_number: billNumber,
        reference: reference || null,
      });

      if (error) throw error;

      const typeLabel = expenseTypes.find(t => t.value === expenseType)?.label || 'Expense';
      toast.success(`${typeLabel} of ₹${amountNum.toLocaleString('en-IN')} recorded`);
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setExpenseType('other_expenses');
    setAmount('');
    setPaymentMode('cash');
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
      <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-destructive" />
                Add Expense
              </SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="px-6 py-4 space-y-5">
            {/* Expense Type */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Expense Type
              </label>
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger className="input-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {expenseTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {/* Payment Mode - Simple Selection */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {paymentModes.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setPaymentMode(mode.value)}
                    className={cn(
                      "py-3 rounded-xl border text-sm font-medium transition-all",
                      paymentMode === mode.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Description / Reference
              </label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., Fuel, Repairs, Stationery"
              />
            </div>

            {/* Summary */}
            {amountNum > 0 && (
              <div className="bg-destructive/10 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {expenseTypes.find(t => t.value === expenseType)?.label}
                  </span>
                  <span className="text-lg font-bold text-destructive">
                    {formatCurrency(amountNum)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Paid via {paymentModes.find(m => m.value === paymentMode)?.label}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={loading || amountNum <= 0}
              className="w-full py-6 text-lg gap-2 bg-destructive hover:bg-destructive/90"
            >
              <ArrowUpRight className="w-5 h-5" />
              {loading ? 'Saving...' : 'Record Expense'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
