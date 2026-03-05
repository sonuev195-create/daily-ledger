import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Truck, Search, Phone, MapPin, Plus, Edit2, Trash2, CreditCard, ArrowUpRight, ArrowDownLeft, Wallet } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatINR } from '@/lib/format';
import { v4 as uuidv4 } from 'uuid';

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
  payments: any;
}

interface OpeningBillEntry {
  amount: string;
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
  
  // Opening due bills
  const [isOpeningBillOpen, setIsOpeningBillOpen] = useState(false);
  const [openingBillSupplier, setOpeningBillSupplier] = useState<Supplier | null>(null);
  const [openingBills, setOpeningBills] = useState<OpeningBillEntry[]>([{ amount: '' }]);

  useEffect(() => { fetchSuppliers(); }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
    setLoading(false);
  };

  const fetchSupplierTransactions = async (supplierId: string) => {
    const { data } = await supabase.from('transactions').select('id, type, amount, created_at, bill_number, payments')
      .eq('supplier_id', supplierId).order('created_at', { ascending: false }).limit(50);
    setSupplierTransactions(data || []);
  };

  const handleSelectSupplier = async (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    await fetchSupplierTransactions(supplier.id);
  };

  const handleSaveSupplier = async () => {
    if (!formName.trim()) { toast.error('Name required'); return; }
    try {
      if (editSupplier) {
        await supabase.from('suppliers').update({ name: formName, phone: formPhone || null, address: formAddress || null }).eq('id', editSupplier.id);
        toast.success('Updated');
      } else {
        await supabase.from('suppliers').insert({ name: formName, phone: formPhone || null, address: formAddress || null });
        toast.success('Added');
      }
      closeForm();
      fetchSuppliers();
    } catch { toast.error('Failed'); }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Delete this supplier? All linked transactions will remain.')) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Deleted'); fetchSuppliers(); setSelectedSupplier(null); }
  };

  const handleEditSupplier = (s: Supplier) => {
    setEditSupplier(s);
    setFormName(s.name);
    setFormPhone(s.phone || '');
    setFormAddress(s.address || '');
    setIsAddOpen(true);
  };

  const closeForm = () => {
    setIsAddOpen(false);
    setEditSupplier(null);
    setFormName(''); setFormPhone(''); setFormAddress('');
  };

  // Opening due bills
  const openOpeningBills = (supplier: Supplier) => {
    setOpeningBillSupplier(supplier);
    setOpeningBills([{ amount: '' }]);
    setIsOpeningBillOpen(true);
  };

  const addOpeningBillRow = () => setOpeningBills(prev => [...prev, { amount: '' }]);

  const saveOpeningBills = async () => {
    if (!openingBillSupplier) return;
    const validBills = openingBills.filter(b => parseFloat(b.amount) > 0);
    if (validBills.length === 0) { toast.error('Enter at least one amount'); return; }

    // Get existing PUR DUE count for this supplier
    const { data: existing } = await supabase.from('transactions')
      .select('bill_number').eq('supplier_id', openingBillSupplier.id)
      .like('bill_number', 'PUR DUE%').order('created_at', { ascending: false }).limit(1);
    
    let nextNum = 1;
    if (existing?.[0]?.bill_number) {
      const match = existing[0].bill_number.match(/PUR DUE (\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    let totalDue = 0;
    for (const bill of validBills) {
      const amt = parseFloat(bill.amount);
      totalDue += amt;
      const billNumber = `PUR DUE ${nextNum}`;
      nextNum++;

      await supabase.from('transactions').insert({
        date: format(new Date(), 'yyyy-MM-dd'),
        section: 'purchase',
        type: 'opening_due',
        amount: amt,
        payments: [],
        bill_number: billNumber,
        supplier_id: openingBillSupplier.id,
        supplier_name: openingBillSupplier.name,
        due: amt,
      });
    }

    // Update supplier balance
    await supabase.from('suppliers').update({ balance: openingBillSupplier.balance + totalDue }).eq('id', openingBillSupplier.id);

    toast.success(`${validBills.length} opening bill(s) added`);
    setIsOpeningBillOpen(false);
    fetchSuppliers();
    if (selectedSupplier?.id === openingBillSupplier.id) {
      fetchSupplierTransactions(openingBillSupplier.id);
    }
  };

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.phone?.includes(searchQuery));
  const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);

  return (
    <AppLayout title="Suppliers">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
            <p className="text-sm text-muted-foreground">{suppliers.length} suppliers</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Add</Button>
        </div>

        <div className={cn("border rounded-xl p-4 mb-6", totalBalance > 0 ? "bg-warning/10 border-warning/20" : "bg-success/10 border-success/20")}>
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", totalBalance > 0 ? "bg-warning/20" : "bg-success/20")}>
              <CreditCard className={cn("w-6 h-6", totalBalance > 0 ? "text-warning" : "text-success")} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Due</p>
              <p className={cn("text-2xl font-bold", totalBalance > 0 ? "text-warning" : "text-success")}>{formatINR(Math.abs(totalBalance))}</p>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..." className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent" />
        </div>

        {loading ? <div className="text-center py-12 text-muted-foreground">Loading...</div> : filtered.length === 0 ? (
          <div className="text-center py-12"><Truck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">No suppliers</p></div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => handleSelectSupplier(s)}>
                    <h3 className="font-semibold text-foreground">{s.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                      {s.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{s.address}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className={cn("text-lg font-bold", s.balance > 0 ? "text-warning" : "text-success")}>{formatINR(Math.abs(s.balance))}</p>
                      <p className="text-xs text-muted-foreground">{s.balance > 0 ? 'Due' : 'Paid'}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openOpeningBills(s)} title="Add Opening Bills"><Plus className="w-4 h-4 text-accent" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditSupplier(s)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteSupplier(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedSupplier} onOpenChange={open => !open && setSelectedSupplier(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4"><SheetTitle>{selectedSupplier?.name}</SheetTitle></SheetHeader>
          {selectedSupplier && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              <div className={cn("rounded-xl p-4", selectedSupplier.balance > 0 ? "bg-warning/10" : "bg-success/10")}>
                <p className="text-xs text-muted-foreground">Balance Due</p>
                <p className={cn("text-2xl font-bold", selectedSupplier.balance > 0 ? "text-warning" : "text-success")}>{formatINR(Math.abs(selectedSupplier.balance))}</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4">
                <h4 className="text-sm font-medium mb-3">Contact</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{selectedSupplier.phone || 'No phone'}</span></div>
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{selectedSupplier.address || 'No address'}</span></div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Transactions</h4>
                {supplierTransactions.length === 0 ? <p className="text-sm text-muted-foreground">No transactions</p> : (
                  <div className="space-y-2">
                    {supplierTransactions.map(tx => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatINR(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">{tx.type.replace(/_/g, ' ')} • {format(new Date(tx.created_at), 'MMM d')}</p>
                          {tx.bill_number && <p className="text-xs text-accent">{tx.bill_number}</p>}
                        </div>
                        {tx.type === 'purchase_payment' ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownLeft className="w-4 h-4 text-destructive" />}
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
          <SheetHeader className="mb-4"><SheetTitle>{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</SheetTitle></SheetHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Name *</label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Supplier name" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Phone</label><Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Phone" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Address</label><Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Address" className="mt-1" /></div>
            <Button onClick={handleSaveSupplier} className="w-full">{editSupplier ? 'Update' : 'Add Supplier'}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Opening Due Bills Sheet */}
      <Sheet open={isOpeningBillOpen} onOpenChange={open => !open && setIsOpeningBillOpen(false)}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl">
          <SheetHeader className="mb-4"><SheetTitle>Opening Due Bills - {openingBillSupplier?.name}</SheetTitle></SheetHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Add opening due amounts. Each will be numbered as PUR DUE 1, 2, etc.</p>
            {openingBills.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">PUR DUE {i + 1}</span>
                <Input type="number" value={b.amount} onChange={e => {
                  const updated = [...openingBills];
                  updated[i] = { amount: e.target.value };
                  setOpeningBills(updated);
                }} placeholder="Amount" className="flex-1" />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addOpeningBillRow} className="w-full gap-1"><Plus className="w-3 h-3" /> Add Row</Button>
            <Button onClick={saveOpeningBills} className="w-full">Save Opening Bills</Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
