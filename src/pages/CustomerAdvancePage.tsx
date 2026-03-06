import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Search, Phone, MapPin, Plus, CreditCard, ArrowUpRight, Edit2, Wrench, X } from 'lucide-react';
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

interface AdvanceTransaction {
  id: string;
  amount: number;
  advance_rate: number | null;
  advance_purpose_id: string | null;
  created_at: string;
  date: string;
  payments: any;
}

interface AdvancePurpose {
  id: string;
  name: string;
}

type PaymentMode = 'cash' | 'upi' | 'cheque';
interface PaymentEntry { mode: PaymentMode; amount: number; }

export default function CustomerAdvancePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [advanceTransactions, setAdvanceTransactions] = useState<AdvanceTransaction[]>([]);
  const [purposes, setPurposes] = useState<AdvancePurpose[]>([]);
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [editingService, setEditingService] = useState<AdvancePurpose | null>(null);

  // Add Advance Sheet
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advCustomerSearch, setAdvCustomerSearch] = useState('');
  const [advCustomer, setAdvCustomer] = useState<Customer | null>(null);
  const [advPurposeId, setAdvPurposeId] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advRate, setAdvRate] = useState('');
  const [advPayments, setAdvPayments] = useState<PaymentEntry[]>([{ mode: 'cash', amount: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [custRes, allCustRes, purposeRes] = await Promise.all([
        supabase.from('customers').select('*').gt('advance_balance', 0).order('name'),
        supabase.from('customers').select('*').order('name'),
        supabase.from('advance_purposes').select('id, name').order('name')
      ]);
      setCustomers(custRes.data || []);
      setAllCustomers(allCustRes.data || []);
      setPurposes(purposeRes.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdvanceTransactions = async (customerId: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, amount, advance_rate, advance_purpose_id, created_at, date, payments')
      .eq('type', 'customer_advance')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    setAdvanceTransactions(data || []);
  };

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    await fetchAdvanceTransactions(customer.id);
  };

  // Service CRUD
  const handleSaveService = async () => {
    if (!newServiceName.trim()) { toast.error('Service name is required'); return; }
    try {
      if (editingService) {
        const { error } = await supabase.from('advance_purposes').update({ name: newServiceName.trim() }).eq('id', editingService.id);
        if (error) throw error;
        toast.success('Service updated');
      } else {
        const { error } = await supabase.from('advance_purposes').insert({ name: newServiceName.trim() });
        if (error) throw error;
        toast.success('Service added');
      }
      setNewServiceName('');
      setEditingService(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to save service');
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    const { error } = await supabase.from('advance_purposes').delete().eq('id', id);
    if (error) toast.error('Cannot delete - may be in use');
    else { toast.success('Service deleted'); fetchData(); }
  };

  // Add Advance logic
  const openAddAdvance = (customer?: Customer) => {
    setAdvCustomer(customer || null);
    setAdvCustomerSearch(customer?.name || '');
    setAdvPurposeId('');
    setAdvAmount('');
    setAdvRate('');
    setAdvPayments([{ mode: 'cash', amount: 0 }]);
    setAdvanceOpen(true);
  };

  const addPaymentMode = () => {
    const used = advPayments.map(p => p.mode);
    const avail: PaymentMode[] = (['cash', 'upi', 'cheque'] as PaymentMode[]).filter(m => !used.includes(m));
    if (avail.length > 0) setAdvPayments([...advPayments, { mode: avail[0], amount: 0 }]);
  };

  const updatePayment = (i: number, field: 'mode' | 'amount', value: any) => {
    const updated = [...advPayments];
    if (field === 'amount') updated[i].amount = parseFloat(value) || 0;
    else updated[i].mode = value;
    setAdvPayments(updated);
  };

  const removePayment = (i: number) => {
    if (advPayments.length <= 1) return;
    setAdvPayments(advPayments.filter((_, idx) => idx !== i));
  };

  const totalPayment = advPayments.reduce((s, p) => s + p.amount, 0);
  const amt = parseFloat(advAmount) || 0;

  const getNextBillNumber = async () => {
    const { data } = await supabase
      .from('transactions').select('bill_number')
      .eq('type', 'customer_advance').like('bill_number', 'CA%')
      .order('created_at', { ascending: false }).limit(1);
    if (data && data.length > 0 && data[0].bill_number) {
      const num = parseInt(data[0].bill_number.replace('CA', '')) || 0;
      return `CA${String(num + 1).padStart(4, '0')}`;
    }
    return 'CA0001';
  };

  const handleSaveAdvance = async () => {
    if (!advCustomer) { toast.error('Select a customer'); return; }
    if (amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (totalPayment !== amt) { toast.error('Payment total must equal amount'); return; }

    setSaving(true);
    try {
      const billNumber = await getNextBillNumber();
      const validPayments = advPayments.filter(p => p.amount > 0);

      const { error } = await supabase.from('transactions').insert({
        type: 'customer_advance' as string,
        section: 'sale' as string,
        amount: amt,
        payments: validPayments as any,
        customer_id: advCustomer.id,
        customer_name: advCustomer.name,
        advance_purpose_id: advPurposeId || null,
        advance_rate: parseFloat(advRate) || null,
        bill_number: billNumber,
        date: new Date().toISOString().split('T')[0],
      });
      if (error) throw error;

      // Update customer advance_balance
      await supabase.from('customers').update({
        advance_balance: advCustomer.advance_balance + amt
      }).eq('id', advCustomer.id);

      toast.success(`Advance ${billNumber} recorded`);
      setAdvanceOpen(false);
      setSelectedCustomer(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to save advance');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery)
  );

  const filteredAllCustomers = allCustomers.filter(c =>
    advCustomerSearch && c.name.toLowerCase().includes(advCustomerSearch.toLowerCase())
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);

  const getPurposeName = (id: string | null) => {
    if (!id) return 'General';
    return purposes.find(p => p.id === id)?.name || 'Unknown';
  };

  const totalAdvance = customers.reduce((sum, c) => sum + c.advance_balance, 0);

  const purposeTotals = advanceTransactions.reduce((acc, tx) => {
    const pid = tx.advance_purpose_id || 'general';
    acc[pid] = (acc[pid] || 0) + tx.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout title="Customer Advance">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customer Advance</h1>
            <p className="text-sm text-muted-foreground">{customers.length} customers with advance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsServicesOpen(true)} className="gap-2">
              <Wrench className="w-4 h-4" /> Services
            </Button>
            <Button onClick={() => openAddAdvance()} className="gap-2">
              <Plus className="w-4 h-4" /> Add Advance
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-success/10 border border-success/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Advance Balance</p>
              <p className="text-2xl font-bold text-success">{formatCurrency(totalAdvance)}</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Customer List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <UserPlus className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No customers with advance balance</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCustomers.map((customer, index) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => handleSelectCustomer(customer)}>
                    <h3 className="font-semibold text-foreground">{customer.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {customer.phone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-lg font-bold text-success">{formatCurrency(customer.advance_balance)}</p>
                      <p className="text-xs text-muted-foreground">Advance</p>
                    </div>
                    <Button size="sm" onClick={() => openAddAdvance(customer)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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
                <div className="bg-success/10 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Advance Balance</p>
                  <p className="text-xl font-bold text-success">{formatCurrency(selectedCustomer.advance_balance)}</p>
                </div>
                <div className={cn("rounded-xl p-4", selectedCustomer.due_balance > 0 ? "bg-warning/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Due Balance</p>
                  <p className={cn("text-xl font-bold", selectedCustomer.due_balance > 0 ? "text-warning" : "text-muted-foreground")}>
                    {formatCurrency(selectedCustomer.due_balance)}
                  </p>
                </div>
              </div>

              <Button className="w-full gap-2" onClick={() => { setSelectedCustomer(null); openAddAdvance(selectedCustomer); }}>
                <Plus className="w-4 h-4" /> Record New Advance
              </Button>

              {Object.keys(purposeTotals).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Service-wise Summary</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(purposeTotals).map(([pid, total]) => (
                      <div key={pid} className="bg-accent/10 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{getPurposeName(pid === 'general' ? null : pid)}</p>
                        <p className="font-semibold text-accent">{formatCurrency(total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Advance Transactions</h4>
                {advanceTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No advance transactions found</p>
                ) : (
                  <div className="space-y-2">
                    {advanceTransactions.map((tx) => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(tx.date), 'MMM d, yyyy')}
                              {tx.advance_rate ? ` • Rate: ${tx.advance_rate}` : ''}
                            </p>
                            {tx.advance_purpose_id && (
                              <p className="text-xs text-accent flex items-center gap-1">
                                <Wrench className="w-3 h-3" /> {getPurposeName(tx.advance_purpose_id)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {tx.payments && Array.isArray(tx.payments) && tx.payments.map((p: any, i: number) => (
                              <span key={i} className="text-xs px-2 py-0.5 bg-secondary rounded-full capitalize">
                                {p.mode}: ₹{p.amount}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Advance Sheet */}
      <Sheet open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Record Customer Advance</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto max-h-[calc(80vh-150px)]">
            {/* Customer Selection */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Customer</label>
              {advCustomer ? (
                <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-3">
                  <div>
                    <p className="font-medium text-foreground">{advCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">{advCustomer.phone || 'No phone'}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setAdvCustomer(null); setAdvCustomerSearch(''); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    value={advCustomerSearch}
                    onChange={(e) => setAdvCustomerSearch(e.target.value)}
                    placeholder="Search customer..."
                  />
                  {advCustomerSearch && filteredAllCustomers.length > 0 && (
                    <div className="mt-1 border border-border rounded-lg max-h-32 overflow-y-auto">
                      {filteredAllCustomers.slice(0, 5).map(c => (
                        <div
                          key={c.id}
                          onClick={() => { setAdvCustomer(c); setAdvCustomerSearch(c.name); }}
                          className="p-2 hover:bg-secondary/50 cursor-pointer text-sm"
                        >
                          {c.name} {c.phone && `• ${c.phone}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Purpose */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Service / Purpose</label>
              <select
                value={advPurposeId}
                onChange={(e) => setAdvPurposeId(e.target.value)}
                className="w-full h-10 px-3 bg-secondary/50 border border-border rounded-lg text-sm"
              >
                <option value="">General</option>
                {purposes.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Amount & Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Amount</label>
                <Input
                  type="number"
                  value={advAmount}
                  onChange={(e) => {
                    setAdvAmount(e.target.value);
                    const v = parseFloat(e.target.value) || 0;
                    if (advPayments.length === 1) setAdvPayments([{ ...advPayments[0], amount: v }]);
                  }}
                  placeholder="₹ Amount"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Rate (optional)</label>
                <Input type="number" value={advRate} onChange={(e) => setAdvRate(e.target.value)} placeholder="Rate" />
              </div>
            </div>

            {/* Payment Modes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">Payment Modes</label>
                {advPayments.length < 3 && (
                  <Button variant="ghost" size="sm" onClick={addPaymentMode} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Add Mode
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {advPayments.map((p, i) => (
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
                    {advPayments.length > 1 && (
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

          <div className="absolute bottom-6 left-4 right-4">
            <Button
              className="w-full"
              onClick={handleSaveAdvance}
              disabled={saving || amt <= 0 || totalPayment !== amt || !advCustomer}
            >
              {saving ? 'Saving...' : `Record Advance ${amt > 0 ? formatCurrency(amt) : ''}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Services Sheet */}
      <Sheet open={isServicesOpen} onOpenChange={setIsServicesOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Services / Advance Purposes</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto max-h-[calc(70vh-150px)]">
            <div className="flex gap-2 p-3 bg-secondary/30 rounded-xl">
              <Input
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder={editingService ? "Edit service name" : "New service name"}
                className="flex-1"
              />
              <Button onClick={handleSaveService}>{editingService ? 'Update' : 'Add'}</Button>
              {editingService && (
                <Button variant="outline" onClick={() => { setEditingService(null); setNewServiceName(''); }}>Cancel</Button>
              )}
            </div>
            <div className="space-y-2">
              {purposes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No services yet.</p>
              ) : (
                purposes.map((purpose) => (
                  <div key={purpose.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-accent" />
                      <p className="font-medium text-foreground">{purpose.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingService(purpose); setNewServiceName(purpose.name); }}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteService(purpose.id)}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
