import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Search, Phone, MapPin, AlertCircle, CreditCard, ChevronDown, Wallet } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface BillWithCustomer {
  id: string;
  bill_number: string | null;
  bill_type: string | null;
  customer_name: string | null;
  supplier_name: string | null;
  total_amount: number;
  created_at: string;
  transaction_id: string | null;
  due_amount?: number;
  advance_used?: number;
  adjusted_from_sales?: number;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    due_balance: number;
    advance_balance: number;
  } | null;
}

export default function BillsPage() {
  const [bills, setBills] = useState<BillWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'purchase' | 'due'>('all');
  const [expandedBill, setExpandedBill] = useState<string | null>(null);

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    setLoading(true);
    try {
      // Fetch bills from bills table
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch all transactions to get bill info
      const { data: transactionsData, error: txError } = await supabase
        .from('transactions')
        .select('id, bill_number, customer_name, supplier_name, amount, due, created_at, type, adjusted_from_sales')
        .order('created_at', { ascending: false });

      if (billsError) throw billsError;

      // Create a map of transaction IDs to bills
      const billTransactionIds = new Set((billsData || []).map(b => b.transaction_id).filter(Boolean));

      // Merge bills from bills table
      const allBills: BillWithCustomer[] = (billsData || []).map(bill => ({
        id: bill.id,
        bill_number: bill.bill_number,
        bill_type: bill.bill_type,
        customer_name: bill.customer_name,
        supplier_name: bill.supplier_name,
        total_amount: Number(bill.total_amount),
        created_at: bill.created_at,
        transaction_id: bill.transaction_id,
      }));

      // Add transactions that don't have bills yet (including those with dues)
      if (transactionsData) {
        const existingBillNumbers = new Set(allBills.map(b => b.bill_number));
        
        transactionsData.forEach(tx => {
          // Skip if this transaction already has a bill
          if (tx.bill_number && existingBillNumbers.has(tx.bill_number)) return;
          if (billTransactionIds.has(tx.id)) return;
          
          // Add transaction as a bill entry
          if (tx.bill_number) {
            allBills.push({
              id: tx.id,
              bill_number: tx.bill_number,
              bill_type: tx.type,
              customer_name: tx.customer_name,
              supplier_name: tx.supplier_name,
              total_amount: Number(tx.amount),
              created_at: tx.created_at,
              transaction_id: tx.id,
              due_amount: tx.due ? Number(tx.due) : undefined,
              adjusted_from_sales: tx.adjusted_from_sales ? Number(tx.adjusted_from_sales) : undefined,
            });
          }
        });
      }

      // Fetch customer details for each bill
      const billsWithCustomers = await Promise.all(
        allBills.map(async (bill) => {
          if (bill.customer_name) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('id, name, phone, address, due_balance, advance_balance')
              .eq('name', bill.customer_name)
              .limit(1)
              .maybeSingle();
            return { ...bill, customer: customerData };
          }
          return { ...bill, customer: null };
        })
      );

      setBills(billsWithCustomers);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBills = bills.filter(bill => {
    // Search filter - check name, phone, bill number
    const matchesSearch = 
      bill.bill_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.customer?.phone?.includes(searchQuery);
    
    // Type filter
    let matchesFilter = true;
    if (filterType === 'sale') {
      matchesFilter = !!bill.customer_name && !bill.supplier_name;
    } else if (filterType === 'purchase') {
      matchesFilter = !!bill.supplier_name;
    } else if (filterType === 'due') {
      matchesFilter = (bill.due_amount && bill.due_amount > 0) || 
                     (bill.customer?.due_balance && bill.customer.due_balance > 0);
    }

    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getBillPrefix = (billNumber: string | null) => {
    if (!billNumber) return '';
    const prefix = billNumber.match(/^[A-Z]+/)?.[0] || '';
    return prefix;
  };

  const getBillTypeLabel = (prefix: string) => {
    switch (prefix) {
      case 'S': return 'Sale';
      case 'SR': return 'Sales Return';
      case 'BP': return 'Balance Paid';
      case 'CA': return 'Customer Advance';
      case 'PB': return 'Purchase Bill';
      case 'PR': return 'Purchase Return';
      case 'PP': return 'Purchase Payment';
      default: return 'Transaction';
    }
  };

  const getBillTypeColor = (prefix: string) => {
    switch (prefix) {
      case 'S': return 'bg-success/10 text-success';
      case 'SR': return 'bg-warning/10 text-warning';
      case 'BP': return 'bg-info/10 text-info';
      case 'CA': return 'bg-accent/10 text-accent';
      case 'PB': return 'bg-destructive/10 text-destructive';
      case 'PR': return 'bg-warning/10 text-warning';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  // Calculate totals
  const totalDue = bills.reduce((sum, b) => sum + (b.due_amount || 0), 0);
  const totalAdvance = bills.reduce((sum, b) => sum + (b.customer?.advance_balance || 0), 0);
  const totalAdjusted = bills.reduce((sum, b) => sum + (b.adjusted_from_sales || 0), 0);

  return (
    <AppLayout title="Bills">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bills</h1>
            <p className="text-sm text-muted-foreground">{bills.length} total bills</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-warning" />
              <span className="text-xs font-medium text-warning">Due</span>
            </div>
            <p className="text-lg font-bold text-warning">{formatCurrency(totalDue)}</p>
          </div>
          <div className="bg-success/10 border border-success/20 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-success" />
              <span className="text-xs font-medium text-success">Advance</span>
            </div>
            <p className="text-lg font-bold text-success">{formatCurrency(totalAdvance)}</p>
          </div>
          <div className="bg-info/10 border border-info/20 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-info" />
              <span className="text-xs font-medium text-info">Adjusted</span>
            </div>
            <p className="text-lg font-bold text-info">{formatCurrency(totalAdjusted)}</p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bill number, name, or phone..."
              className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['all', 'sale', 'purchase', 'due'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                  filterType === type
                    ? type === 'due' 
                      ? "bg-warning text-warning-foreground"
                      : "bg-accent text-accent-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                )}
              >
                {type === 'due' ? 'Due Bills' : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Bills List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading bills...</div>
        ) : filteredBills.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No bills found</p>
            {filterType === 'due' && (
              <p className="text-sm text-muted-foreground mt-1">No pending dues</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBills.map((bill, index) => {
              const prefix = getBillPrefix(bill.bill_number);
              const isExpanded = expandedBill === bill.id;
              const hasDue = bill.due_amount && bill.due_amount > 0;
              const hasAdvance = bill.customer?.advance_balance && bill.customer.advance_balance > 0;
              
              return (
                <motion.div
                  key={bill.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "bg-card border rounded-xl overflow-hidden",
                    hasDue ? "border-warning/50" : "border-border"
                  )}
                >
                  {/* Main Row */}
                  <div 
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpandedBill(isExpanded ? null : bill.id)}
                  >
                    {/* Bill Number */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", getBillTypeColor(prefix))}>
                          {getBillTypeLabel(prefix)}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{bill.bill_number}</span>
                        {hasDue && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                            Due: {formatCurrency(bill.due_amount || 0)}
                          </span>
                        )}
                        {bill.adjusted_from_sales && bill.adjusted_from_sales > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-info/20 text-info font-medium">
                            Adj: {formatCurrency(bill.adjusted_from_sales)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate">
                          {bill.customer_name || bill.supplier_name || 'Unknown'}
                        </span>
                        {bill.customer?.phone && (
                          <span className="flex items-center gap-1 text-xs">
                            <Phone className="w-3 h-3" />
                            {bill.customer.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount & Date */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-foreground">{formatCurrency(bill.total_amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(bill.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>

                    {/* Expand Icon */}
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    </motion.div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && bill.customer && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border bg-secondary/20 px-4 py-3"
                    >
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">Customer Details</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{bill.customer.phone || 'No phone'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="truncate">{bill.customer.address || 'No address'}</span>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-3 pt-3 border-t border-border/50">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Due</p>
                          <p className={cn("font-medium", bill.customer.due_balance > 0 ? "text-warning" : "text-success")}>
                            {formatCurrency(bill.customer.due_balance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Advance Balance</p>
                          <p className={cn("font-medium", hasAdvance ? "text-success" : "text-muted-foreground")}>
                            {formatCurrency(bill.customer.advance_balance)}
                          </p>
                        </div>
                      </div>
                      {hasAdvance && (
                        <div className="mt-3 p-2 bg-success/10 rounded-lg text-xs text-success">
                          Customer has advance balance available for use in sales
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
