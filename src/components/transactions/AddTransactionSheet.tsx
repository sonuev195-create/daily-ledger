import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus, Receipt, ShoppingCart, Banknote, Home, Users, ArrowLeftRight, Package, Tag } from 'lucide-react';
import { Transaction, PaymentEntry, TransactionSection, BillType, BillItem, PaymentMode, GiveBackPayment } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BillItemsEntry, createBatchesFromPurchase } from '@/components/bills/BillItemsEntry';
import { SaleBillItemsEntry } from '@/components/bills/SaleBillItemsEntry';
import { OverpaymentHandler, GiveBackEntry } from '@/components/transactions/OverpaymentHandler';
import { CustomerSearchInput } from '@/components/transactions/CustomerSearchInput';
import { deductFromBatch, saveBillToSupabase, updateCustomerBalance, getOrCreateCustomer } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DueBill {
  id: string;
  billNumber: string;
  totalAmount: number;
  dueAmount: number;
  createdAt: Date;
}

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
    { value: 'home_credit', label: 'Credit (Money In)' },
    { value: 'home_debit', label: 'Debit (Money Out)' },
  ],
  exchange: [
    { value: 'exchange', label: 'Mode Exchange' },
  ],
};

interface AdvancePurpose {
  id: string;
  name: string;
}

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
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerAdvance, setCustomerAdvance] = useState(0);
  const [useAdvanceAmount, setUseAdvanceAmount] = useState(0);
  const [selectedDueBill, setSelectedDueBill] = useState<DueBill | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [reference, setReference] = useState('');
  const [billType, setBillType] = useState<BillType>('g_bill');
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: uuidv4(), mode: 'cash', amount: 0 },
  ]);
  
  // Advance purpose state
  const [advancePurposes, setAdvancePurposes] = useState<AdvancePurpose[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState<string>('');
  const [newPurpose, setNewPurpose] = useState('');
  const [showNewPurpose, setShowNewPurpose] = useState(false);
  const [advanceRate, setAdvanceRate] = useState('');
  
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
  const showAdvancePurpose = section === 'sale' && type === 'customer_advance';

  // Load advance purposes
  useEffect(() => {
    loadAdvancePurposes();
  }, []);

  const loadAdvancePurposes = async () => {
    const { data } = await supabase.from('advance_purposes').select('*').order('name');
    if (data) {
      setAdvancePurposes(data);
      if (data.length > 0 && !selectedPurpose) {
        setSelectedPurpose(data[0].id);
      }
    }
  };

  const handleAddNewPurpose = async () => {
    if (!newPurpose.trim()) return;
    const { data, error } = await supabase.from('advance_purposes').insert({ name: newPurpose.trim() }).select().single();
    if (error) {
      toast.error('Purpose already exists or error adding');
      return;
    }
    if (data) {
      setAdvancePurposes([...advancePurposes, data]);
      setSelectedPurpose(data.id);
      setNewPurpose('');
      setShowNewPurpose(false);
      toast.success('Purpose added');
    }
  };

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

  // Generate auto bill number based on section and type - series with sequential number
  const generateBillNumber = async (sec: TransactionSection, typ: string): Promise<string> => {
    let prefix = 'TX';
    if (sec === 'sale') {
      if (typ === 'sale') prefix = 'S';
      else if (typ === 'sales_return') prefix = 'SR';
      else if (typ === 'balance_paid') prefix = 'BP';
      else if (typ === 'customer_advance') prefix = 'CA';
    } else if (sec === 'purchase') {
      if (typ === 'purchase_bill') prefix = 'PB';
      else if (typ === 'purchase_return') prefix = 'PR';
      else if (typ === 'purchase_payment') prefix = 'PP';
    } else if (sec === 'expenses') {
      prefix = 'EX';
    } else if (sec === 'employee') {
      prefix = 'EM';
    } else if (sec === 'home') {
      prefix = 'HM';
    } else if (sec === 'exchange') {
      prefix = 'XC';
    }
    
    // Get the last bill number with this prefix to generate next in series
    const { data } = await supabase
      .from('transactions')
      .select('bill_number')
      .like('bill_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    
    let nextNum = 1;
    if (data && data.length > 0 && data[0].bill_number) {
      const lastNum = parseInt(data[0].bill_number.replace(prefix, ''), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    
    return `${prefix}${nextNum.toString().padStart(4, '0')}`;
  };

  const resetForm = () => {
    const sec = initialSection || 'sale';
    const typ = initialType || typeOptions[sec]?.[0]?.value || 'sale';
    setSection(sec);
    setType(typ);
    setAmount('');
    setBillNumber(generateBillNumber(sec, typ));
    setCustomerName('');
    setCustomerId(undefined);
    setCustomerAdvance(0);
    setUseAdvanceAmount(0);
    setSelectedDueBill(null);
    setSupplierName('');
    setReference('');
    setBillType('g_bill');
    setPayments([{ id: uuidv4(), mode: 'cash', amount: 0 }]);
    setBillItems([createEmptyBillItem()]);
    setGiveBackEntries([]);
    setSelectedPurpose(advancePurposes[0]?.id || '');
    setAdvanceRate('');
    setNewPurpose('');
    setShowNewPurpose(false);
  };

  const handleSectionChange = (newSection: TransactionSection) => {
    setSection(newSection);
    const newType = typeOptions[newSection][0].value;
    setType(newType);
    setBillNumber(generateBillNumber(newSection, newType));
    setBillItems([createEmptyBillItem()]);
    setGiveBackEntries([]);
    setSelectedDueBill(null);
  };

  // Handle customer selection
  const handleCustomerChange = (name: string, id?: string, advance?: number) => {
    setCustomerName(name);
    setCustomerId(id);
    setCustomerAdvance(advance || 0);
    setUseAdvanceAmount(0); // Reset advance usage when customer changes
  };

  // Handle due bill selection (for Balance Paid type)
  const handleDueBillSelect = (bill: DueBill) => {
    setSelectedDueBill(bill);
    setAmount(bill.dueAmount.toString());
    setReference(`Payment for ${bill.billNumber}`);
  };

  // Update bill number when type changes
  const handleTypeChange = (newType: string) => {
    setType(newType);
    setBillNumber(generateBillNumber(section, newType));
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
  const effectivePayment = totalPayments + useAdvanceAmount; // Include advance usage
  const difference = amountNum - effectivePayment;
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
      window.dispatchEvent(new Event('batches:changed'));
    }

    // Get or create customer if customer name is provided
    let finalCustomerId = customerId;
    if (customerName && !customerId) {
      finalCustomerId = await getOrCreateCustomer(customerName) || undefined;
    }

    // Prepare giveBack array for transaction
    const giveBack: GiveBackPayment[] = giveBackEntries.filter(g => g.amount > 0).map(g => ({
      id: g.id,
      mode: g.mode as PaymentMode,
      amount: g.amount,
    }));

    // Persist "advance used" as a payment entry so bills/reports can show it
    const advancePaymentEntry: PaymentEntry[] = useAdvanceAmount > 0
      ? [{ id: uuidv4(), mode: 'advance', amount: useAdvanceAmount }]
      : [];

    const finalPayments: PaymentEntry[] = [...payments.filter(p => p.amount > 0), ...advancePaymentEntry];

    const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
      date: selectedDate,
      section,
      type,
      amount: amountNum,
      payments: finalPayments,
      giveBack: giveBack.length > 0 ? giveBack : undefined,
      billNumber: billNumber || undefined,
      customerId: finalCustomerId,
      customerName: customerName || undefined,
      supplierName: supplierName || undefined,
      reference: reference || undefined,
      billType: showBillType ? billType : undefined,
      due: difference > 0 ? difference : undefined,
      overpayment: remainingOverpayment > 0 ? remainingOverpayment : undefined,
    };

    // Create a backend transaction (used by Bills/Due/Reports)
    const backendTransactionId = uuidv4();
    const txRow: any = {
      id: backendTransactionId,
      date: selectedDate.toISOString().split('T')[0],
      section,
      type,
      amount: amountNum,
      payments: finalPayments as any,
      give_back: (giveBack.length > 0
        ? giveBack.map(g => ({ id: g.id, mode: g.mode, amount: g.amount }))
        : []) as any,
      bill_number: billNumber || null,
      customer_id: finalCustomerId || null,
      customer_name: customerName || null,
      supplier_name: supplierName || null,
      reference: reference || null,
      bill_type: showBillType ? billType : null,
      due: difference > 0 ? difference : null,
      overpayment: remainingOverpayment > 0 ? remainingOverpayment : null,
      advance_purpose_id: showAdvancePurpose ? (selectedPurpose || null) : null,
      advance_rate: showAdvancePurpose ? (parseFloat(advanceRate) || 0) : null,
    };

    const { error: txInsertError } = await supabase
      .from('transactions')
      .upsert([txRow], { onConflict: 'id' });
    if (txInsertError) {
      console.error('Error saving transaction to backend:', txInsertError);
    }

    // Save bill + bill items to backend for sale/purchase transactions with items
    const billTypeStr = section === 'sale' ? type : section === 'purchase' ? type : '';
    if (showBillItems && billItems.some(item => item.itemName && item.primaryQuantity > 0)) {
      const billItemsForSupabase = billItems
        .filter(item => item.itemName && item.primaryQuantity > 0)
        .map(item => ({
          itemId: item.itemId,
          batchId: item.batchId,
          itemName: item.itemName,
          primaryQty: item.primaryQuantity,
          secondaryQty: item.secondaryQuantity,
          rate: item.rate,
          total: item.totalAmount,
        }));

      await saveBillToSupabase(
        backendTransactionId,
        billNumber || '',
        billTypeStr,
        amountNum,
        customerName || undefined,
        supplierName || undefined,
        billItemsForSupabase
      );
    }

    // Update customer balance if there's due or advance
    if (finalCustomerId) {
      if (difference > 0 && section === 'sale') {
        // Due amount - increase customer due balance
        await updateCustomerBalance(finalCustomerId, difference, 0);
      }
      if (remainingOverpayment > 0 && section === 'sale') {
        // Overpayment saved as advance
        await updateCustomerBalance(finalCustomerId, 0, remainingOverpayment);
      }
      // Deduct advance if used
      if (useAdvanceAmount > 0 && section === 'sale') {
        await updateCustomerBalance(finalCustomerId, 0, -useAdvanceAmount);
      }
    }

    window.dispatchEvent(new Event('items:changed'));

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
              <Select value={type} onValueChange={handleTypeChange}>
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

            {/* Bill Number - Mandatory with auto-generation */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Bill Number <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Auto-generated"
                className="input-field"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-generated: {section === 'sale' && type === 'sale' ? 'S' : 
                  section === 'sale' && type === 'sales_return' ? 'SR' :
                  section === 'sale' && type === 'balance_paid' ? 'BP' :
                  section === 'sale' && type === 'customer_advance' ? 'CA' :
                  section === 'purchase' && type === 'purchase_bill' ? 'PB' : 'TX'}-prefix
              </p>
            </div>

            {/* Customer Name (for Sale) */}
            {showCustomer && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Customer {type === 'balance_paid' ? '' : '(Optional)'}
                </label>
                <CustomerSearchInput
                  value={customerName}
                  onChange={handleCustomerChange}
                  showDueBills={type === 'balance_paid'}
                  onSelectDueBill={handleDueBillSelect}
                  placeholder="Search by name or phone..."
                />
                {/* Show customer advance available for use */}
                {customerAdvance > 0 && type === 'sale' && (
                  <div className="mt-2 p-3 bg-success/10 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-success font-medium">Customer Advance Available</span>
                      <span className="font-bold text-success">₹{customerAdvance.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Use advance:</label>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                        <input
                          type="number"
                          value={useAdvanceAmount || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setUseAdvanceAmount(Math.min(val, customerAdvance));
                          }}
                          max={customerAdvance}
                          placeholder="0"
                          className="input-field pl-7 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => setUseAdvanceAmount(Math.min(customerAdvance, amountNum))}
                        className="px-2 py-1 text-xs bg-success/20 text-success rounded-lg hover:bg-success/30"
                      >
                        Use All
                      </button>
                    </div>
                  </div>
                )}
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

            {/* Advance Purpose (for Customer Advance) */}
            {showAdvancePurpose && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Advance Purpose
                  </label>
                  {!showNewPurpose ? (
                    <div className="flex gap-2">
                      <Select value={selectedPurpose} onValueChange={setSelectedPurpose}>
                        <SelectTrigger className="input-field flex-1">
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {advancePurposes.map((purpose) => (
                            <SelectItem key={purpose.id} value={purpose.id}>
                              {purpose.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => setShowNewPurpose(true)}
                        className="px-3 py-2 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 text-sm font-medium"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPurpose}
                        onChange={(e) => setNewPurpose(e.target.value)}
                        placeholder="Enter new purpose"
                        className="input-field flex-1"
                      />
                      <button
                        onClick={handleAddNewPurpose}
                        className="px-3 py-2 rounded-xl bg-success text-success-foreground text-sm font-medium"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setShowNewPurpose(false); setNewPurpose(''); }}
                        className="px-3 py-2 rounded-xl bg-secondary text-muted-foreground text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Advance Rate */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Rate / Note (Optional)</label>
                  <input
                    type="text"
                    value={advanceRate}
                    onChange={(e) => setAdvanceRate(e.target.value)}
                    placeholder="e.g., 10% discount, specific item rate"
                    className="input-field"
                  />
                </div>
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
                  <span className="text-muted-foreground">Cash/UPI/Bank Payment</span>
                  <span className="font-medium">₹{totalPayments.toLocaleString('en-IN')}</span>
                </div>
                
                {/* Show advance used */}
                {useAdvanceAmount > 0 && (
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Advance Used</span>
                    <span className="font-medium text-success">₹{useAdvanceAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                
                {/* Show give-back in summary when overpayment */}
                {overpaymentAmount > 0 && totalGiveBack > 0 && (
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Given Back</span>
                    <span className="font-medium text-info">-₹{totalGiveBack.toLocaleString('en-IN')}</span>
                  </div>
                )}
                
                <div className="border-t border-current/10 pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className={cn(
                      "font-medium",
                      difference === 0 ? "text-success" : difference > 0 ? "text-warning" : "text-info"
                    )}>
                      {difference === 0 ? 'Balanced' : difference > 0 ? 'Due' : 
                       remainingOverpayment > 0 ? 'Saved as Advance' : 'Returned'}
                    </span>
                    <span className={cn(
                      "font-semibold",
                      difference === 0 ? "text-success" : difference > 0 ? "text-warning" : "text-info"
                    )}>
                      ₹{(difference > 0 ? difference : remainingOverpayment).toLocaleString('en-IN')}
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
