import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Search, Phone, MapPin, Plus, CreditCard, ArrowUpRight, Settings, Edit2, Wrench } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

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

export default function CustomerAdvancePage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [advanceTransactions, setAdvanceTransactions] = useState<AdvanceTransaction[]>([]);
  const [purposes, setPurposes] = useState<AdvancePurpose[]>([]);
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [editingService, setEditingService] = useState<AdvancePurpose | null>(null);

  useEffect(() => {
    fetchCustomers();
    fetchPurposes();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .gt('advance_balance', 0)
        .order('name');
      
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPurposes = async () => {
    const { data } = await supabase
      .from('advance_purposes')
      .select('id, name')
      .order('name');
    setPurposes(data || []);
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

  const handleSaveService = async () => {
    if (!newServiceName.trim()) {
      toast.error('Service name is required');
      return;
    }

    try {
      if (editingService) {
        const { error } = await supabase
          .from('advance_purposes')
          .update({ name: newServiceName.trim() })
          .eq('id', editingService.id);
        
        if (error) throw error;
        toast.success('Service updated');
      } else {
        const { error } = await supabase
          .from('advance_purposes')
          .insert({ name: newServiceName.trim() });
        
        if (error) throw error;
        toast.success('Service added');
      }
      
      setNewServiceName('');
      setEditingService(null);
      fetchPurposes();
    } catch (error) {
      console.error('Error saving service:', error);
      toast.error('Failed to save service');
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    const { error } = await supabase.from('advance_purposes').delete().eq('id', id);
    if (error) {
      toast.error('Cannot delete - may be in use');
    } else {
      toast.success('Service deleted');
      fetchPurposes();
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getPurposeName = (id: string | null) => {
    if (!id) return 'General';
    return purposes.find(p => p.id === id)?.name || 'Unknown';
  };

  const totalAdvance = customers.reduce((sum, c) => sum + c.advance_balance, 0);

  // Group transactions by purpose
  const purposeTotals = advanceTransactions.reduce((acc, tx) => {
    const purposeId = tx.advance_purpose_id || 'general';
    acc[purposeId] = (acc[purposeId] || 0) + tx.amount;
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
              <Wrench className="w-4 h-4" />
              Services
            </Button>
            <Button 
              onClick={() => navigate('/', { state: { openTransaction: true, section: 'sale', type: 'customer_advance' } })}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Advance
            </Button>
          </div>
        </div>

        {/* Summary Card */}
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
                onClick={() => handleSelectCustomer(customer)}
                className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{customer.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {customer.phone}
                        </span>
                      )}
                      {customer.address && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3" />
                          {customer.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-success">{formatCurrency(customer.advance_balance)}</p>
                    <p className="text-xs text-muted-foreground">Advance</p>
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
              {/* Balance Summary */}
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

              {/* Contact Info */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Contact Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedCustomer.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedCustomer.address || 'No address'}</span>
                  </div>
                </div>
              </div>

              {/* Service-wise Summary */}
              {Object.keys(purposeTotals).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Service-wise Summary</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(purposeTotals).map(([purposeId, total]) => (
                      <div key={purposeId} className="bg-accent/10 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{getPurposeName(purposeId === 'general' ? null : purposeId)}</p>
                        <p className="font-semibold text-accent">{formatCurrency(total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advance Transactions */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Advance Transactions</h4>
                {advanceTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No advance transactions found</p>
                ) : (
                  <div className="space-y-2">
                    {advanceTransactions.map((tx) => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.date), 'MMM d, yyyy')}
                            {tx.advance_rate && ` • Rate: ${tx.advance_rate}`}
                          </p>
                          {tx.advance_purpose_id && (
                            <p className="text-xs text-accent flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              {getPurposeName(tx.advance_purpose_id)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {tx.payments && Array.isArray(tx.payments) && tx.payments.map((p: any, i: number) => (
                            <span key={i} className="text-xs px-2 py-1 bg-secondary rounded-full capitalize">
                              {p.mode}: ₹{p.amount}
                            </span>
                          ))}
                          <ArrowUpRight className="w-4 h-4 text-success" />
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

      {/* Services (Advance Purposes) Sheet */}
      <Sheet open={isServicesOpen} onOpenChange={setIsServicesOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Services / Advance Purposes</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4 overflow-y-auto max-h-[calc(70vh-150px)]">
            {/* Add/Edit Service */}
            <div className="flex gap-2 p-3 bg-secondary/30 rounded-xl">
              <Input
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder={editingService ? "Edit service name" : "New service (e.g., Hole, Welding, Leveling)"}
                className="flex-1"
              />
              <Button onClick={handleSaveService}>
                {editingService ? 'Update' : 'Add'}
              </Button>
              {editingService && (
                <Button variant="outline" onClick={() => { setEditingService(null); setNewServiceName(''); }}>
                  Cancel
                </Button>
              )}
            </div>

            {/* Info */}
            <p className="text-xs text-muted-foreground px-1">
              Services are used to categorize customer advances. Common examples: Hole, Welding, Leveling, Cutting, etc.
            </p>

            {/* Service List */}
            <div className="space-y-2">
              {purposes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No services yet. Add one above.</p>
              ) : (
                purposes.map((purpose) => (
                  <div key={purpose.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-accent" />
                      <p className="font-medium text-foreground">{purpose.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingService(purpose);
                          setNewServiceName(purpose.name);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
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
