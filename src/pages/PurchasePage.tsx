import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Package, Truck, Plus, Receipt, ArrowDownLeft, CreditCard, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface PurchaseTransaction {
  id: string;
  bill_number: string | null;
  supplier_name: string | null;
  amount: number;
  type: string;
  created_at: string;
  date: string;
  payments: any;
  reference: string | null;
}

interface BillItem {
  id: string;
  item_name: string;
  primary_quantity: number;
  secondary_quantity: number;
  rate: number;
  total_amount: number;
}

interface PurchaseWithItems extends PurchaseTransaction {
  items: BillItem[];
}

export default function PurchasePage() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<PurchaseWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'bill' | 'payment' | 'return'>('all');
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseWithItems | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const { data: transactionData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('section', 'purchase')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch items for each purchase bill
      const purchasesWithItems: PurchaseWithItems[] = await Promise.all(
        (transactionData || []).map(async (purchase) => {
          let items: BillItem[] = [];
          
          if (purchase.bill_number && (purchase.type === 'purchase_bill' || purchase.type === 'purchase_delivered')) {
            const { data: billData } = await supabase
              .from('bills')
              .select('id')
              .eq('bill_number', purchase.bill_number)
              .maybeSingle();
            
            if (billData) {
              const { data: itemsData } = await supabase
                .from('bill_items')
                .select('*')
                .eq('bill_id', billData.id);
              
              items = itemsData || [];
            }
          }
          
          return { ...purchase, items };
        })
      );
      
      setPurchases(purchasesWithItems);
    } catch (error) {
      console.error('Error fetching purchases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPurchase = (purchase: PurchaseWithItems) => {
    setSelectedPurchase(purchase);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId(expandedId === id ? null : id);
  };

  const filteredPurchases = purchases.filter(p => {
    const matchesSearch = 
      p.bill_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.items.some(item => item.item_name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    let matchesFilter = true;
    if (filterType === 'bill') {
      matchesFilter = p.type === 'purchase_bill' || p.type === 'purchase_delivered';
    } else if (filterType === 'payment') {
      matchesFilter = p.type === 'purchase_payment';
    } else if (filterType === 'return') {
      matchesFilter = p.type === 'purchase_return';
    }
    
    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'purchase_bill': return 'Purchase Bill';
      case 'purchase_delivered': return 'Delivered';
      case 'purchase_return': return 'Return';
      case 'purchase_payment': return 'Payment';
      case 'purchase_expenses': return 'Expenses';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'purchase_bill': return 'bg-destructive/10 text-destructive';
      case 'purchase_delivered': return 'bg-info/10 text-info';
      case 'purchase_return': return 'bg-warning/10 text-warning';
      case 'purchase_payment': return 'bg-success/10 text-success';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  const totalPurchases = purchases
    .filter(p => p.type === 'purchase_bill' || p.type === 'purchase_delivered')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const totalPayments = purchases
    .filter(p => p.type === 'purchase_payment')
    .reduce((sum, p) => sum + p.amount, 0);

  const handleAddPurchase = (type: string) => {
    navigate('/', { state: { date: new Date().toISOString() } });
  };

  return (
    <AppLayout title="Purchase">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Purchase</h1>
            <p className="text-sm text-muted-foreground">{purchases.length} transactions</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleAddPurchase('purchase_bill')} className="gap-2">
              <Plus className="w-4 h-4" />
              New Bill
            </Button>
            <Button variant="outline" onClick={() => handleAddPurchase('purchase_payment')} className="gap-2">
              <Wallet className="w-4 h-4" />
              Payment
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="w-4 h-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Total Purchases</span>
            </div>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totalPurchases)}</p>
          </div>
          <div className="bg-success/10 border border-success/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-success" />
              <span className="text-xs text-muted-foreground">Total Paid</span>
            </div>
            <p className="text-xl font-bold text-success">{formatCurrency(totalPayments)}</p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bill number, supplier, item..."
              className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'bill', 'payment', 'return'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                  filterType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                )}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Purchase List with Items */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-secondary/50 animate-pulse" />
            ))}
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No purchases found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPurchases.map((purchase, index) => (
              <motion.div
                key={purchase.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Main Purchase Info */}
                <div 
                  onClick={() => handleSelectPurchase(purchase)}
                  className="p-4 cursor-pointer hover:bg-secondary/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", getTypeColor(purchase.type))}>
                          {getTypeLabel(purchase.type)}
                        </span>
                        {purchase.bill_number && (
                          <span className="text-sm font-medium text-foreground">{purchase.bill_number}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {purchase.supplier_name && (
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {purchase.supplier_name}
                          </span>
                        )}
                        {purchase.reference && (
                          <span className="text-xs">• {purchase.reference}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(purchase.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(purchase.created_at), 'dd MMM')}
                        </p>
                      </div>
                      {purchase.items.length > 0 && (
                        <button
                          onClick={(e) => toggleExpand(purchase.id, e)}
                          className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          {expandedId === purchase.id ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Items Preview - Always show count */}
                  {purchase.items.length > 0 && expandedId !== purchase.id && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Package className="w-3 h-3" />
                      <span>{purchase.items.length} items</span>
                      <span className="text-foreground/70">
                        ({purchase.items.slice(0, 3).map(i => i.item_name).join(', ')}
                        {purchase.items.length > 3 ? '...' : ''})
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded Items List */}
                <AnimatePresence>
                  {expandedId === purchase.id && purchase.items.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-border bg-secondary/20"
                    >
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                          <Package className="w-3 h-3" />
                          Items ({purchase.items.length})
                        </div>
                        <div className="space-y-2">
                          {purchase.items.map((item) => (
                            <div 
                              key={item.id} 
                              className="flex items-center justify-between py-2 px-3 bg-background rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-sm text-foreground">{item.item_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.primary_quantity} pcs {item.secondary_quantity > 0 && `+ ${item.secondary_quantity}`} @ {formatCurrency(item.rate)}
                                </p>
                              </div>
                              <p className="font-medium text-sm">{formatCurrency(item.total_amount)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Detail Sheet */}
      <Sheet open={!!selectedPurchase} onOpenChange={(open) => !open && setSelectedPurchase(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{selectedPurchase?.bill_number || 'Purchase Details'}</SheetTitle>
          </SheetHeader>
          
          {selectedPurchase && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              {/* Basic Info */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium">{getTypeLabel(selectedPurchase.type)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedPurchase.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  {selectedPurchase.supplier_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Supplier</p>
                      <p className="font-medium">{selectedPurchase.supplier_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedPurchase.amount)}</p>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              {selectedPurchase.payments && Array.isArray(selectedPurchase.payments) && selectedPurchase.payments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Payments</h4>
                  <div className="bg-secondary/30 rounded-xl overflow-hidden">
                    {selectedPurchase.payments.map((payment: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 border-b border-border/50 last:border-b-0">
                        <span className="capitalize text-muted-foreground">{payment.mode}</span>
                        <span className="font-medium">{formatCurrency(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bill Items */}
              {selectedPurchase.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Items ({selectedPurchase.items.length})</h4>
                  <div className="bg-secondary/30 rounded-xl overflow-hidden">
                    {selectedPurchase.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border-b border-border/50 last:border-b-0">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.primary_quantity} pcs {item.secondary_quantity > 0 && `+ ${item.secondary_quantity}`} @ {formatCurrency(item.rate)}
                            </p>
                          </div>
                        </div>
                        <p className="font-medium">{formatCurrency(item.total_amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
