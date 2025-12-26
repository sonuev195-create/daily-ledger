import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus, Receipt, ShoppingCart, Banknote, Home, Users, ArrowLeftRight, Package } from 'lucide-react';
import { Transaction, PaymentEntry, TransactionSection, BillType, BillItem, PaymentMode } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BillItemsEntry, createBatchesFromPurchase } from '@/components/bills/BillItemsEntry';
import { SaleBillItemsEntry } from '@/components/bills/SaleBillItemsEntry';
import { OverpaymentHandler, GiveBackEntry } from '@/components/transactions/OverpaymentHandler';
import { deductFromBatch } from '@/hooks/useSupabaseData';

interface AddTransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  editTransaction?: Transaction | null;
  selectedDate: Date;
  initialSection?: TransactionSection | null;
  initialType?: string | null;
}

const sections: { id: TransactionSection; label: string; icon: any }[] = [
  { id: 'sale', label: 'Sale', icon: Receipt },
  { id: 'expenses', label: 'Expenses', icon: Banknote },
  { id: 'purchase', label: 'Purchase', icon: ShoppingCart },
  { id: 'employee', label: 'Employee', icon: Users },
  { id: 'home', label: 'Home', icon: Home },
  { id: 'exchange', label: 'Exchange', icon: ArrowLeftRight },
];

const typeOptions: Record<TransactionSection, { value: string; label: string }[]> = {
  sale: [
    { value: 'sale', label: 'Sale' },
    { value: 'sales_return', label: 'Sales Return' },
    { value: 'customer_advance', label: 'Customer Advance' },
    { value: 'balance_paid', label: 'Balance Paid' },
  ],
  expenses: [
    { value: 'other_expenses', label: 'Other Expenses' },
    { value: 'vehicle_expenses', label: 'Vehicle Expenses' },
    { value: 'workshop_expenses', label: 'Workshop Expenses' },
  ],
  purchase: [
    { value: 'purchase_bill', label: 'Purchase Bill' },
    { value: 'purchase_delivered', label: 'Purchase Delivered' },
    { value: 'purchase_return', label: 'Purchase Return' },
    { value: 'purchase_payment', label: 'Purchase Payment' },
    { value: 'purchase_expenses', label: 'Purchase Expenses' },
  ],
  employee: [
    { value: 'salary', label: 'Salary Payment' },
    { value: 'daily_wage', label: 'Daily Wage' },
    { value: 'advance', label: 'Advance' },
  ],
  home: [
    { value: 'home_credit', label: 'Home Credit' },
    { value: 'home_debit', label: 'Home Debit' },
  ],
  exchange: [
    { value: 'exchange', label: 'Mode Exchange' },
  ],
};

function createEmptyBillItem(): BillItem {
  return {
    id: uuidv4(),
    itemId: undefined,
    batchId: undefined,
    itemName: '',
    primaryQuantity: 0,
    secondaryQuantity: 0,
    secondaryUnit: undefined,
    conversionRate: undefined,
    rate: 0,
    totalAmount: 0,
  };
}

export function AddTransactionSheet({ isOpen, onClose, onSave, editTransaction, selectedDate, initialSection, initialType }: AddTransactionSheetProps) {
  const [section, setSection] = useState<TransactionSection>(initialSection || 'sale');
  const [type, setType] = useState(initialType || 'sale');
  const [amount, setAmount] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [reference, setReference] = useState('');
  const [billType, setBillType] = useState<BillType>('g_bill');
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: uuidv4(), mode: 'cash', amount: 0 },
  ]);
  
  // Bill items for Sale/Purchase transactions
  const [billItems, setBillItems] = useState<BillItem[]>([createEmptyBillItem()]);
  
  // Overpayment give-back entries
  const [giveBackEntries, setGiveBackEntries] = useState<GiveBackEntry[]>([]);

  // Determine what to show
  const showSaleBillItems = section === 'sale' && (type === 'sale' || type === 'sales_return');
  const showPurchaseBillItems = section === 'purchase' && type === 'purchase_bill';
  const showBillItems = showSaleBillItems || showPurchaseBillItems;
  const showCustomer = section === 'sale';
  const showSupplier = section === 'purchase';
  const showBillType = section === 'purchase' && type === 'purchase_bill';
  const showSimpleAmount = !showBillItems;

  useEffect(() => {
    if (editTransaction) {
      setSection(editTransaction.section);
      setType(editTransaction.type);
      setAmount(editTransaction.amount.toString());
      setBillNumber(editTransaction.billNumber || '');
      setCustomerName(editTransaction.customerName || '');
      setSupplierName(editTransaction.supplierName || '');
      setReference(editTransaction.reference || '');
      setBillType(editTransaction.billType || 'g_bill');
      setPayments(editTransaction.payments.length > 0 ? editTransaction.payments : [{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    } else {
      resetForm();
    }
  }, [editTransaction, isOpen]);

  const resetForm = () => {
    setSection(initialSection || 'sale');
    setType(initialType || typeOptions[initialSection || 'sale']?.[0]?.value || 'sale');
    setAmount('');
    setBillNumber('');
    setCustomerName('');
    setSupplierName('');
    setReference('');
    setBillType('g_bill');
    setPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    setBillItems([createEmptyBillItem()]);
    setGiveBackEntries([]);
  };

  const handleSectionChange = (newSection: TransactionSection) => {
    setSection(newSection);
    setType(typeOptions[newSection][0].value);
    setBillItems([createEmptyBillItem()]);
    setGiveBackEntries([]);
  };

  // Calculate bill total and sync to amount
  const billTotal = billItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  useEffect(() => {
    if (showBillItems && billTotal > 0) {
      setAmount(billTotal.toString());
    }
  }, [billTotal, showBillItems]);

  const addPaymentMode = () => {
    setPayments([...payments, { id: uuidv4(), mode: 'upi', amount: 0 }]);
  };

  const updatePayment = (id: string, field: 'mode' | 'amount', value: any) => {
    setPayments(payments.map(p => 
      p.id === id ? { ...p, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : p
    ));
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalGiveBack = giveBackEntries.reduce((sum, e) => sum + e.amount, 0);
  const amountNum = parseFloat(amount) || 0;
  const difference = amountNum - totalPayments;
  const overpaymentAmount = difference < 0 ? Math.abs(difference) : 0;
  const remainingOverpayment = overpaymentAmount - totalGiveBack;

  // Initialize give-back entries when overpayment occurs
  useEffect(() => {
    if (overpaymentAmount > 0 && giveBackEntries.length === 0) {
      setGiveBackEntries([{ id: uuidv4(), mode: 'cash', amount: overpaymentAmount }]);
    } else if (overpaymentAmount === 0) {
      setGiveBackEntries([]);
    }
  }, [overpaymentAmount]);

  const handleSave = async () => {
    // For purchase bills, create batches automatically
    if (showPurchaseBillItems && billItems.some(item => item.itemName && item.primaryQuantity > 0)) {
      await createBatchesFromPurchase(billItems, billNumber || `PB-${Date.now()}`);
    }

    // For sales, deduct from batches
    if (showSaleBillItems && billItems.some(item => item.batchId && item.primaryQuantity > 0)) {
      for (const item of billItems) {
        if (item.batchId && item.primaryQuantity > 0) {
          await deductFromBatch(item.batchId, item.primaryQuantity, item.secondaryQuantity);
        }
      }
    }

    const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
      date: selectedDate,
      section,
      type,
      amount: amountNum,
      payments: payments.filter(p => p.amount > 0),
      billNumber: billNumber || undefined,
      customerName: customerName || undefined,
      supplierName: supplierName || undefined,
      reference: reference || undefined,
      billType: showBillType ? billType : undefined,
      due: difference > 0 ? difference : undefined,
      overpayment: remainingOverpayment > 0 ? remainingOverpayment : undefined, // Only remaining after give-back
    };

    onSave(transaction);
    onClose();
    resetForm();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">
                {editTransaction ? 'Edit Transaction' : 'Add Transaction'}
              </SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Section Selector */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Section</label>
              <div className="grid grid-cols-3 gap-2">
                {sections.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSectionChange(s.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                        section === s.id
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type Selector */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="input-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {typeOptions[section].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bill Type (for Purchase Bill) */}
            {showBillType && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Bill Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBillType('g_bill')}
                    className={cn(
                      "py-3 rounded-xl border text-sm font-medium transition-all",
                      billType === 'g_bill'
                        ? "border-success bg-success/10 text-success"
                        : "border-border bg-secondary/30 text-muted-foreground"
                    )}
                  >
                    G Bill
                  </button>
                  <button
                    onClick={() => setBillType('n_bill')}
                    className={cn(
                      "py-3 rounded-xl border text-sm font-medium transition-all",
                      billType === 'n_bill'
                        ? "border-info bg-info/10 text-info"
                        : "border-border bg-secondary/30 text-muted-foreground"
                    )}
                  >
                    N Bill
                  </button>
                </div>
              </div>
            )}

            {/* Bill Number */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Bill Number (Optional)</label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Enter bill number"
                className="input-field"
              />
            </div>

            {/* Customer Name (for Sale) */}
            {showCustomer && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Customer (Optional)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  className="input-field"
                />
              </div>
            )}

            {/* Supplier Name (for Purchase) */}
            {showSupplier && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Supplier (Optional)</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Enter supplier name"
                  className="input-field"
                />
              </div>
            )}

            {/* Reference (for Expenses) */}
            {section === 'expenses' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Reference</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Enter reference"
                  className="input-field"
                />
              </div>
            )}

            {/* Sale Bill Items (Compact with Batch Selection) */}
            {showSaleBillItems && (
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                  <Package className="w-4 h-4" />
                  Sale Items
                </label>
                <SaleBillItemsEntry
                  billItems={billItems}
                  setBillItems={setBillItems}
                />
              </div>
            )}

            {/* Purchase Bill Items */}
            {showPurchaseBillItems && (
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                  <Package className="w-4 h-4" />
                  Purchase Items
                </label>
                <BillItemsEntry
                  billItems={billItems}
                  setBillItems={setBillItems}
                  mode="purchase"
                  billNumber={billNumber}
                />
              </div>
            )}

            {/* Simple Amount (for non-bill transactions) */}
            {showSimpleAmount && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="input-field pl-8 text-2xl font-semibold"
                  />
                </div>
              </div>
            )}

            {/* Sale/Purchase Amount (editable, synced from bill total) */}
            {showBillItems && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  {showSaleBillItems ? 'Sale Amount' : 'Purchase Amount'}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="input-field pl-8 text-2xl font-semibold"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Auto-filled from bill total. You can edit if needed.</p>
              </div>
            )}

            {/* Payment Methods */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Payment</label>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Select
                      value={payment.mode}
                      onValueChange={(value) => updatePayment(payment.id, 'mode', value)}
                    >
                      <SelectTrigger className="w-32 input-field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="advance">Advance</SelectItem>
                        <SelectItem value="adjust">Adjust</SelectItem>
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
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </div>
              
              {/* Add Payment Mode Button - Always below last payment */}
              <button
                onClick={addPaymentMode}
                className="w-full mt-3 py-2 rounded-xl border-2 border-dashed border-accent/30 text-accent text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent/5 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Payment Mode
              </button>
            </div>

            {/* Payment Summary */}
            {amountNum > 0 && (
              <div className={cn(
                "rounded-xl p-4",
                difference === 0 ? "bg-success/10" : difference > 0 ? "bg-warning/10" : "bg-info/10"
              )}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-medium">₹{amountNum.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Total Payment</span>
                  <span className="font-medium">₹{totalPayments.toLocaleString('en-IN')}</span>
                </div>
                <div className="border-t border-current/10 pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className={cn(
                      "font-medium",
                      difference === 0 ? "text-success" : difference > 0 ? "text-warning" : "text-info"
                    )}>
                      {difference === 0 ? 'Balanced' : difference > 0 ? 'Due' : 'Overpayment'}
                    </span>
                    <span className={cn(
                      "font-semibold",
                      difference === 0 ? "text-success" : difference > 0 ? "text-warning" : "text-info"
                    )}>
                      ₹{Math.abs(difference).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Overpayment Give-Back Handler */}
            {overpaymentAmount > 0 && section === 'sale' && (
              <OverpaymentHandler
                overpayment={overpaymentAmount}
                giveBackEntries={giveBackEntries}
                setGiveBackEntries={setGiveBackEntries}
                customerName={customerName}
              />
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-background">
            <button
              onClick={handleSave}
              disabled={amountNum <= 0}
              className="btn-accent w-full py-3 disabled:opacity-50"
            >
              {editTransaction ? 'Update Transaction' : 'Save Transaction'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
