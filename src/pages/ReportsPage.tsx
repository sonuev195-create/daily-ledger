import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, FileText, Users, Truck, Package, ArrowLeftRight, Calendar, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { formatINR } from '@/lib/format';

type ReportTab = 'daily' | 'monthly' | 'customer' | 'supplier' | 'inventory' | 'drawer';

const reportTabs: { id: ReportTab; label: string; icon: any }[] = [
  { id: 'daily', label: 'Daily', icon: FileText },
  { id: 'monthly', label: 'Monthly', icon: BarChart3 },
  { id: 'customer', label: 'Customers', icon: Users },
  { id: 'supplier', label: 'Suppliers', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'drawer', label: 'Drawer', icon: ArrowLeftRight },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');

  return (
    <AppLayout title="Reports">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        <div className="hidden lg:block mb-6">
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Business reports and analytics</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-6 overflow-x-auto">
          {reportTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                  activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}>
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'daily' && <DailyReport />}
        {activeTab === 'monthly' && <MonthlyReport />}
        {activeTab === 'customer' && <CustomerLedger />}
        {activeTab === 'supplier' && <SupplierLedger />}
        {activeTab === 'inventory' && <InventoryReport />}
        {activeTab === 'drawer' && <DrawerReport />}
      </div>
    </AppLayout>
  );
}

function DailyReport() {
  const [date, setDate] = useState(new Date());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [date]);

  const fetchData = async () => {
    setLoading(true);
    const dateStr = format(date, 'yyyy-MM-dd');
    const { data: txns } = await supabase.from('transactions').select('*').eq('date', dateStr).order('created_at');
    setData(txns || []);
    setLoading(false);
  };

  const sections = ['sale', 'purchase', 'expenses', 'employee', 'home', 'exchange'];
  const sectionLabels: Record<string, string> = { sale: 'Sales', purchase: 'Purchase', expenses: 'Expenses', employee: 'Employee', home: 'Home', exchange: 'Exchange' };

  const sectionTotals = sections.map(s => {
    const txns = data.filter(t => t.section === s);
    const total = txns.reduce((sum, t) => sum + Number(t.amount), 0);
    const cashIn = txns.reduce((sum, t) => {
      const payments = Array.isArray(t.payments) ? t.payments : [];
      return sum + payments.filter((p: any) => p.mode === 'cash').reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
    }, 0);
    const upiIn = txns.reduce((sum, t) => {
      const payments = Array.isArray(t.payments) ? t.payments : [];
      return sum + payments.filter((p: any) => p.mode === 'upi').reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
    }, 0);
    return { section: s, label: sectionLabels[s], count: txns.length, total, cashIn, upiIn };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium">{format(date, 'EEEE, MMM d, yyyy')}</span>
        <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : (
        <div className="space-y-3">
          {sectionTotals.filter(s => s.count > 0).map(s => (
            <div key={s.section} className="bg-card border border-border rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-foreground">{s.label}</h3>
                <span className="text-xs text-muted-foreground">{s.count} txn</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">Total</span><p className="font-semibold">{formatINR(s.total)}</p></div>
                <div><span className="text-success">Cash</span><p className="font-semibold text-success">{formatINR(s.cashIn)}</p></div>
                <div><span className="text-info">UPI</span><p className="font-semibold text-info">{formatINR(s.upiIn)}</p></div>
              </div>

              {/* Individual transactions */}
              <div className="mt-2 space-y-1">
                {data.filter(t => t.section === s.section).map(t => {
                  const payments = Array.isArray(t.payments) ? t.payments : [];
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-[11px] py-1 border-t border-border/30">
                      <span className="text-muted-foreground capitalize w-16 truncate">{t.type.replace(/_/g, ' ')}</span>
                      <span className="truncate flex-1">{t.customer_name || t.supplier_name || t.reference || '-'}</span>
                      {t.bill_number && <span className="text-muted-foreground">#{t.bill_number}</span>}
                      <span className="font-medium">{formatINR(Number(t.amount))}</span>
                      <div className="flex gap-1">
                        {payments.map((p: any, i: number) => (
                          <span key={i} className={cn("text-[9px]", p.mode === 'cash' ? 'text-success' : p.mode === 'upi' ? 'text-info' : 'text-muted-foreground')}>
                            {p.mode}:{formatINR(Number(p.amount))}
                          </span>
                        ))}
                      </div>
                      {t.due > 0 && <span className="text-warning text-[9px]">Due:{formatINR(Number(t.due))}</span>}
                      {t.bill_type && <span className="text-[9px] text-muted-foreground">[{t.bill_type === 'g_bill' ? 'G' : t.bill_type === 'n_bill' ? 'N' : 'N/G'}]</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {sectionTotals.every(s => s.count === 0) && (
            <div className="text-center py-8 text-muted-foreground text-sm">No transactions for this date</div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthlyReport() {
  const [month, setMonth] = useState(new Date());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [month]);

  const fetchData = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const { data: txns } = await supabase.from('transactions').select('*').gte('date', start).lte('date', end).order('date');
    setData(txns || []);
    setLoading(false);
  };

  const totalSales = data.filter(t => t.section === 'sale' && t.type === 'sale').reduce((s, t) => s + Number(t.amount), 0);
  const totalBillA = data.filter(t => t.type === 'purchase_bill' && t.bill_type === 'g_bill').reduce((s, t) => s + Number(t.amount), 0);
  const totalBillB = data.filter(t => t.type === 'purchase_bill' && t.bill_type === 'n_bill').reduce((s, t) => s + Number(t.amount), 0);
  const totalBillC = data.filter(t => t.type === 'purchase_bill' && t.bill_type === 'ng_bill').reduce((s, t) => s + Number(t.amount), 0);
  const totalReturnA = data.filter(t => t.type === 'purchase_return' && t.bill_type === 'g_bill').reduce((s, t) => s + Number(t.amount), 0);
  const totalReturnB = data.filter(t => t.type === 'purchase_return' && t.bill_type === 'n_bill').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = data.filter(t => t.section === 'expenses').reduce((s, t) => s + Number(t.amount), 0);
  const totalEmployee = data.filter(t => t.section === 'employee').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
        <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold mb-2">Monthly Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-success/10 rounded-lg p-3"><span className="text-muted-foreground">Total Sales</span><p className="text-lg font-bold text-success">{formatINR(totalSales)}</p></div>
              <div className="bg-destructive/10 rounded-lg p-3"><span className="text-muted-foreground">Expenses</span><p className="text-lg font-bold text-destructive">{formatINR(totalExpenses)}</p></div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Purchase Breakdown</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span>Bill A (G Bill)</span><span className="font-semibold">{formatINR(totalBillA)}</span></div>
              <div className="flex justify-between"><span>Bill B (N Bill)</span><span className="font-semibold">{formatINR(totalBillB)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Bill C (N/G Bill - report only)</span><span>{formatINR(totalBillC)}</span></div>
              <div className="flex justify-between text-success"><span>Return A (G)</span><span>-{formatINR(totalReturnA)}</span></div>
              <div className="flex justify-between text-success"><span>Return B (N)</span><span>-{formatINR(totalReturnB)}</span></div>
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span>Net Bill A (G)</span><span>{formatINR(totalBillA + totalBillC - totalReturnA)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Net Bill B (N)</span><span>{formatINR(totalBillB - totalBillC - totalReturnB)}</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">Employee</h3>
            <p className="text-lg font-bold">{formatINR(totalEmployee)}</p>
            <p className="text-xs text-muted-foreground">{data.filter(t => t.section === 'employee').length} payments</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerLedger() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('customers').select('*').order('name').then(({ data }) => {
      setCustomers(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Customer Ledger ({customers.length})</h3>
      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : customers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No customers</p>
      ) : (
        <div className="space-y-2">
          {customers.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
              </div>
              <div className="text-right text-xs">
                {Number(c.due_balance) > 0 && <p className="text-warning font-semibold">Due: {formatINR(Number(c.due_balance))}</p>}
                {Number(c.advance_balance) > 0 && <p className="text-success font-semibold">Adv: {formatINR(Number(c.advance_balance))}</p>}
                {Number(c.due_balance) === 0 && Number(c.advance_balance) === 0 && <p className="text-muted-foreground">Clear</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierLedger() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => {
      setSuppliers(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Supplier Ledger ({suppliers.length})</h3>
      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No suppliers</p>
      ) : (
        <div className="space-y-2">
          {suppliers.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                {s.phone && <p className="text-[10px] text-muted-foreground">{s.phone}</p>}
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-semibold", Number(s.balance) > 0 ? "text-warning" : "text-muted-foreground")}>
                  {Number(s.balance) > 0 ? `Due: ${formatINR(Number(s.balance))}` : 'Clear'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InventoryReport() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: itemsData } = await supabase.from('items').select('*').order('name');
      const { data: batchesData } = await supabase.from('batches').select('*');

      const enriched = (itemsData || []).map(item => {
        const itemBatches = (batchesData || []).filter(b => b.item_id === item.id);
        const totalQty = itemBatches.reduce((s, b) => s + Number(b.primary_quantity), 0);
        const avgRate = itemBatches.length > 0 ? itemBatches.reduce((s, b) => s + Number(b.purchase_rate), 0) / itemBatches.length : 0;
        const value = totalQty * avgRate;
        return { ...item, totalQty, avgRate, value, batchCount: itemBatches.length };
      });

      setItems(enriched);
      setLoading(false);
    })();
  }, []);

  const totalValue = items.reduce((s, i) => s + i.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Inventory ({items.length} items)</h3>
        <span className="text-xs font-semibold text-primary">Value: {formatINR(totalValue)}</span>
      </div>
      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No items</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.batchCount} batches</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold">{item.totalQty} qty</p>
                  <p className="text-muted-foreground">Rate: {formatINR(item.avgRate)}</p>
                  <p className="text-primary font-medium">{formatINR(item.value)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DrawerReport() {
  const [month, setMonth] = useState(new Date());
  const [closings, setClosings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [month]);

  const fetchData = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const { data } = await supabase.from('drawer_closings').select('*').gte('date', start).lte('date', end).order('date');
    setClosings(data || []);
    setLoading(false);
  };

  const totalErrors = closings.reduce((s, c) => s + Math.abs(Number(c.difference)), 0);
  const daysWithError = closings.filter(c => Number(c.difference) !== 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
        <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Total Error</p>
          <p className={cn("text-lg font-bold", totalErrors > 0 ? "text-warning" : "text-success")}>{formatINR(totalErrors)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Days with Error</p>
          <p className="text-lg font-bold text-foreground">{daysWithError}/{closings.length}</p>
        </div>
      </div>

      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : closings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No drawer closings this month</p>
      ) : (
        <div className="space-y-2">
          {closings.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium">{format(new Date(c.date), 'MMM d, EEE')}</span>
                <div className="flex gap-3">
                  <span className="text-muted-foreground">System: {formatINR(Number(c.system_cash))}</span>
                  <span>Manual: {formatINR(Number(c.manual_coin) + Number(c.manual_cash))}</span>
                  <span className={cn("font-semibold", Number(c.difference) !== 0 ? "text-warning" : "text-success")}>
                    {Number(c.difference) !== 0 ? `Error: ${formatINR(Math.abs(Number(c.difference)))}` : '✓'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
