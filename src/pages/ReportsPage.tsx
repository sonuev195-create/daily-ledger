import { useState, useEffect } from 'react'; // v2
import { BarChart3, FileText, Users, Truck, Package, ArrowLeftRight, ChevronLeft, ChevronRight, Download, FileSpreadsheet, UserCheck } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { generateDetailedDailyPDF, generateFullMonthlyPDF } from '@/lib/reportExport';
import { useAuth } from '@/contexts/AuthContext';
import { EmployeeReport } from '@/components/reports/EmployeeReport';
import { SupplierReport } from '@/components/reports/SupplierReport';
import { CustomerReport } from '@/components/reports/CustomerReport';
import { ProfitReport } from '@/components/reports/ProfitReport';

type ReportTab = 'daily' | 'monthly' | 'employee' | 'supplier_detail' | 'customer' | 'supplier' | 'inventory' | 'drawer';

// CSV export helper
function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const reportTabs: { id: ReportTab; label: string; icon: any }[] = [
  { id: 'daily', label: 'Daily', icon: FileText },
  { id: 'monthly', label: 'Monthly', icon: BarChart3 },
  { id: 'employee', label: 'Employee', icon: UserCheck },
  { id: 'supplier_detail', label: 'Supplier', icon: Truck },
  { id: 'customer', label: 'Customers', icon: Users },
  { id: 'supplier', label: 'Ledger', icon: Truck },
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
        {activeTab === 'employee' && <EmployeeReport />}
        {activeTab === 'supplier_detail' && <SupplierReport />}
        {activeTab === 'customer' && <CustomerReport />}
        {activeTab === 'supplier' && <SupplierLedger />}
        {activeTab === 'inventory' && <InventoryReport />}
        {activeTab === 'drawer' && <DrawerReport />}
      </div>
    </AppLayout>
  );
}

// Helper to get name from pre-fetched map
function getResolvedName(txn: any, empMap: Record<string, string>) {
  if (txn.customer_name) return txn.customer_name;
  if (txn.supplier_name) return txn.supplier_name;
  if (txn.employee_id && empMap[txn.employee_id]) return empMap[txn.employee_id];
  if (txn.reference) return txn.reference;
  return '-';
}

// ====== Helper to get bill type label ======
function billTypeLabel(bt: string | null | undefined) {
  if (!bt) return '';
  if (bt === 'g_bill') return 'A';
  if (bt === 'n_bill') return 'B';
  return 'C';
}

// ====== DAILY REPORT ======
function DailyReport() {
  const [date, setDate] = useState(new Date());
  const [data, setData] = useState<any[]>([]);
  const [drawerData, setDrawerData] = useState<{ opening: any; closing: any }>({ opening: null, closing: null });
  const [loading, setLoading] = useState(true);
  const [empMap, setEmpMap] = useState<Record<string, string>>({});

  useEffect(() => { fetchData(); }, [date]);

  const fetchData = async () => {
    setLoading(true);
    const dateStr = format(date, 'yyyy-MM-dd');
    const [{ data: txns }, { data: opening }, { data: closing }, { data: employees }] = await Promise.all([
      supabase.from('transactions').select('*').eq('date', dateStr).order('created_at'),
      supabase.from('drawer_openings').select('*').eq('date', dateStr).maybeSingle(),
      supabase.from('drawer_closings').select('*').eq('date', dateStr).maybeSingle(),
      supabase.from('employees').select('id, name'),
    ]);
    setData(txns || []);
    setDrawerData({ opening, closing });
    const map: Record<string, string> = {};
    (employees || []).forEach(e => { map[e.id] = e.name; });
    setEmpMap(map);
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
    const chequeIn = txns.reduce((sum, t) => {
      const payments = Array.isArray(t.payments) ? t.payments : [];
      return sum + payments.filter((p: any) => p.mode === 'cheque').reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
    }, 0);
    const advanceUsed = txns.reduce((sum, t) => {
      const payments = Array.isArray(t.payments) ? t.payments : [];
      return sum + payments.filter((p: any) => p.mode === 'advance').reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
    }, 0);
    const totalPaid = cashIn + upiIn + chequeIn + advanceUsed;
    const totalDue = txns.reduce((sum, t) => sum + (Number(t.due) || 0), 0);
    return { section: s, label: sectionLabels[s], count: txns.length, total, cashIn, upiIn, chequeIn, advanceUsed, totalPaid, totalDue };
  });

  const handleExportPDF = async () => {
    await generateDetailedDailyPDF(date, data, drawerData.opening, drawerData.closing);
  };

  const handleExportCSV = () => {
    const header = ['Type', 'Section', 'Name', 'Bill#', 'Bill Type', 'Amount', 'Cash', 'UPI', 'Cheque', 'Advance', 'Due'];
    const rows = data.map((t: any) => {
      const payments = Array.isArray(t.payments) ? t.payments : [];
      const modeSum = (m: string) => payments.filter((p: any) => p.mode === m).reduce((s: number, p: any) => s + Number(p.amount), 0);
      return [t.type, t.section, getResolvedName(t, empMap), t.bill_number || '', t.bill_type || '', String(t.amount), String(modeSum('cash')), String(modeSum('upi')), String(modeSum('cheque')), String(modeSum('advance')), String(t.due || 0)];
    });
    downloadCSV([header, ...rows], `Daily_Report_${format(date, 'yyyy-MM-dd')}.csv`);
  };

  // Overall summary - include overpayment as advance
  const saleTxns = data.filter(t => t.section === 'sale');
  const overallBill = saleTxns.reduce((s, t) => s + Number(t.amount), 0);
  const overallPaid = saleTxns.reduce((s, t) => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return s + payments.reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
  }, 0);
  const overallDue = saleTxns.reduce((s, t) => s + (Number(t.due) || 0), 0);
  const advanceUsedInPayments = saleTxns.reduce((s, t) => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return s + payments.filter((p: any) => p.mode === 'advance').reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
  }, 0);
  const advanceFromOverpayment = saleTxns.filter(t => t.type !== 'customer_advance').reduce((s, t) => s + (Number(t.overpayment) || 0), 0);
  const customerAdvanceTxns = saleTxns.filter(t => t.type === 'customer_advance').reduce((s, t) => s + Number(t.amount), 0);
  const overallAdvance = advanceUsedInPayments + advanceFromOverpayment + customerAdvanceTxns;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium">{format(date, 'EEEE, MMM d, yyyy')}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading}>
            <Download className="w-3 h-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={loading}>
            <FileSpreadsheet className="w-3 h-3" /> CSV
          </Button>
        </div>
      </div>

      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : (
        <div className="space-y-3">
          {/* Day Summary Card */}
          {data.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <h3 className="text-sm font-bold mb-2 text-primary">Day Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Total Bill</span><p className="font-bold text-lg">{formatINR(overallBill)}</p></div>
                <div><span className="text-muted-foreground">Total Paid</span><p className="font-bold text-lg text-success">{formatINR(overallPaid)}</p></div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[11px] mt-2">
                <div><span className="text-success">Cash</span><p className="font-semibold">{formatINR(sectionTotals.find(s => s.section === 'sale')?.cashIn || 0)}</p></div>
                <div><span className="text-info">UPI</span><p className="font-semibold">{formatINR(sectionTotals.find(s => s.section === 'sale')?.upiIn || 0)}</p></div>
                <div><span className="text-primary">Advance</span><p className="font-semibold">{formatINR(overallAdvance)}</p></div>
                <div><span className="text-warning">Due</span><p className="font-semibold">{formatINR(overallDue)}</p></div>
              </div>
            </div>
          )}

          {sectionTotals.filter(s => s.count > 0).map(s => (
            <div key={s.section} className="bg-card border border-border rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-foreground">{s.label}</h3>
                <span className="text-xs text-muted-foreground">{s.count} txn</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-1">
                <div><span className="text-muted-foreground">Total Bill</span><p className="font-semibold">{formatINR(s.total)}</p></div>
                <div><span className="text-muted-foreground">Total Paid</span><p className="font-semibold text-success">{formatINR(s.totalPaid)}</p></div>
                <div><span className="text-warning">Due</span><p className="font-semibold text-warning">{formatINR(s.totalDue)}</p></div>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] mb-2">
                {s.cashIn > 0 && <span className="text-success">💵Cash:{formatINR(s.cashIn)}</span>}
                {s.upiIn > 0 && <span className="text-info">📱UPI:{formatINR(s.upiIn)}</span>}
                {s.chequeIn > 0 && <span className="text-warning">📄Cheque:{formatINR(s.chequeIn)}</span>}
                {s.advanceUsed > 0 && <span className="text-primary">🔄Advance:{formatINR(s.advanceUsed)}</span>}
              </div>

              <div className="space-y-1">
                {data.filter(t => t.section === s.section).map(t => {
                  const payments = Array.isArray(t.payments) ? t.payments : [];
                  const totalPaid = payments.reduce((s2: number, p: any) => s2 + Number(p.amount), 0);
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-[11px] py-1 border-t border-border/30">
                      <span className="text-muted-foreground capitalize w-16 truncate">{t.type.replace(/_/g, ' ')}</span>
                      <span className="truncate flex-1">{getResolvedName(t, empMap)}</span>
                      {t.bill_number && <span className="text-muted-foreground">#{t.bill_number}</span>}
                      <span className="font-medium">{formatINR(Number(t.amount))}</span>
                      <div className="flex gap-1">
                        {payments.map((p: any, i: number) => (
                          <span key={i} className={cn("text-[9px]", p.mode === 'cash' ? 'text-success' : p.mode === 'upi' ? 'text-info' : p.mode === 'advance' ? 'text-primary' : 'text-muted-foreground')}>
                            {p.mode}:{formatINR(Number(p.amount))}
                          </span>
                        ))}
                      </div>
                      {t.due > 0 && <span className="text-warning text-[9px]">Due:{formatINR(Number(t.due))}</span>}
                      {t.bill_type && <span className="text-[9px] text-muted-foreground">[{billTypeLabel(t.bill_type)}]</span>}
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

// ====== MONTHLY REPORT (matching image layout) ======
function MonthlyReport() {
  const { isAdmin } = useAuth();
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

  // Helpers
  const bySection = (s: string) => data.filter(t => t.section === s);
  const byType = (type: string) => data.filter(t => t.type === type);
  const byBillType = (type: string, bt: string) => data.filter(t => t.type === type && t.bill_type === bt);
  const sum = (arr: any[]) => arr.reduce((s, t) => s + Number(t.amount), 0);

  const cashSum = (arr: any[]) => arr.reduce((s, t) => {
    const p = Array.isArray(t.payments) ? t.payments : [];
    return s + p.filter((x: any) => x.mode === 'cash').reduce((s2: number, x: any) => s2 + Number(x.amount), 0);
  }, 0);
  const upiSum = (arr: any[]) => arr.reduce((s, t) => {
    const p = Array.isArray(t.payments) ? t.payments : [];
    return s + p.filter((x: any) => x.mode === 'upi').reduce((s2: number, x: any) => s2 + Number(x.amount), 0);
  }, 0);

  // CREDIT/DEBIT totals
  const sales = byType('sale');
  const salesReturn = byType('sales_return');
  const balancePaid = byType('balance_paid');
  const customerAdvance = byType('customer_advance');

  const totalSales = sum(sales);
  const totalReturn = sum(salesReturn);
  const totalBalancePaid = sum(balancePaid);
  const totalCustAdvance = sum(customerAdvance);

  // Purchase
  const billA = byBillType('purchase_bill', 'g_bill');
  const billB = byBillType('purchase_bill', 'n_bill');
  const billC = byBillType('purchase_bill', 'ng_bill');
  const returnA = data.filter(t => t.type === 'purchase_return' && t.bill_type === 'g_bill');
  const returnB = data.filter(t => t.type === 'purchase_return' && t.bill_type === 'n_bill');
  const returnC = data.filter(t => t.type === 'purchase_return' && t.bill_type === 'ng_bill');
  const purchasePayment = byType('purchase_payment');
  const purchaseExpenses = byType('purchase_expenses');

  const totalBillA = sum(billA);
  const totalBillB = sum(billB);
  const totalBillC = sum(billC);
  const totalReturnA = sum(returnA);
  const totalReturnB = sum(returnB);
  const totalReturnC = sum(returnC);
  const totalPurchasePayment = sum(purchasePayment);
  const totalPurchaseExpenses = sum(purchaseExpenses);

  // Net Bill A = Bill A - Return A + Bill C - Return C
  const netBillA = totalBillA - totalReturnA + totalBillC - totalReturnC;
  // Net Bill B = Bill B - Return B - Bill C + Return C
  const netBillB = totalBillB - totalReturnB - totalBillC + totalReturnC;

  // Employee
  const empTxns = bySection('employee');
  const totalSalaryPaid = sum(empTxns);

  // Expenses
  const expTxns = bySection('expenses');
  const totalExpenses = sum(expTxns);

  // Home
  const homeTxns = bySection('home');
  const homeCredit = homeTxns.filter(t => t.type === 'home_credit');
  const homeDebit = homeTxns.filter(t => t.type === 'home_debit');

  // Exchange
  const exchTxns = bySection('exchange');

  // Cash/UPI breakdown
  const saleCash = cashSum(sales);
  const saleUpi = upiSum(sales);
  const bpCash = cashSum(balancePaid);
  const bpUpi = upiSum(balancePaid);
  const caCash = cashSum(customerAdvance);
  const caUpi = upiSum(customerAdvance);
  const totalCreditCash = saleCash + bpCash + caCash;
  const totalCreditUpi = saleUpi + bpUpi + caUpi;

  const returnCash = cashSum(salesReturn);
  const returnUpi = upiSum(salesReturn);
  const suppPaidCash = cashSum(purchasePayment);
  const suppPaidUpi = upiSum(purchasePayment);
  const suppExpCash = cashSum(purchaseExpenses);
  const suppExpUpi = upiSum(purchaseExpenses);
  const empCash = cashSum(empTxns);
  const empUpi = upiSum(empTxns);
  const expCash = cashSum(expTxns);
  const expUpi = upiSum(expTxns);

  const totalDebitCash = returnCash + suppPaidCash + suppExpCash + empCash + expCash;
  const totalDebitUpi = returnUpi + suppPaidUpi + suppExpUpi + empUpi + expUpi;

  const netCash = totalCreditCash - totalDebitCash;
  const netUpi = totalCreditUpi - totalDebitUpi;
  const netAmount = netCash + netUpi;

  // Credits & Debits summary
  const totalCredit = totalSales + totalBalancePaid + totalCustAdvance;
  const totalDebit = totalExpenses + totalSalaryPaid + totalPurchasePayment + totalPurchaseExpenses + totalReturn;

  const handleExportPDF = () => {
    generateFullMonthlyPDF(month, data);
  };

  const handleExportCSV = () => {
    const header = ['Category', 'Amount'];
    const rows = [
      ['SALES', String(totalSales)], ['RETURN', String(totalReturn)],
      ['BALANCE PAID', String(totalBalancePaid)], ['CUSTOMER ADVANCE', String(totalCustAdvance)],
      ['BILL A', String(totalBillA)], ['BILL B', String(totalBillB)], ['BILL C', String(totalBillC)],
      ['RETURN A', String(totalReturnA)], ['RETURN B', String(totalReturnB)], ['RETURN C', String(totalReturnC)],
      ['NET BILL A', String(netBillA)], ['NET BILL B', String(netBillB)],
      ['PURCHASE PAID', String(totalPurchasePayment)], ['PURCHASE EXPENSE', String(totalPurchaseExpenses)],
      ['TOTAL SALARY PAID', String(totalSalaryPaid)], ['TO EXPENSES', String(totalExpenses)],
      ['', ''],
      ['CREDIT CASH', String(totalCreditCash)], ['CREDIT UPI', String(totalCreditUpi)],
      ['DEBIT CASH', String(totalDebitCash)], ['DEBIT UPI', String(totalDebitUpi)],
      ['NET CASH', String(netCash)], ['NET UPI', String(netUpi)], ['NET AMOUNT', String(netAmount)],
    ];
    downloadCSV([header, ...rows], `Monthly_Report_${format(month, 'yyyy-MM')}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading}>
            <Download className="w-3 h-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={loading}>
            <FileSpreadsheet className="w-3 h-3" /> CSV
          </Button>
        </div>
      </div>

      {loading ? <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" /> : (
        <div className="space-y-3">
          {/* Credits & Debits Summary */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 text-center underline">CREDITS AND DEBITS</h3>
            <div className="space-y-1 text-xs">
              <div className="font-semibold underline">BUSINESS</div>
              <Row label="SALES" value={totalSales} />
              <Row label="RETURN" value={totalReturn} />
              <Row label="BALANCE PAID" value={totalBalancePaid} />
              <Row label="CUSTOMER ADVANCE" value={totalCustAdvance} />
              <Divider />
              
              <div className="font-semibold underline mt-2">EXPENSES</div>
              {expTxns.length > 0 && <Row label="TO EXPENSES" value={totalExpenses} />}

              <div className="font-semibold underline mt-2">PURCHASE</div>
              <Row label="BILL A" value={totalBillA} />
              <Row label="BILL B" value={totalBillB} />
              <Row label="BILL C" value={totalBillC} />
              <Row label="RETURN A" value={totalReturnA} negative />
              <Row label="RETURN B" value={totalReturnB} negative />
              <Row label="RETURN C" value={totalReturnC} negative />
              <div className="border-t border-border pt-1 mt-1">
                <Row label="NET BILL A" value={netBillA} bold />
                <Row label="NET BILL B" value={netBillB} bold />
              </div>
              <Row label="PURCHASE PAID" value={totalPurchasePayment} />
              <Row label="PURCHASE EXPENSE" value={totalPurchaseExpenses} />

              <div className="font-semibold underline mt-2">EMPLOYEE</div>
              <Row label="TOTAL SALARY PAID" value={totalSalaryPaid} />

              {isAdmin && (
                <div className="border-t-2 border-border mt-3 pt-2 space-y-1">
                  <Row label="CREDIT" value={totalCredit} bold />
                  <Row label="DEBIT" value={totalDebit} bold />
                  <Row label="NET AMOUNT" value={netAmount} bold accent />
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold mb-3 text-center">CASH / UPI BREAKDOWN</h3>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <div className="font-semibold">CREDIT</div>
                <div className="font-semibold text-right">CASH</div>
                <div className="font-semibold text-right">UPI</div>

                <div className="font-semibold text-muted-foreground mt-1" style={{ gridColumn: '1 / -1' }}>CUSTOMER</div>
                <div>SALE</div><div className="text-right">{formatINR(saleCash)}</div><div className="text-right">{formatINR(saleUpi)}</div>
                <div>BALANCE PAID</div><div className="text-right">{formatINR(bpCash)}</div><div className="text-right">{formatINR(bpUpi)}</div>
                <div>CUSTOMER ADVANCE</div><div className="text-right">{formatINR(caCash)}</div><div className="text-right">{formatINR(caUpi)}</div>
                <div className="border-t border-border pt-1 font-semibold">Total Credit</div>
                <div className="border-t border-border pt-1 text-right font-semibold">{formatINR(totalCreditCash)}</div>
                <div className="border-t border-border pt-1 text-right font-semibold">{formatINR(totalCreditUpi)}</div>
                <div className="text-right font-bold" style={{ gridColumn: '1 / -1' }}>NET CREDIT: {formatINR(totalCreditCash + totalCreditUpi)}</div>

                <div className="font-semibold mt-3" style={{ gridColumn: '1 / -1' }}>DEBIT</div>
                <div className="font-semibold text-muted-foreground">CUSTOMER</div><div /><div />
                <div>SALES RETURN</div><div className="text-right">{formatINR(returnCash)}</div><div className="text-right">{formatINR(returnUpi)}</div>

                <div className="font-semibold text-muted-foreground mt-1">SUPPLIER</div><div /><div />
                <div>PAID</div><div className="text-right">{formatINR(suppPaidCash)}</div><div className="text-right">{formatINR(suppPaidUpi)}</div>
                <div>EXPENSES</div><div className="text-right">{formatINR(suppExpCash)}</div><div className="text-right">{formatINR(suppExpUpi)}</div>

                <div className="font-semibold text-muted-foreground mt-1">EMPLOYEE</div><div /><div />
                <div>SALARY</div><div className="text-right">{formatINR(empCash)}</div><div className="text-right">{formatINR(empUpi)}</div>

                <div className="font-semibold text-muted-foreground mt-1">EXPENSES</div><div /><div />
                <div>OTHER EXPENSES</div><div className="text-right">{formatINR(expCash)}</div><div className="text-right">{formatINR(expUpi)}</div>

                <div className="border-t border-border pt-1 font-semibold">Total Debit</div>
                <div className="border-t border-border pt-1 text-right font-semibold">{formatINR(totalDebitCash)}</div>
                <div className="border-t border-border pt-1 text-right font-semibold">{formatINR(totalDebitUpi)}</div>
                <div className="text-right font-bold" style={{ gridColumn: '1 / -1' }}>NET DEBIT: {formatINR(totalDebitCash + totalDebitUpi)}</div>

                <div className="border-t-2 border-border mt-2 pt-2 font-bold">NET AMOUNT</div>
                <div className="border-t-2 border-border mt-2 pt-2 text-right font-bold">{formatINR(netCash)}</div>
                <div className="border-t-2 border-border mt-2 pt-2 text-right font-bold">{formatINR(netUpi)}</div>
                <div className="text-right font-bold text-primary" style={{ gridColumn: '1 / -1' }}>{formatINR(netAmount)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Row helper components
function Row({ label, value, bold, negative, accent }: { label: string; value: number; bold?: boolean; negative?: boolean; accent?: boolean }) {
  const displayValue = negative ? -Math.abs(value) : value;
  const isNeg = displayValue < 0;
  return (
    <div className={cn("flex justify-between py-0.5", bold && "font-semibold", accent && "text-primary")}>
      <span>{label}</span>
      <span>{isNeg ? '-' : ''}{formatINR(Math.abs(displayValue))}</span>
    </div>
  );
}
function Divider() {
  return <div className="border-t border-border my-1" />;
}

// ====== CUSTOMER LEDGER ======
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

// ====== SUPPLIER LEDGER ======
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

// ====== INVENTORY ======
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

// ====== DRAWER ======
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
