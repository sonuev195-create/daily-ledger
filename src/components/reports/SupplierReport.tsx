import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, eachMonthOfInterval } from 'date-fns';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const fmtINR = (n: number) => `Rs.${Math.abs(n).toLocaleString('en-IN')}`;

const billTypeLabel = (bt: string | null) => {
  if (bt === 'g_bill') return 'A';
  if (bt === 'n_bill') return 'B';
  if (bt === 'ng_bill') return 'C';
  return '';
};

type ViewMode = 'ledger' | 'bills' | 'summary' | 'yearly';

export function SupplierReport() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSuppId, setSelectedSuppId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [year, setYear] = useState(new Date());
  const [txns, setTxns] = useState<any[]>([]);
  const [allTxns, setAllTxns] = useState<any[]>([]); // All-time txns for bill-wise
  const [bills, setBills] = useState<any[]>([]);
  const [yearlyTxns, setYearlyTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('ledger');
  const [expandedBill, setExpandedBill] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => {
      setSuppliers(data || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedSuppId) { setTxns([]); setBills([]); setAllTxns([]); return; }
    if (viewMode === 'bills') fetchAllData();
    else if (viewMode !== 'yearly') fetchData();
  }, [selectedSuppId, month, viewMode]);

  useEffect(() => {
    if (!selectedSuppId || viewMode !== 'yearly') return;
    fetchYearlyData();
  }, [selectedSuppId, year, viewMode]);

  const fetchData = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const { data: txnData } = await supabase
      .from('transactions').select('*').eq('supplier_id', selectedSuppId)
      .gte('date', start).lte('date', end).order('date');
    setTxns(txnData || []);

    const txnIds = (txnData || []).filter(t => ['purchase_bill', 'purchase_return'].includes(t.type)).map(t => t.id);
    if (txnIds.length > 0) {
      const { data: billData } = await supabase.from('bills').select('*, bill_items(*)').in('transaction_id', txnIds);
      setBills(billData || []);
    } else {
      setBills([]);
    }
    setLoading(false);
  };

  // Fetch ALL transactions for this supplier (for bill-wise FIFO tracking)
  const fetchAllData = async () => {
    setLoading(true);
    const { data: txnData } = await supabase
      .from('transactions').select('*').eq('supplier_id', selectedSuppId)
      .order('date').order('created_at');
    setAllTxns(txnData || []);

    const txnIds = (txnData || []).filter(t => ['purchase_bill', 'purchase_return'].includes(t.type)).map(t => t.id);
    if (txnIds.length > 0) {
      const { data: billData } = await supabase.from('bills').select('*, bill_items(*)').in('transaction_id', txnIds);
      setBills(billData || []);
    } else {
      setBills([]);
    }
    setLoading(false);
  };

  const fetchYearlyData = async () => {
    setLoading(true);
    const start = format(startOfYear(year), 'yyyy-MM-dd');
    const end = format(endOfYear(year), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('transactions').select('*').eq('supplier_id', selectedSuppId)
      .gte('date', start).lte('date', end).order('date');
    setYearlyTxns(data || []);
    setLoading(false);
  };

  const selectedSupp = suppliers.find(s => s.id === selectedSuppId);

  const sum = (arr: any[]) => arr.reduce((s, t) => s + Number(t.amount), 0);
  const billATxns = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'g_bill');
  const billBTxns = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'n_bill');
  const billCTxns = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'ng_bill');
  const returnATxns = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'g_bill');
  const returnBTxns = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'n_bill');
  const returnCTxns = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'ng_bill');
  const paymentTxns = txns.filter(t => t.type === 'purchase_payment');
  const expenseTxns = txns.filter(t => t.type === 'purchase_expenses');

  const totalBillA = sum(billATxns);
  const totalBillB = sum(billBTxns);
  const totalBillC = sum(billCTxns);
  const totalRetA = sum(returnATxns);
  const totalRetB = sum(returnBTxns);
  const totalRetC = sum(returnCTxns);
  const totalPayments = sum(paymentTxns);
  const totalExpenses = sum(expenseTxns);
  const totalBills = totalBillA + totalBillB + totalBillC;
  const totalReturns = totalRetA + totalRetB + totalRetC;
  const netBillA = totalBillA - totalRetA + totalBillC - totalRetC;
  const netBillB = totalBillB - totalRetB - totalBillC + totalRetC;

  // Running balance for ledger
  const ledgerTxns = txns.map((t, i) => {
    const isBillAB = t.type === 'purchase_bill' && (t.bill_type === 'g_bill' || t.bill_type === 'n_bill');
    const isBillC = t.type === 'purchase_bill' && t.bill_type === 'ng_bill';
    const isReturn = t.type === 'purchase_return';
    const isPayment = t.type === 'purchase_payment';
    const direction = isBillAB ? 'debit' : (isReturn || isPayment) ? 'credit' : isBillC ? 'report' : 'expense';

    const runningBalance = txns.slice(0, i + 1).reduce((bal, x) => {
      if (x.type === 'purchase_bill' && (x.bill_type === 'g_bill' || x.bill_type === 'n_bill')) return bal + Number(x.amount);
      if (x.type === 'purchase_return') return bal - Number(x.amount);
      if (x.type === 'purchase_payment') return bal - Number(x.amount);
      return bal;
    }, 0);
    return { ...t, direction, runningBalance };
  });

  const typeLabel = (type: string, billType?: string | null) => {
    if (type === 'purchase_bill') {
      const bt = billTypeLabel(billType);
      return bt ? `Bill ${bt}` : 'Bill';
    }
    if (type === 'purchase_return') {
      const bt = billTypeLabel(billType);
      return bt ? `Return ${bt}` : 'Return';
    }
    const map: Record<string, string> = {
      purchase_payment: 'Payment', purchase_expenses: 'Expense', purchase_delivered: 'Delivered',
    };
    return map[type] || type.replace(/_/g, ' ');
  };

  const paymentStr = (t: any) => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return payments.map((p: any) => `${p.mode}: ${formatINR(Number(p.amount))}`).join(', ');
  };

  // ---- BILL-WISE: FIFO payment allocation per bill ----
  const billWiseGroups = (() => {
    // Only Bill A and B create due. Bill C is reporting only.
    const billTxns = allTxns.filter(t => t.type === 'purchase_bill' && (t.bill_type === 'g_bill' || t.bill_type === 'n_bill'));
    const returnTxns = allTxns.filter(t => t.type === 'purchase_return');
    const paymentTxns = allTxns.filter(t => t.type === 'purchase_payment');

    // Build bill groups with FIFO payment allocation
    type BillGroup = {
      bill: any;
      billObj: any;
      billAmount: number;
      payments: { txn: any; allocated: number }[];
      returns: { txn: any; amount: number }[];
      totalPaid: number;
      totalReturn: number;
      balance: number;
    };

    const groups: BillGroup[] = billTxns.map(bt => {
      const billObj = bills.find(b => b.transaction_id === bt.id);
      // Returns with same bill_number
      const rets = returnTxns.filter(r => r.bill_number && bt.bill_number && r.bill_number === bt.bill_number);
      const totalReturn = rets.reduce((s, r) => s + Number(r.amount), 0);
      return {
        bill: bt,
        billObj,
        billAmount: Number(bt.amount),
        payments: [] as { txn: any; allocated: number }[],
        returns: rets.map(r => ({ txn: r, amount: Number(r.amount) })),
        totalPaid: 0,
        totalReturn,
        balance: Number(bt.amount) - totalReturn,
      };
    });

    // FIFO: allocate payments to bills in chronological order
    let remainingPayments = paymentTxns.map(p => ({ txn: p, remaining: Number(p.amount) }));

    for (const group of groups) {
      let billDue = group.balance; // amount - returns
      for (const rp of remainingPayments) {
        if (billDue <= 0 || rp.remaining <= 0) continue;
        const alloc = Math.min(billDue, rp.remaining);
        group.payments.push({ txn: rp.txn, allocated: alloc });
        group.totalPaid += alloc;
        billDue -= alloc;
        rp.remaining -= alloc;
      }
      group.balance = billDue;
    }

    // Also include Bill C for reference (not affecting balance)
    const billCTxns = allTxns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'ng_bill');
    const billCGroups: BillGroup[] = billCTxns.map(bt => ({
      bill: bt,
      billObj: bills.find(b => b.transaction_id === bt.id),
      billAmount: Number(bt.amount),
      payments: [],
      returns: [],
      totalPaid: 0,
      totalReturn: 0,
      balance: 0, // C doesn't affect balance
    }));

    // Unallocated payments
    const unallocated = remainingPayments.filter(rp => rp.remaining > 0);

    return { groups, billCGroups, unallocated };
  })();

  // ---- YEARLY month-wise summary ----
  const yearlyMonths = eachMonthOfInterval({ start: startOfYear(year), end: endOfYear(year) });
  const yearlyMonthData = yearlyMonths.map(m => {
    const mStr = format(m, 'yyyy-MM');
    const mTxns = yearlyTxns.filter(t => t.date.startsWith(mStr));
    const mBills = mTxns.filter(t => t.type === 'purchase_bill');
    const returns = mTxns.filter(t => t.type === 'purchase_return');
    const payments = mTxns.filter(t => t.type === 'purchase_payment');
    const expenses = mTxns.filter(t => t.type === 'purchase_expenses');
    return {
      month: m, label: format(m, 'MMM'),
      totalBills: sum(mBills), totalReturns: sum(returns),
      totalPayments: sum(payments), totalExpenses: sum(expenses),
      net: sum(mBills) - sum(returns) - sum(payments), count: mTxns.length,
    };
  });
  const yearlyTotal = {
    totalBills: yearlyMonthData.reduce((s, m) => s + m.totalBills, 0),
    totalReturns: yearlyMonthData.reduce((s, m) => s + m.totalReturns, 0),
    totalPayments: yearlyMonthData.reduce((s, m) => s + m.totalPayments, 0),
    totalExpenses: yearlyMonthData.reduce((s, m) => s + m.totalExpenses, 0),
    net: yearlyMonthData.reduce((s, m) => s + m.net, 0),
  };

  const handleExportPDF = () => {
    if (!selectedSupp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Supplier Report: ${selectedSupp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(viewMode === 'bills' ? 'Bill-wise Report (All Time)' : format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

    if (viewMode === 'bills') {
      // Bill-wise PDF
      let y = 32;
      for (const g of billWiseGroups.groups) {
        const bt = billTypeLabel(g.bill.bill_type);
        const rows: string[][] = [
          [format(parseISO(g.bill.date), 'dd MMM yyyy'), `Bill ${bt}`, g.bill.bill_number || '-', fmtINR(g.billAmount), '', fmtINR(g.billAmount)],
        ];
        for (const r of g.returns) {
          rows.push([format(parseISO(r.txn.date), 'dd MMM yyyy'), 'Return', r.txn.bill_number || '-', `-${fmtINR(r.amount)}`, '', fmtINR(g.billAmount - g.totalReturn)]);
        }
        let runBal = g.billAmount - g.totalReturn;
        for (const p of g.payments) {
          runBal -= p.allocated;
          rows.push([format(parseISO(p.txn.date), 'dd MMM yyyy'), 'Payment', '-', '', fmtINR(p.allocated), fmtINR(Math.max(0, runBal))]);
        }

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Type', 'Bill#', 'Amount', 'Paid', 'Balance']],
          body: rows,
          theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
          didDrawPage: () => { y = 14; },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
        if (y > 270) { doc.addPage(); y = 14; }
      }
    } else {
      // Standard summary + ledger PDF
      autoTable(doc, {
        startY: 32,
        head: [['Category', 'Amount']],
        body: [
          ['Bill A', fmtINR(totalBillA)], ['Bill B', fmtINR(totalBillB)], ['Bill C', fmtINR(totalBillC)],
          ['Return A', fmtINR(totalRetA)], ['Return B', fmtINR(totalRetB)], ['Return C', fmtINR(totalRetC)],
          ['Net Bill A', fmtINR(netBillA)],
          ['Net Bill B', netBillB >= 0 ? fmtINR(netBillB) : `-${fmtINR(netBillB)}`],
          ['Total Payments', fmtINR(totalPayments)], ['Total Expenses', fmtINR(totalExpenses)],
          ['Current Balance', fmtINR(Number(selectedSupp.balance || 0))],
        ],
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 9 },
      });
      let y = (doc as any).lastAutoTable.finalY + 10;
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Type', 'Bill#', 'Amount', 'Payment', 'Balance']],
        body: ledgerTxns.map(t => [
          format(parseISO(t.date), 'dd MMM yyyy'),
          typeLabel(t.type, t.bill_type), t.bill_number || '-',
          fmtINR(Number(t.amount)), paymentStr(t) || '-',
          t.runningBalance >= 0 ? fmtINR(t.runningBalance) : `-${fmtINR(t.runningBalance)}`,
        ]),
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
      });
    }
    doc.save(`Supplier_${selectedSupp.name}_${viewMode === 'bills' ? 'Billwise' : format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedSupp) return;
    const header = ['Date', 'Type', 'Bill#', 'Amount', 'Payment', 'Balance'];
    const rows = [header, ...ledgerTxns.map(t => [
      format(parseISO(t.date), 'dd MMM yyyy'),
      typeLabel(t.type, t.bill_type), t.bill_number || '',
      String(Number(t.amount)), paymentStr(t), String(t.runningBalance),
    ])];
    downloadCSV(rows, `Supplier_${selectedSupp.name}_${format(month, 'yyyy-MM')}.csv`);
  };

  return (
    <div className="space-y-4">
      <select value={selectedSuppId} onChange={e => setSelectedSuppId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl">
        <option value="">Select Supplier</option>
        {suppliers.map(s => (
          <option key={s.id} value={s.id}>{s.name}{Number(s.balance) > 0 ? ` (Due: ${formatINR(Number(s.balance))})` : ''}</option>
        ))}
      </select>

      {selectedSuppId && (
        <>
          {/* View mode tabs */}
          <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
            {(['ledger', 'bills', 'summary', 'yearly'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}>
                {mode === 'bills' ? 'Bill-wise' : mode === 'yearly' ? 'Yearly' : mode === 'ledger' ? 'Ledger' : 'Summary'}
              </button>
            ))}
          </div>

          {/* Navigation */}
          {viewMode === 'yearly' ? (
            <div className="flex items-center justify-between">
              <button onClick={() => { const d = new Date(year); d.setFullYear(d.getFullYear() - 1); setYear(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium">{format(year, 'yyyy')}</span>
              <button onClick={() => { const d = new Date(year); d.setFullYear(d.getFullYear() + 1); setYear(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
            </div>
          ) : viewMode === 'bills' ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">All-time bill payment tracking</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || allTxns.length === 0}>
                  <Download className="w-3 h-3" /> PDF
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || txns.length === 0}>
                  <Download className="w-3 h-3" /> PDF
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={loading || txns.length === 0}>
                  <FileSpreadsheet className="w-3 h-3" /> CSV
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : (
            <>
              {/* YEARLY VIEW */}
              {viewMode === 'yearly' && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_60px_50px_60px_50px_55px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                    <span>Month</span>
                    <span className="text-right">Bills</span>
                    <span className="text-right">Return</span>
                    <span className="text-right">Paid</span>
                    <span className="text-right">Exp</span>
                    <span className="text-right">Net Due</span>
                  </div>
                  {yearlyMonthData.filter(m => m.count > 0).map(m => (
                    <div key={m.label} className="grid grid-cols-[40px_60px_50px_60px_50px_55px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px]">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-right">{formatINR(m.totalBills)}</span>
                      <span className="text-right text-destructive">{m.totalReturns > 0 ? formatINR(m.totalReturns) : '-'}</span>
                      <span className="text-right text-success">{m.totalPayments > 0 ? formatINR(m.totalPayments) : '-'}</span>
                      <span className="text-right">{m.totalExpenses > 0 ? formatINR(m.totalExpenses) : '-'}</span>
                      <span className={cn("text-right font-semibold", m.net > 0 ? "text-warning" : "text-success")}>
                        {m.net < 0 ? '-' : ''}{formatINR(Math.abs(m.net))}
                      </span>
                    </div>
                  ))}
                  {yearlyMonthData.every(m => m.count === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-8">No transactions this year</p>
                  )}
                  {yearlyMonthData.some(m => m.count > 0) && (
                    <div className="grid grid-cols-[40px_60px_50px_60px_50px_55px] gap-1 px-3 py-2 bg-secondary/30 text-[11px] font-bold border-t border-border">
                      <span>Total</span>
                      <span className="text-right">{formatINR(yearlyTotal.totalBills)}</span>
                      <span className="text-right text-destructive">{formatINR(yearlyTotal.totalReturns)}</span>
                      <span className="text-right text-success">{formatINR(yearlyTotal.totalPayments)}</span>
                      <span className="text-right">{formatINR(yearlyTotal.totalExpenses)}</span>
                      <span className={cn("text-right", yearlyTotal.net > 0 ? "text-warning" : "text-success")}>
                        {yearlyTotal.net < 0 ? '-' : ''}{formatINR(Math.abs(yearlyTotal.net))}
                      </span>
                    </div>
                  )}
                  {selectedSupp && (
                    <div className="px-3 py-2 bg-secondary/50 text-[11px] font-bold flex justify-between border-t border-border">
                      <span>Current Balance</span>
                      <span className={Number(selectedSupp.balance) > 0 ? "text-warning" : "text-success"}>
                        {formatINR(Number(selectedSupp.balance || 0))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* LEDGER VIEW */}
              {viewMode === 'ledger' && (
                txns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[55px_70px_40px_60px_70px_60px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                      <span>Date</span><span>Type</span><span>Bill#</span>
                      <span className="text-right">Amount</span><span className="text-right">Payment</span><span className="text-right">Balance</span>
                    </div>
                    {ledgerTxns.map(t => (
                      <div key={t.id} className="grid grid-cols-[55px_70px_40px_60px_70px_60px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px] items-start">
                        <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                        <span className={cn("font-medium truncate",
                          t.direction === 'debit' ? "text-warning" : t.direction === 'credit' ? "text-success" : t.direction === 'report' ? "text-info" : ""
                        )}>{typeLabel(t.type, t.bill_type)}</span>
                        <span className="text-muted-foreground truncate">{t.bill_number || '-'}</span>
                        <span className="text-right font-semibold">{formatINR(Number(t.amount))}</span>
                        <span className="text-right text-muted-foreground text-[10px]">{paymentStr(t) || '-'}</span>
                        <span className={cn("text-right font-semibold", t.runningBalance > 0 ? "text-warning" : "text-success")}>
                          {t.runningBalance < 0 ? '-' : ''}{formatINR(Math.abs(t.runningBalance))}
                        </span>
                      </div>
                    ))}
                    {selectedSupp && (
                      <div className="grid grid-cols-[55px_70px_40px_60px_70px_60px] gap-1 px-3 py-2 bg-secondary/30 text-[11px] font-bold border-t border-border">
                        <span></span><span>Current</span><span></span><span></span><span></span>
                        <span className={cn("text-right", Number(selectedSupp.balance) > 0 ? "text-warning" : "text-success")}>
                          {formatINR(Number(selectedSupp.balance || 0))}
                        </span>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* BILL-WISE VIEW - Per bill with FIFO payment allocation */}
              {viewMode === 'bills' && (
                allTxns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions found</p>
                ) : (
                  <div className="space-y-3">
                    {billWiseGroups.groups.map(g => {
                      const bt = billTypeLabel(g.bill.bill_type);
                      const isExpanded = expandedBill === g.bill.id;
                      const isPaid = g.balance <= 0;
                      
                      return (
                        <div key={g.bill.id} className="bg-card border border-border rounded-xl overflow-hidden">
                          {/* Bill header */}
                          <button
                            onClick={() => setExpandedBill(isExpanded ? null : g.bill.id)}
                            className="w-full p-3 flex justify-between items-center"
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn("px-1.5 py-0.5 rounded font-mono text-[10px] font-bold",
                                isPaid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                              )}>{bt}</span>
                              <div className="text-left">
                                <p className="text-xs font-medium">
                                  {g.bill.bill_number ? `#${g.bill.bill_number}` : 'No Bill#'}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{format(parseISO(g.bill.date), 'dd MMM yyyy')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <div className="text-right">
                                <p className="font-bold">{formatINR(g.billAmount)}</p>
                                <p className={cn("text-[10px] font-semibold", isPaid ? "text-success" : "text-warning")}>
                                  {isPaid ? '✓ Paid' : `Due: ${formatINR(g.balance)}`}
                                </p>
                              </div>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </div>
                          </button>

                          {/* Expanded: bill items + payments timeline */}
                          {isExpanded && (
                            <div className="border-t border-border">
                              {/* Bill items */}
                              {g.billObj && (g.billObj.bill_items || []).length > 0 && (
                                <div className="px-3 py-2 bg-secondary/10">
                                  <div className="text-[10px] text-muted-foreground font-semibold mb-1">Bill Items</div>
                                  {(g.billObj.bill_items || []).map((bi: any) => (
                                    <div key={bi.id} className="flex justify-between text-[11px] py-0.5">
                                      <span>{bi.item_name} × {Number(bi.primary_quantity)}</span>
                                      <span>{formatINR(Number(bi.total_amount))}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Payment timeline */}
                              <div className="px-3 py-2">
                                <div className="text-[10px] text-muted-foreground font-semibold mb-1">Payment History</div>
                                {/* Returns */}
                                {g.returns.map((r, i) => (
                                  <div key={`ret-${i}`} className="flex justify-between text-[11px] py-1 border-b border-border/30">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-muted-foreground">{format(parseISO(r.txn.date), 'dd MMM yyyy')}</span>
                                      <span className="text-destructive font-medium">Return</span>
                                    </div>
                                    <span className="text-destructive font-semibold">-{formatINR(r.amount)}</span>
                                  </div>
                                ))}
                                {/* Payments */}
                                {g.payments.length === 0 && g.returns.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground py-1">No payments allocated yet</p>
                                )}
                                {g.payments.map((p, i) => {
                                  const pModes = Array.isArray(p.txn.payments) ? p.txn.payments : [];
                                  const modeStr = pModes.map((m: any) => m.mode).join(', ');
                                  return (
                                    <div key={`pay-${i}`} className="flex justify-between text-[11px] py-1 border-b border-border/30 last:border-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">{format(parseISO(p.txn.date), 'dd MMM yyyy')}</span>
                                        <span className="text-success font-medium">Payment</span>
                                        {modeStr && <span className="text-[9px] text-muted-foreground">({modeStr})</span>}
                                      </div>
                                      <span className="text-success font-semibold">{formatINR(p.allocated)}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Bill balance footer */}
                              <div className="px-3 py-2 bg-secondary/20 border-t border-border flex justify-between text-xs font-bold">
                                <span>Bill Balance</span>
                                <span className={isPaid ? "text-success" : "text-warning"}>
                                  {isPaid ? 'Fully Paid' : formatINR(g.balance)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Bill C section */}
                    {billWiseGroups.billCGroups.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-muted-foreground mt-2">BILL C (Reporting Only)</div>
                        {billWiseGroups.billCGroups.map(g => (
                          <div key={g.bill.id} className="bg-card border border-border rounded-xl p-3 flex justify-between text-xs">
                            <div>
                              <p className="font-medium">{g.bill.bill_number ? `#${g.bill.bill_number}` : 'No Bill#'}</p>
                              <p className="text-[10px] text-muted-foreground">{format(parseISO(g.bill.date), 'dd MMM yyyy')}</p>
                            </div>
                            <span className="font-bold text-info">{formatINR(g.billAmount)}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Unallocated payments */}
                    {billWiseGroups.unallocated.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-muted-foreground mt-2">EXCESS PAYMENTS</div>
                        {billWiseGroups.unallocated.map((u, i) => (
                          <div key={i} className="bg-success/5 border border-success/20 rounded-xl p-3 flex justify-between text-xs">
                            <div>
                              <p className="font-medium text-success">Unallocated Payment</p>
                              <p className="text-[10px] text-muted-foreground">{format(parseISO(u.txn.date), 'dd MMM yyyy')}</p>
                            </div>
                            <span className="font-bold text-success">{formatINR(u.remaining)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )
              )}

              {/* SUMMARY VIEW */}
              {viewMode === 'summary' && (
                txns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
                ) : (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1 text-xs">
                    <div className="font-semibold underline mb-1">PURCHASE SUMMARY</div>
                    <div className="flex justify-between"><span>Bill A</span><span>{formatINR(totalBillA)}</span></div>
                    <div className="flex justify-between"><span>Bill B</span><span>{formatINR(totalBillB)}</span></div>
                    <div className="flex justify-between"><span>Bill C</span><span>{formatINR(totalBillC)}</span></div>
                    <div className="flex justify-between"><span>Return A</span><span className="text-destructive">-{formatINR(totalRetA)}</span></div>
                    <div className="flex justify-between"><span>Return B</span><span className="text-destructive">-{formatINR(totalRetB)}</span></div>
                    <div className="flex justify-between"><span>Return C</span><span className="text-destructive">-{formatINR(totalRetC)}</span></div>
                    <div className="border-t border-border pt-1 mt-1">
                      <div className="flex justify-between font-semibold"><span>Net Bill A</span><span>{formatINR(netBillA)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Net Bill B</span><span>{netBillB < 0 ? '-' : ''}{formatINR(Math.abs(netBillB))}</span></div>
                    </div>
                    <div className="border-t border-border pt-1 mt-1">
                      <div className="flex justify-between"><span>Total Bills</span><span>{formatINR(totalBills)}</span></div>
                      <div className="flex justify-between"><span>Total Returns</span><span className="text-destructive">-{formatINR(totalReturns)}</span></div>
                      <div className="flex justify-between"><span>Total Payments</span><span className="text-success">{formatINR(totalPayments)}</span></div>
                      <div className="flex justify-between"><span>Total Expenses</span><span>{formatINR(totalExpenses)}</span></div>
                    </div>
                    {selectedSupp && (
                      <div className="border-t-2 border-border pt-2 mt-2">
                        <div className="flex justify-between font-bold">
                          <span>Current Balance</span>
                          <span className={Number(selectedSupp.balance) > 0 ? "text-warning" : "text-success"}>
                            {Number(selectedSupp.balance) > 0 ? formatINR(Number(selectedSupp.balance)) : 'Clear'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
