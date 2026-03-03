import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Phone, Plus, Edit2, Trash2, Wallet, AlertTriangle, Receipt } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  due_balance: number;
  advance_balance: number;
}

interface CustomerTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  created_at: string;
  bill_number: string | null;
  due: number | null;
  payments: any;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<CustomerTransaction[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDue, setFormDue] = useState('0');

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (!error) setCustomers(data || []);
    setLoading(false);
  };

  const fetchCustomerTransactions = async (customerName: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, created_at, bill_number, due, payments')
      .eq('customer_name', customerName)
      .order('created_at', { ascending: false });
    setCustomerTransactions(data || []);
  };

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    await fetchCustomerTransactions(customer.name);
  };

  const handleSaveCustomer = async () => {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    try {
      if (editCustomer) {
        await supabase.from('customers').update({
          name: formName, phone: formPhone || null, address: formAddress || null,
          due_balance: parseFloat(formDue) || 0,
        }).eq('id', editCustomer.id);
        toast.success('Customer updated');
      } else {
        await supabase.from('customers').insert({
          name: formName, phone: formPhone || null, address: formAddress || null,
          due_balance: parseFloat(formDue) || 0,
        });
        toast.success('Customer added');
      }
      closeForm(); fetchCustomers();
    } catch { toast.error('Failed to save'); }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    toast.success('Deleted');
    fetchCustomers();
    if (selectedCustomer?.id === id) setSelectedCustomer(null);
  };

  const handleEditCustomer = (c: Customer) => {
    setEditCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone || '');
    setFormAddress(c.address || '');
    setFormDue(c.due_balance.toString());
    setIsAddOpen(true);
  };

  const closeForm = () => {
    setIsAddOpen(false); setEditCustomer(null);
    setFormName(''); setFormPhone(''); setFormAddress(''); setFormDue('0');
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  const totalDue = customers.reduce((s, c) => s + c.due_balance, 0);
  const totalAdvance = customers.reduce((s, c) => s + c.advance_balance, 0);

  return (
    <AppLayout title="Customers">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground">{customers.length} customers</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className={cn("border rounded-xl p-4", totalDue > 0 ? "bg-warning/10 border-warning/20" : "bg-secondary/50 border-border")}>
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", totalDue > 0 ? "bg-warning/20" : "bg-secondary")}>
                <AlertTriangle className={cn("w-5 h-5", totalDue > 0 ? "text-warning" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Due</p>
                <p className={cn("text-xl font-bold", totalDue > 0 ? "text-warning" : "text-muted-foreground")}>{formatINR(totalDue)}</p>
              </div>
            </div>
          </div>
          <div className={cn("border rounded-xl p-4", totalAdvance > 0 ? "bg-success/10 border-success/20" : "bg-secondary/50 border-border")}>
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", totalAdvance > 0 ? "bg-success/20" : "bg-secondary")}>
                <Wallet className={cn("w-5 h-5", totalAdvance > 0 ? "text-success" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Advance</p>
                <p className={cn("text-xl font-bold", totalAdvance > 0 ? "text-success" : "text-muted-foreground")}>{formatINR(totalAdvance)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent" />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No customers found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => handleSelectCustomer(c)}>
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {c.due_balance > 0 && <p className="text-sm font-bold text-warning">Due: {formatINR(c.due_balance)}</p>}
                      {c.advance_balance > 0 && <p className="text-sm font-bold text-success">Adv: {formatINR(c.advance_balance)}</p>}
                      {c.due_balance === 0 && c.advance_balance === 0 && <p className="text-sm text-muted-foreground">Clear</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleEditCustomer(c)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteCustomer(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Detail Sheet with bills/payments */}
      <Sheet open={!!selectedCustomer} onOpenChange={open => !open && setSelectedCustomer(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4"><SheetTitle>{selectedCustomer?.name}</SheetTitle></SheetHeader>
          {selectedCustomer && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              <div className="grid grid-cols-2 gap-3">
                <div className={cn("rounded-xl p-3", selectedCustomer.due_balance > 0 ? "bg-warning/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Due Balance</p>
                  <p className={cn("text-lg font-bold", selectedCustomer.due_balance > 0 ? "text-warning" : "text-muted-foreground")}>
                    {formatINR(selectedCustomer.due_balance)}
                  </p>
                </div>
                <div className={cn("rounded-xl p-3", selectedCustomer.advance_balance > 0 ? "bg-success/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Advance</p>
                  <p className={cn("text-lg font-bold", selectedCustomer.advance_balance > 0 ? "text-success" : "text-muted-foreground")}>
                    {formatINR(selectedCustomer.advance_balance)}
                  </p>
                </div>
              </div>
              {selectedCustomer.phone && (
                <div className="bg-secondary/30 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-muted-foreground" />{selectedCustomer.phone}</div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Bills & Payments</h4>
                {customerTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions</p>
                ) : (
                  <div className="space-y-2">
                    {customerTransactions.map(tx => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium capitalize">
                              {tx.type.replace(/_/g, ' ')}
                            </span>
                            {tx.bill_number && <span className="text-xs text-accent font-medium">{tx.bill_number}</span>}
                          </div>
                          <p className="font-medium text-foreground mt-1">{formatINR(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.created_at), 'dd MMM yyyy')}</p>
                        </div>
                        <div className="text-right">
                          {tx.due != null && tx.due > 0 && (
                            <p className="text-sm font-bold text-warning">Due: {formatINR(tx.due)}</p>
                          )}
                          {tx.payments && Array.isArray(tx.payments) && tx.payments.map((p: any, i: number) => (
                            <p key={i} className="text-xs text-muted-foreground capitalize">{p.mode}: {formatINR(p.amount)}</p>
                          ))}
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

      {/* Add/Edit Sheet */}
      <Sheet open={isAddOpen} onOpenChange={open => { if (!open) closeForm(); }}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl">
          <SheetHeader className="mb-4"><SheetTitle>{editCustomer ? 'Edit Customer' : 'Add Customer'}</SheetTitle></SheetHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Name *</label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Customer name" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Phone</label><Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Mobile number" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Address</label><Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Address" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Previous Due</label><Input type="number" value={formDue} onChange={e => setFormDue(e.target.value)} placeholder="0" className="mt-1" /></div>
            <Button onClick={handleSaveCustomer} className="w-full">{editCustomer ? 'Update' : 'Add Customer'}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
