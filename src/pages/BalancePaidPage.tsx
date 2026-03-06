import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Phone, AlertCircle, CheckCircle, ArrowDownRight, Plus, Receipt, Calendar, X } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  advance_balance: number;
  due_balance: number;
}

interface DueBill {
  id: string;
  bill_number: string | null;
  amount: number;
  due: number;
  date: string;
  created_at: string;
  customer_name: string | null;
  customer_id: string | null;
}

interface BalanceTransaction {
  id: string;
  amount: number;
  created_at: string;
  payments: any;
}

type PaymentMode = 'cash' | 'upi' | 'cheque';

interface PaymentEntry {
  mode: PaymentMode;
  amount: number;
}

export default function BalancePaidPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allDueBills, setAllDueBills] = useState<DueBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [balanceTransactions, setBalanceTransactions] = useState<BalanceTransaction[]>([]);
  const [customerDueBills, setCustomerDueBills] = useState<DueBill[]>([]);

  // Payment sheet state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<DueBill | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([{ mode: 'cash', amount: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [custRes, billsRes] = await Promise.all([
        supabase.from('customers').select('*').gt('due_balance', 0).order('due_balance', { ascending: false }),
        supabase.from('transactions').select('id, bill_number, amount, due, date, created_at, customer_name, customer_id').gt('due', 0).order('created_at', { ascending: false })
      ]);
      setCustomers(custRes.data || []);
      setAllDueBills(billsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalanceTransactions = async (customerName: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, amount, created_at, payments')
      .eq('type', 'balance_paid')
      .eq('customer_name', customerName)
      .order('created_at', { ascending: false });
    setBalanceTransactions(data || []);
  };

  const fetchCustomerDueBills = async (customerName: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, bill_number, amount, due, date, created_at, customer_name, customer_id')
      .eq('customer_name', customerName)
      .gt('due', 0)
      .order('created_at', { ascending: false });
    setCustomerDueBills(data || []);
  };

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    await Promise.all([
      fetchBalanceTransactions(customer.name),
      fetchCustomerDueBills(customer.name)
    ]);
  };

  // Filter due bills by search query (bill number, customer name, phone) and date
  const filteredBills = allDueBills.filter(bill => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      bill.bill_number?.toLowerCase().includes(q) ||
      bill.customer_name?.toLowerCase().includes(q) ||
      customers.find(c => c.name === bill.customer_name)?.phone?.includes(q);
    const matchesDate = !dateFilter || bill.date === dateFilter;
    return matchesSearch && matchesDate;
  });

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);
  };

  const totalDue = customers.reduce((sum, c) => sum + c.due_balance, 0);

  // Payment logic
  const openPaymentForBill = (bill: DueBill) => {
    const customer = customers.find(c => c.id === bill.customer_id || c.name === bill.customer_name);
    setPayingBill(bill);
    setPayingCustomer(customer || null);
    setPaymentAmount(String(bill.due));
    setPayments([{ mode: 'cash', amount: bill.due }]);
    setPaymentOpen(true);
  };

  const openPaymentForCustomer = (customer: Customer) => {
    setPayingBill(null);
    setPayingCustomer(customer);
    setPaymentAmount(String(customer.due_balance));
    setPayments([{ mode: 'cash', amount: customer.due_balance }]);
    setPaymentOpen(true);
  };

  const addPaymentMode = () => {
    const usedModes = payments.map(p => p.mode);
    const available: PaymentMode[] = (['cash', 'upi', 'cheque'] as PaymentMode[]).filter(m => !usedModes.includes(m));
    if (available.length > 0) {
      setPayments([...payments, { mode: available[0], amount: 0 }]);
    }
  };

  const updatePayment = (index: number, field: 'mode' | 'amount', value: any) => {
    const updated = [...payments];
    if (field === 'amount') {
      updated[index].amount = parseFloat(value) || 0;
    } else {
      updated[index].mode = value;
    }
    setPayments(updated);
  };

  const removePayment = (index: number) => {
    if (payments.length <= 1) return;
    setPayments(payments.filter((_, i) => i !== index));
  };

  const totalPayment = payments.reduce((sum, p) => sum + p.amount, 0);
  const amt = parseFloat(paymentAmount) || 0;

  const getNextBillNumber = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('bill_number')
      .eq('type', 'balance_paid')
      .like('bill_number', 'BP%')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0 && data[0].bill_number) {
      const num = parseInt(data[0].bill_number.replace('BP', '')) || 0;
      return `BP${String(num + 1).padStart(4, '0')}`;
    }
    return 'BP0001';
  };

  const handleSavePayment = async () => {
    if (amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (totalPayment !== amt) { toast.error('Payment total must equal amount'); return; }
    if (!payingCustomer) { toast.error('No customer selected'); return; }

    setSaving(true);
    try {
      const billNumber = await getNextBillNumber();
      const validPayments = payments.filter(p => p.amount > 0);

      // Create balance_paid transaction
      const { error: txError } = await supabase.from('transactions').insert({
        type: 'balance_paid' as string,
        section: 'sale' as string,
        amount: amt,
        payments: validPayments as any,
        customer_id: payingCustomer.id,
        customer_name: payingCustomer.name,
        bill_number: billNumber,
        date: new Date().toISOString().split('T')[0],
      });
      if (txError) throw txError;

      // If paying a specific bill, reduce its due
      if (payingBill) {
        const newDue = Math.max(0, payingBill.due - amt);
        await supabase.from('transactions').update({ due: newDue }).eq('id', payingBill.id);
      }

      // Update customer due_balance
      const newDueBalance = Math.max(0, payingCustomer.due_balance - amt);
      await supabase.from('customers').update({ due_balance: newDueBalance }).eq('id', payingCustomer.id);

      toast.success(`Payment ${billNumber} recorded`);
      setPaymentOpen(false);
      setSelectedCustomer(null);
      fetchData();
    } catch (error) {
      console.error('Error saving payment:', error);
      toast.error('Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  const [viewMode, setViewMode] = useState<'customers' | 'bills'>('customers');

  return (
    <AppLayout title="Balance Paid">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Due Balances</h1>
            <p className="text-sm text-muted-foreground">{customers.length} customers with dues</p>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Due Balance</p>
              <p className="text-2xl font-bold text-warning">{formatCurrency(totalDue)}</p>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewMode === 'customers' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('customers')}
          >
            By Customer
          </Button>
          <Button
            variant={viewMode === 'bills' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('bills')}
          >
            By Bills
          </Button>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={viewMode === 'bills' ? "Search bill number, name, phone..." : "Search by name or phone..."}
              className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent"
            />
          </div>
          {viewMode === 'bills' && (
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-10 pl-10 pr-3 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent"
              />
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : viewMode === 'customers' ? (
          /* Customer View */
          filteredCustomers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 mx-auto text-success/50 mb-4" />
              <p className="text-muted-foreground">No pending dues</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((customer, index) => (
                <motion.div
                  key={customer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="bg-card border border-warning/30 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => handleSelectCustomer(customer)}>
                      <h3 className="font-semibold text-foreground">{customer.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-warning">{formatCurrency(customer.due_balance)}</p>
                        <p className="text-xs text-muted-foreground">Due</p>
                      </div>
                      <Button size="sm" onClick={() => openPaymentForCustomer(customer)}>
                        Pay
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )
        ) : (
          /* Bills View */
          filteredBills.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 mx-auto text-success/50 mb-4" />
              <p className="text-muted-foreground">No due bills found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBills.map((bill, index) => (
                <motion.div
                  key={bill.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="bg-card border border-warning/30 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">
                        {bill.bill_number || `TX-${bill.id.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-muted-foreground">{bill.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(bill.date), 'dd MMM yyyy')} • Total: {formatCurrency(bill.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-warning">{formatCurrency(bill.due)}</p>
                        <p className="text-xs text-muted-foreground">Due</p>
                      </div>
                      <Button size="sm" onClick={() => openPaymentForBill(bill)}>
                        Pay
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Customer Detail Sheet */}
      <Sheet open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{selectedCustomer?.name}</SheetTitle>
          </SheetHeader>
          
          {selectedCustomer && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-warning/10 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Due Balance</p>
                  <p className="text-xl font-bold text-warning">{formatCurrency(selectedCustomer.due_balance)}</p>
                </div>
                <div className={cn("rounded-xl p-4", selectedCustomer.advance_balance > 0 ? "bg-success/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Advance Balance</p>
                  <p className={cn("text-xl font-bold", selectedCustomer.advance_balance > 0 ? "text-success" : "text-muted-foreground")}>
                    {formatCurrency(selectedCustomer.advance_balance)}
                  </p>
                </div>
              </div>

              <Button className="w-full gap-2" onClick={() => { setSelectedCustomer(null); openPaymentForCustomer(selectedCustomer); }}>
                <Plus className="w-4 h-4" /> Record Payment
              </Button>

              {customerDueBills.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-warning" /> Due Bills
                  </h4>
                  <div className="space-y-2">
                    {customerDueBills.map((bill) => (
                      <div key={bill.id} className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{bill.bill_number || `TX-${bill.id.slice(0, 8)}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(bill.date), 'dd MMM yyyy')} • Total: {formatCurrency(bill.amount)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-lg font-bold text-warning">{formatCurrency(bill.due)}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedCustomer(null); openPaymentForBill(bill); }}>
                            Pay
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Payment History</h4>
                {balanceTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No balance payments recorded</p>
                ) : (
                  <div className="space-y-2">
                    {balanceTransactions.map((tx) => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.created_at), 'MMM d, yyyy')}</p>
                          {tx.payments && Array.isArray(tx.payments) && (
                            <div className="flex gap-1 mt-1">
                              {tx.payments.map((p: any, i: number) => (
                                <span key={i} className="text-xs px-2 py-0.5 bg-secondary rounded-full capitalize">
                                  {p.mode}: ₹{p.amount}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <ArrowDownRight className="w-4 h-4 text-success" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Payment Sheet */}
      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Record Balance Payment</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto max-h-[calc(75vh-150px)]">
            {/* Customer & Bill Info */}
            {payingCustomer && (
              <div className="bg-secondary/30 rounded-xl p-3">
                <p className="font-semibold text-foreground">{payingCustomer.name}</p>
                <p className="text-sm text-muted-foreground">
                  Total Due: {formatCurrency(payingCustomer.due_balance)}
                  {payingBill && ` • Bill: ${payingBill.bill_number || payingBill.id.slice(0, 8)}`}
                </p>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Payment Amount</label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => {
                  setPaymentAmount(e.target.value);
                  const val = parseFloat(e.target.value) || 0;
                  if (payments.length === 1) {
                    setPayments([{ ...payments[0], amount: val }]);
                  }
                }}
                placeholder="Enter amount"
              />
            </div>

            {/* Payment Modes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">Payment Modes</label>
                {payments.length < 3 && (
                  <Button variant="ghost" size="sm" onClick={addPaymentMode} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Add Mode
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={p.mode}
                      onChange={(e) => updatePayment(i, 'mode', e.target.value)}
                      className="h-10 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex-shrink-0"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="cheque">Cheque</option>
                    </select>
                    <Input
                      type="number"
                      value={p.amount || ''}
                      onChange={(e) => updatePayment(i, 'amount', e.target.value)}
                      placeholder="Amount"
                      className="flex-1"
                    />
                    {payments.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removePayment(i)} className="flex-shrink-0">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {amt > 0 && totalPayment !== amt && (
                <p className="text-xs text-destructive mt-1">
                  Payment total ({formatCurrency(totalPayment)}) ≠ Amount ({formatCurrency(amt)})
                </p>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="absolute bottom-6 left-4 right-4">
            <Button
              className="w-full"
              onClick={handleSavePayment}
              disabled={saving || amt <= 0 || totalPayment !== amt}
            >
              {saving ? 'Saving...' : `Record Payment ${amt > 0 ? formatCurrency(amt) : ''}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
