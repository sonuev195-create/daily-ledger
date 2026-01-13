import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Search, Phone, AlertCircle, CheckCircle, ArrowDownRight, Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  advance_balance: number;
  due_balance: number;
}

interface BalanceTransaction {
  id: string;
  amount: number;
  created_at: string;
  payments: any;
}

export default function BalancePaidPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [balanceTransactions, setBalanceTransactions] = useState<BalanceTransaction[]>([]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .gt('due_balance', 0)
        .order('due_balance', { ascending: false });
      
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
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

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    await fetchBalanceTransactions(customer.name);
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

  const totalDue = customers.reduce((sum, c) => sum + c.due_balance, 0);

  return (
    <AppLayout title="Balance Paid">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Due Balances</h1>
            <p className="text-sm text-muted-foreground">{customers.length} customers with dues</p>
          </div>
          <Button 
            onClick={() => navigate('/', { state: { openTransaction: true, section: 'sale', type: 'balance_paid' } })}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Record Payment
          </Button>
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
                onClick={() => handleSelectCustomer(customer)}
                className="bg-card border border-warning/30 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all"
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
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-warning">{formatCurrency(customer.due_balance)}</p>
                    <p className="text-xs text-muted-foreground">Due</p>
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

              {/* Balance Payment History */}
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
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.created_at), 'MMM d, yyyy')}
                          </p>
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
    </AppLayout>
  );
}
