import { useState, useEffect } from 'react';
import { X, Truck, Wallet, ArrowUpRight, Receipt, FileText } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { PaymentEntry, PaymentMode } from '@/types';
import { format } from 'date-fns';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
}

interface SupplierBill {
  id: string;
  bill_number: string;
  total_amount: number;
  created_at: string;
  transaction_id: string;
}

interface SupplierPaymentSheetProps {
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

export function SupplierPaymentSheet({ isOpen, onClose, onSuccess, selectedDate }: SupplierPaymentSheetProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>([]);
  const [amount, setAmount] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: uuidv4(), mode: 'cash', amount: 0 },
  ]);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSuppliers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedSupplier) {
      fetchSupplierBills(selectedSupplier);
    }
  }, [selectedSupplier]);

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
  };

  const fetchSupplierBills = async (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    // Get bills for this supplier
    const { data } = await supabase
      .from('bills')
      .select('id, bill_number, total_amount, created_at, transaction_id')
      .eq('supplier_name', supplier.name)
      .eq('bill_type', 'purchase_bill')
      .order('created_at', { ascending: false })
      .limit(20);

    setSupplierBills(data || []);
  };

  const currentSupplier = suppliers.find(s => s.id === selectedSupplier);

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
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
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
        .like('bill_number', 'PP%')
        .order('created_at', { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (lastTx && lastTx.length > 0 && lastTx[0].bill_number) {
        const lastNum = parseInt(lastTx[0].bill_number.replace('PP', ''), 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      const billNumber = `PP${nextNum.toString().padStart(4, '0')}`;

      // Create transaction
      const { error } = await supabase.from('transactions').insert({
        id: uuidv4(),
        date: selectedDate.toISOString().split('T')[0],
        section: 'purchase',
        type: 'purchase_payment',
        amount: amountNum,
        payments: payments.filter(p => p.amount > 0) as any,
        bill_number: billNumber,
        supplier_id: selectedSupplier,
        supplier_name: currentSupplier?.name || null,
        reference: reference || null,
      });

      if (error) throw error;

      // Update supplier balance (reduce due)
      await supabase
        .from('suppliers')
        .update({ 
          balance: Math.max(0, (currentSupplier?.balance || 0) - amountNum),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSupplier);

      toast.success(`Payment recorded for ${currentSupplier?.name}`);
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
    setSelectedSupplier('');
    setAmount('');
    setPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    setReference('');
    setSupplierBills([]);
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
                <Truck className="w-5 h-5 text-accent" />
                Supplier Payment
              </SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Supplier Selection */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Select Supplier <span className="text-destructive">*</span>
              </label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="input-field">
                  <SelectValue placeholder="Choose supplier" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {suppliers.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      <div className="flex items-center justify-between gap-4">
                        <span>{sup.name}</span>
                        {sup.balance > 0 && (
                          <span className="text-xs text-warning">Due: {formatCurrency(sup.balance)}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Supplier Balance & Due Info */}
            {currentSupplier && (
              <div className={cn(
                "rounded-xl p-4 space-y-3",
                currentSupplier.balance > 0 ? "bg-warning/10" : "bg-success/10"
              )}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{currentSupplier.name}</h4>
                  <span className={cn(
                    "text-lg font-bold",
                    currentSupplier.balance > 0 ? "text-warning" : "text-success"
                  )}>
                    {formatCurrency(currentSupplier.balance)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {currentSupplier.balance > 0 ? 'Amount payable to supplier' : 'No outstanding dues'}
                </p>

                {/* Quick fill balance */}
                {currentSupplier.balance > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(currentSupplier.balance.toString())}
                    className="text-xs"
                  >
                    Pay Full Balance: {formatCurrency(currentSupplier.balance)}
                  </Button>
                )}
              </div>
            )}

            {/* Recent Bills from Supplier */}
            {supplierBills.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Recent Purchase Bills
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {supplierBills.map((bill) => (
                    <div key={bill.id} className="bg-secondary/30 rounded-lg p-2 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{bill.bill_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(bill.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <span className="font-semibold">{formatCurrency(bill.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Payment Amount <span className="text-destructive">*</span>
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
                placeholder="e.g., Bill numbers, Notes"
              />
            </div>

            {/* Summary */}
            {currentSupplier && currentSupplier.balance > 0 && amountNum > 0 && (
              <div className="bg-accent/10 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Due:</span>
                  <span className="font-medium">{formatCurrency(currentSupplier.balance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment:</span>
                  <span className="font-medium text-success">- {formatCurrency(amountNum)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="font-medium">Remaining Due:</span>
                  <span className={cn("font-bold", currentSupplier.balance - amountNum > 0 ? "text-warning" : "text-success")}>
                    {formatCurrency(Math.max(0, currentSupplier.balance - amountNum))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={loading || !selectedSupplier || amountNum <= 0}
              className="w-full py-6 text-lg gap-2"
            >
              <ArrowUpRight className="w-5 h-5" />
              {loading ? 'Saving...' : `Pay ${currentSupplier?.name || 'Supplier'}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
