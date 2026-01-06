import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Truck, Search, Phone, MapPin, Plus, Edit2, CreditCard, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
}

interface SupplierTransaction {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  bill_number: string | null;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupplierTransactions = async (supplierName: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, created_at, bill_number')
      .eq('supplier_name', supplierName)
      .order('created_at', { ascending: false })
      .limit(20);
    
    setSupplierTransactions(data || []);
  };

  const handleSelectSupplier = async (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    await fetchSupplierTransactions(supplier.name);
  };

  const handleSaveSupplier = async () => {
    if (!formName.trim()) {
      toast.error('Supplier name is required');
      return;
    }

    try {
      if (editSupplier) {
        const { error } = await supabase
          .from('suppliers')
          .update({ name: formName, phone: formPhone || null, address: formAddress || null })
          .eq('id', editSupplier.id);
        
        if (error) throw error;
        toast.success('Supplier updated');
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert({ name: formName, phone: formPhone || null, address: formAddress || null });
        
        if (error) throw error;
        toast.success('Supplier added');
      }
      
      setIsAddOpen(false);
      setEditSupplier(null);
      setFormName('');
      setFormPhone('');
      setFormAddress('');
      fetchSuppliers();
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast.error('Failed to save supplier');
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditSupplier(supplier);
    setFormName(supplier.name);
    setFormPhone(supplier.phone || '');
    setFormAddress(supplier.address || '');
    setIsAddOpen(true);
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.phone?.includes(searchQuery)
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);

  return (
    <AppLayout title="Suppliers">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
            <p className="text-sm text-muted-foreground">{suppliers.length} suppliers</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Supplier
          </Button>
        </div>

        {/* Summary Card */}
        <div className={cn("border rounded-xl p-4 mb-6", totalBalance > 0 ? "bg-warning/10 border-warning/20" : "bg-success/10 border-success/20")}>
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", totalBalance > 0 ? "bg-warning/20" : "bg-success/20")}>
              <CreditCard className={cn("w-6 h-6", totalBalance > 0 ? "text-warning" : "text-success")} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Balance (Payable)</p>
              <p className={cn("text-2xl font-bold", totalBalance > 0 ? "text-warning" : "text-success")}>
                {formatCurrency(Math.abs(totalBalance))}
              </p>
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

        {/* Supplier List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No suppliers found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSuppliers.map((supplier, index) => (
              <motion.div
                key={supplier.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => handleSelectSupplier(supplier)}
                  >
                    <h3 className="font-semibold text-foreground">{supplier.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {supplier.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {supplier.phone}
                        </span>
                      )}
                      {supplier.address && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3" />
                          {supplier.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("text-lg font-bold", supplier.balance > 0 ? "text-warning" : "text-success")}>
                        {formatCurrency(Math.abs(supplier.balance))}
                      </p>
                      <p className="text-xs text-muted-foreground">{supplier.balance > 0 ? 'Payable' : 'Paid'}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditSupplier(supplier)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Supplier Detail Sheet */}
      <Sheet open={!!selectedSupplier} onOpenChange={(open) => !open && setSelectedSupplier(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{selectedSupplier?.name}</SheetTitle>
          </SheetHeader>
          
          {selectedSupplier && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              {/* Balance */}
              <div className={cn("rounded-xl p-4", selectedSupplier.balance > 0 ? "bg-warning/10" : "bg-success/10")}>
                <p className="text-xs text-muted-foreground">Balance (Payable)</p>
                <p className={cn("text-2xl font-bold", selectedSupplier.balance > 0 ? "text-warning" : "text-success")}>
                  {formatCurrency(Math.abs(selectedSupplier.balance))}
                </p>
              </div>

              {/* Contact */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <h4 className="text-sm font-medium mb-3">Contact Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedSupplier.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedSupplier.address || 'No address'}</span>
                  </div>
                </div>
              </div>

              {/* Recent Transactions */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Recent Transactions</h4>
                {supplierTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions found</p>
                ) : (
                  <div className="space-y-2">
                    {supplierTransactions.map((tx) => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.type.replace(/_/g, ' ')} • {format(new Date(tx.created_at), 'MMM d')}
                          </p>
                          {tx.bill_number && (
                            <p className="text-xs text-accent">{tx.bill_number}</p>
                          )}
                        </div>
                        {tx.type === 'purchase_payment' ? (
                          <ArrowUpRight className="w-4 h-4 text-success" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Supplier Sheet */}
      <Sheet open={isAddOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddOpen(false);
          setEditSupplier(null);
          setFormName('');
          setFormPhone('');
          setFormAddress('');
        }
      }}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Supplier name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="Phone number"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Address</label>
              <Input
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="Address"
                className="mt-1"
              />
            </div>
            <Button onClick={handleSaveSupplier} className="w-full">
              {editSupplier ? 'Update Supplier' : 'Add Supplier'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
