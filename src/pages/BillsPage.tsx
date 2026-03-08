import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Search, Phone, MapPin, AlertCircle, CreditCard, ChevronDown, Wallet, Package, Edit2, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface BillItem {
  id: string;
  item_name: string;
  primary_quantity: number;
  secondary_quantity: number;
  rate: number;
  total_amount: number;
}

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
  advance_purpose?: string;
  source: 'bill' | 'transaction';
  items?: BillItem[];
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    due_balance: number;
    advance_balance: number;
  } | null;
  supplier?: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    balance: number;
  } | null;
}

export default function BillsPage() {
  const navigate = useNavigate();
  const [bills, setBills] = useState<BillWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'purchase' | 'due' | 'advance'>('all');
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillWithCustomer | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

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

      // Fetch all transactions (used to enrich bill rows with due/advance/etc + show non-bill transactions)
      const { data: transactionsData, error: txError } = await supabase
        .from('transactions')
        .select('id, bill_number, customer_id, customer_name, supplier_id, supplier_name, amount, due, created_at, type, section, adjusted_from_sales, advance_rate, advance_purpose_id, payments')
        .order('created_at', { ascending: false });

      if (billsError) throw billsError;
      if (txError) throw txError;

      const txMap = new Map<string, any>();
      (transactionsData || []).forEach((tx) => txMap.set(tx.id, tx));

      // Advance purposes lookup
      const { data: purposesData } = await supabase
        .from('advance_purposes')
        .select('id, name')
        .order('name');
      const purposeMap = new Map<string, string>();
      (purposesData || []).forEach((p) => purposeMap.set(p.id, p.name));

      const getAdvanceUsed = (paymentsRaw: any): number => {
        if (!Array.isArray(paymentsRaw)) return 0;
        return paymentsRaw
          .filter((p) => p?.mode === 'advance')
          .reduce((sum, p) => sum + Number(p?.amount || 0), 0);
      };

      // Bills already linked to transactions
      const billTransactionIds = new Set((billsData || []).map((b) => b.transaction_id).filter(Boolean));

      // Merge bills from bills table, enriched by the linked transaction
      const allBills: BillWithCustomer[] = (billsData || []).map((bill) => {
        const tx = bill.transaction_id ? txMap.get(bill.transaction_id) : null;
        const advanceUsed = tx ? getAdvanceUsed(tx.payments) : 0;

        return {
          id: bill.id,
          bill_number: bill.bill_number,
          bill_type: bill.bill_type,
          customer_name: bill.customer_name,
          supplier_name: bill.supplier_name,
          total_amount: Number(bill.total_amount),
          created_at: bill.created_at,
          transaction_id: bill.transaction_id,
          due_amount: tx?.due ? Number(tx.due) : undefined,
          adjusted_from_sales: tx?.adjusted_from_sales ? Number(tx.adjusted_from_sales) : undefined,
          advance_used: advanceUsed > 0 ? advanceUsed : undefined,
          advance_purpose: tx?.advance_purpose_id ? purposeMap.get(tx.advance_purpose_id) : undefined,
          source: 'bill' as const,
        };
      });

      // Add transactions that don't have bills yet (including dues, advances, balance paid, purchase payments etc.)
      if (transactionsData) {
        const existingBillNumbers = new Set(allBills.map((b) => b.bill_number));

        transactionsData.forEach((tx) => {
          // Skip if this transaction already has a bill
          if (tx.bill_number && existingBillNumbers.has(tx.bill_number)) return;
          if (billTransactionIds.has(tx.id)) return;

          const hasDue = tx.due && Number(tx.due) > 0;
          const advanceUsed = getAdvanceUsed(tx.payments);

          // Keep it broad: if it has bill_number OR meaningful financial flags, show it
          if (tx.bill_number || hasDue || tx.type === 'customer_advance' || tx.type === 'balance_paid' || tx.type?.startsWith('purchase_')) {
            allBills.push({
              id: tx.id,
              bill_number: tx.bill_number || `TX-${tx.id.slice(0, 8)}`,
              bill_type: tx.type,
              customer_name: tx.customer_name,
              supplier_name: tx.supplier_name,
              total_amount: Number(tx.amount),
              created_at: tx.created_at,
              transaction_id: tx.id,
              due_amount: hasDue ? Number(tx.due) : undefined,
              adjusted_from_sales: tx.adjusted_from_sales ? Number(tx.adjusted_from_sales) : undefined,
              advance_used: advanceUsed > 0 ? advanceUsed : undefined,
              advance_purpose: tx.advance_purpose_id ? purposeMap.get(tx.advance_purpose_id) : undefined,
              source: 'transaction' as const,
            });
          }
        });
      }

      // Fetch customer/supplier details for each bill
      const billsWithPeople = await Promise.all(
        allBills.map(async (bill) => {
          if (bill.customer_name) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('id, name, phone, address, due_balance, advance_balance')
              .eq('name', bill.customer_name)
              .limit(1)
              .maybeSingle();
            return { ...bill, customer: customerData, supplier: null };
          }

          if (bill.supplier_name) {
            const { data: supplierData } = await supabase
              .from('suppliers')
              .select('id, name, phone, address, balance')
              .eq('name', bill.supplier_name)
              .limit(1)
              .maybeSingle();
            return { ...bill, customer: null, supplier: supplierData };
          }

          return { ...bill, customer: null, supplier: null };
        })
      );

      setBills(billsWithPeople);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBillItems = async (billId: string) => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('bill_items')
        .select('*')
        .eq('bill_id', billId);
      
      if (error) throw error;
      setBillItems(data || []);
    } catch (error) {
      console.error('Error fetching bill items:', error);
      setBillItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleOpenBill = async (bill: BillWithCustomer) => {
    setSelectedBill(bill);
    if (bill.source === 'bill') {
      await fetchBillItems(bill.id);
    } else {
      setBillItems([]);
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
      matchesFilter = (!!bill.customer_name && !bill.supplier_name) || 
                      bill.bill_type === 'sale' || 
                      bill.bill_number?.startsWith('S');
    } else if (filterType === 'purchase') {
      matchesFilter = !!bill.supplier_name || 
                      bill.bill_type === 'purchase_bill' || 
                      bill.bill_number?.startsWith('PB');
    } else if (filterType === 'due') {
      matchesFilter = (bill.due_amount && bill.due_amount > 0) || 
                     (bill.customer?.due_balance && bill.customer.due_balance > 0);
    } else if (filterType === 'advance') {
      matchesFilter = bill.bill_type === 'customer_advance' || 
                      bill.bill_number?.startsWith('CA') ||
                      (bill.customer?.advance_balance && bill.customer.advance_balance > 0);
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

  const getBillTypeLabel = (prefix: string, billType?: string | null) => {
    if (billType === 'customer_advance') return 'Advance';
    switch (prefix) {
      case 'S': return 'Sale';
      case 'SR': return 'Sales Return';
      case 'BP': return 'Balance Paid';
      case 'CA': return 'Advance';
      case 'PB': return 'Purchase Bill';
      case 'PR': return 'Purchase Return';
      case 'PP': return 'Purchase Payment';
      default: return 'Transaction';
    }
  };

  const getBillTypeColor = (prefix: string, billType?: string | null) => {
    if (billType === 'customer_advance') return 'bg-accent/10 text-accent';
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
            {(['all', 'sale', 'purchase', 'due', 'advance'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                  filterType === type
                    ? type === 'due' 
                      ? "bg-warning text-warning-foreground"
                      : type === 'advance'
                      ? "bg-accent text-accent-foreground"
                      : "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                )}
              >
                {type === 'due' ? 'Due Bills' : type === 'advance' ? 'Advance' : type.charAt(0).toUpperCase() + type.slice(1)}
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
              const isAdvanceBill = bill.bill_type === 'customer_advance' || prefix === 'CA';
              
              return (
                <motion.div
                  key={bill.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "bg-card border rounded-xl overflow-hidden",
                    hasDue ? "border-warning/50" : isAdvanceBill ? "border-accent/50" : "border-border"
                  )}
                >
                  {/* Main Row - Clickable to open details */}
                  <div 
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleOpenBill(bill)}
                  >
                    {/* Bill Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", getBillTypeColor(prefix, bill.bill_type))}>
                          {getBillTypeLabel(prefix, bill.bill_type)}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedBill(isExpanded ? null : bill.id);
                      }}
                      className="cursor-pointer p-2 hover:bg-secondary rounded-lg"
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

      {/* Bill Details Sheet */}
      <Sheet open={!!selectedBill} onOpenChange={(open) => { if (!open) setSelectedBill(null); }}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 bg-background">
          <div className="flex flex-col h-full">
            <SheetHeader className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-semibold">Bill Details</SheetTitle>
                {selectedBill && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const billDate = new Date(selectedBill.created_at);
                        setSelectedBill(null);
                        navigate('/', { state: { date: billDate.toISOString(), editTransactionId: selectedBill.transaction_id } });
                      }}
                      className="gap-2"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (!confirm('Delete this bill permanently?')) return;
                        try {
                          if (selectedBill.source === 'bill') {
                            await supabase.from('bill_items').delete().eq('bill_id', selectedBill.id);
                            await supabase.from('bills').delete().eq('id', selectedBill.id);
                          }
                          if (selectedBill.transaction_id) {
                            await supabase.from('transactions').delete().eq('id', selectedBill.transaction_id);
                          }
                          toast.success('Bill deleted');
                          setSelectedBill(null);
                          fetchBills();
                        } catch { toast.error('Failed to delete'); }
                      }}
                      className="gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </SheetHeader>

            {selectedBill && (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Bill Info */}
                <div className="bg-secondary/30 rounded-xl p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Bill Number</p>
                      <p className="font-medium text-foreground">{selectedBill.bill_number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="font-medium text-foreground">
                        {format(new Date(selectedBill.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {selectedBill.customer_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Customer</p>
                        <p className="font-medium text-foreground">{selectedBill.customer_name}</p>
                      </div>
                    )}
                    {selectedBill.supplier_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Supplier</p>
                        <p className="font-medium text-foreground">{selectedBill.supplier_name}</p>
                      </div>
                    )}
                    {selectedBill.due_amount && selectedBill.due_amount > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Due Amount</p>
                        <p className="font-medium text-warning">{formatCurrency(selectedBill.due_amount)}</p>
                      </div>
                    )}
                    {selectedBill.adjusted_from_sales && selectedBill.adjusted_from_sales > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Adjusted from Sales</p>
                        <p className="font-medium text-info">{formatCurrency(selectedBill.adjusted_from_sales)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Balance Info */}
                {selectedBill.customer && (
                  <div className="bg-secondary/30 rounded-xl p-4 mb-4">
                    <h4 className="text-sm font-medium text-foreground mb-3">Customer Balance</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className={cn("p-3 rounded-lg", selectedBill.customer.due_balance > 0 ? "bg-warning/10" : "bg-success/10")}>
                        <p className="text-xs text-muted-foreground">Due Balance</p>
                        <p className={cn("font-bold text-lg", selectedBill.customer.due_balance > 0 ? "text-warning" : "text-success")}>
                          {formatCurrency(selectedBill.customer.due_balance)}
                        </p>
                      </div>
                      <div className={cn("p-3 rounded-lg", selectedBill.customer.advance_balance > 0 ? "bg-success/10" : "bg-secondary/50")}>
                        <p className="text-xs text-muted-foreground">Advance Balance</p>
                        <p className={cn("font-bold text-lg", selectedBill.customer.advance_balance > 0 ? "text-success" : "text-muted-foreground")}>
                          {formatCurrency(selectedBill.customer.advance_balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bill Items */}
                {loadingItems ? (
                  <div className="text-center py-8 text-muted-foreground">Loading items...</div>
                ) : billItems.length > 0 ? (
                  <div className="bg-secondary/30 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 p-3 bg-secondary/50 text-xs font-medium text-muted-foreground">
                      <div className="col-span-4">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-3 text-right">Rate</div>
                      <div className="col-span-3 text-right">Total</div>
                    </div>
                    {billItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 p-3 border-t border-border/50 text-sm">
                        <div className="col-span-4 font-medium text-foreground flex items-center gap-1">
                          <Package className="w-3 h-3 text-muted-foreground" />
                          {item.item_name}
                        </div>
                        <div className="col-span-2 text-center text-muted-foreground">
                          {item.primary_quantity}
                          {item.secondary_quantity > 0 && ` / ${item.secondary_quantity}`}
                        </div>
                        <div className="col-span-3 text-right text-muted-foreground">{formatCurrency(item.rate)}</div>
                        <div className="col-span-3 text-right font-medium text-foreground">{formatCurrency(item.total_amount)}</div>
                      </div>
                    ))}
                  </div>
                ) : selectedBill.source === 'transaction' ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No item details available for this transaction</p>
                  </div>
                ) : null}

                {/* Total */}
                <div className="mt-4 bg-accent/10 rounded-xl p-4 flex justify-between items-center">
                  <span className="font-medium text-foreground">Total Amount</span>
                  <span className="text-2xl font-bold text-accent">{formatCurrency(selectedBill.total_amount)}</span>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}