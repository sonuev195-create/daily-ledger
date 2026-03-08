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
    if (!selectedSuppId) { setTxns([]); setBills([]); return; }
    if (viewMode !== 'yearly') fetchData();
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

  // ---- BILL-WISE: group bills with all transactions in date order ----
  const billWiseData = (() => {
    // All bill transactions (purchase_bill)
    const billTxns = txns.filter(t => t.type === 'purchase_bill');
    // All non-bill transactions (payments, returns, expenses)
    const otherTxns = txns.filter(t => t.type !== 'purchase_bill');
    
    // For each bill, show the bill + then all subsequent payments/returns in date order
    // Since payments aren't linked to specific bills, show all transactions chronologically
    // with a running balance showing how much of total bills is still due
    const allSorted = [...txns].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    
    let runBal = 0;
    return allSorted.map(t => {
      const isBillAB = t.type === 'purchase_bill' && (t.bill_type === 'g_bill' || t.bill_type === 'n_bill');
      if (isBillAB) runBal += Number(t.amount);
      if (t.type === 'purchase_return') runBal -= Number(t.amount);
      if (t.type === 'purchase_payment') runBal -= Number(t.amount);
      return { ...t, runBal };
    });
  })();

  // ---- YEARLY month-wise summary ----
  const yearlyMonths = eachMonthOfInterval({ start: startOfYear(year), end: endOfYear(year) });
  const yearlyMonthData = yearlyMonths.map(m => {
    const mStr = format(m, 'yyyy-MM');
    const mTxns = yearlyTxns.filter(t => t.date.startsWith(mStr));
    const bills = mTxns.filter(t => t.type === 'purchase_bill');
    const returns = mTxns.filter(t => t.type === 'purchase_return');
    const payments = mTxns.filter(t => t.type === 'purchase_payment');
    const expenses = mTxns.filter(t => t.type === 'purchase_expenses');
    return {
      month: m,
      label: format(m, 'MMM'),
      totalBills: sum(bills),
      totalReturns: sum(returns),
      totalPayments: sum(payments),
      totalExpenses: sum(expenses),
      net: sum(bills) - sum(returns) - sum(payments),
      count: mTxns.length,
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
    doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

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
        typeLabel(t.type, t.bill_type),
        t.bill_number || '-',
        fmtINR(Number(t.amount)),
        paymentStr(t) || '-',
        t.runningBalance >= 0 ? fmtINR(t.runningBalance) : `-${fmtINR(t.runningBalance)}`,
      ]),
      theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
    });
    doc.save(`Supplier_${selectedSupp.name}_${format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedSupp) return;
    const header = ['Date', 'Type', 'Bill#', 'Amount', 'Payment', 'Balance'];
    const rows = [header, ...ledgerTxns.map(t => [
      format(parseISO(t.date), 'dd MMM yyyy'),
      typeLabel(t.type, t.bill_type),
      t.bill_number || '', String(Number(t.amount)), paymentStr(t), String(t.runningBalance),
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

          {/* Month/Year navigation */}
          {viewMode === 'yearly' ? (
            <div className="flex items-center justify-between">
              <button onClick={() => { const d = new Date(year); d.setFullYear(d.getFullYear() - 1); setYear(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium">{format(year, 'yyyy')}</span>
              <button onClick={() => { const d = new Date(year); d.setFullYear(d.getFullYear() + 1); setYear(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
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
                      <span>Date</span>
                      <span>Type</span>
                      <span>Bill#</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Payment</span>
                      <span className="text-right">Balance</span>
                    </div>
                    {ledgerTxns.map(t => (
                      <div key={t.id} className="grid grid-cols-[55px_70px_40px_60px_70px_60px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px] items-start">
                        <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                        <span className={cn("font-medium truncate",
                          t.direction === 'debit' ? "text-warning" : t.direction === 'credit' ? "text-success" : t.direction === 'report' ? "text-info" : ""
                        )}>
                          {typeLabel(t.type, t.bill_type)}
                        </span>
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
                        <span></span>
                        <span>Current</span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span className={cn("text-right", Number(selectedSupp.balance) > 0 ? "text-warning" : "text-success")}>
                          {formatINR(Number(selectedSupp.balance || 0))}
                        </span>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* BILL-WISE VIEW - date-wise transactions with running balance */}
              {viewMode === 'bills' && (
                txns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
                ) : (
                  <div className="space-y-3">
                    {/* All transactions in date order with bill completion tracking */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[55px_65px_40px_55px_65px_55px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                        <span>Date</span>
                        <span>Type</span>
                        <span>Bill#</span>
                        <span className="text-right">Amount</span>
                        <span className="text-right">Payment</span>
                        <span className="text-right">Due Bal</span>
                      </div>
                      {billWiseData.map(t => {
                        const isBill = t.type === 'purchase_bill';
                        const isPayment = t.type === 'purchase_payment';
                        const isReturn = t.type === 'purchase_return';
                        const bill = isBill ? bills.find(b => b.transaction_id === t.id) : null;
                        const isExpanded = expandedBill === t.id;
                        
                        return (
                          <div key={t.id}>
                            <div
                              onClick={() => isBill ? setExpandedBill(isExpanded ? null : t.id) : null}
                              className={cn(
                                "grid grid-cols-[55px_65px_40px_55px_65px_55px] gap-1 px-3 py-2 border-b border-border/50 text-[11px] items-center",
                                isBill && "cursor-pointer hover:bg-secondary/30",
                                isPayment && "bg-success/5",
                                isReturn && "bg-destructive/5"
                              )}
                            >
                              <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                              <span className={cn("font-medium truncate flex items-center gap-0.5",
                                isBill ? "text-warning" : isPayment ? "text-success" : isReturn ? "text-destructive" : ""
                              )}>
                                {typeLabel(t.type, t.bill_type)}
                                {isBill && (isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />)}
                              </span>
                              <span className="text-muted-foreground truncate">{t.bill_number || '-'}</span>
                              <span className="text-right font-semibold">{formatINR(Number(t.amount))}</span>
                              <span className="text-right text-muted-foreground text-[10px]">{paymentStr(t) || '-'}</span>
                              <span className={cn("text-right font-semibold", t.runBal > 0 ? "text-warning" : "text-success")}>
                                {t.runBal < 0 ? '-' : ''}{formatINR(Math.abs(t.runBal))}
                              </span>
                            </div>
                            {/* Expanded bill items */}
                            {isExpanded && bill && (
                              <div className="border-b border-border bg-secondary/20 px-4 py-2">
                                <div className="text-[10px] text-muted-foreground mb-1 font-semibold">Bill Items:</div>
                                {(bill.bill_items || []).map((bi: any) => (
                                  <div key={bi.id} className="flex justify-between text-[11px] py-0.5">
                                    <span>{bi.item_name} × {Number(bi.primary_quantity)}</span>
                                    <span>{formatINR(Number(bi.total_amount))}</span>
                                  </div>
                                ))}
                                <div className="border-t border-border mt-1 pt-1 flex justify-between text-xs font-semibold">
                                  <span>Total</span>
                                  <span>{formatINR(Number(bill.total_amount))}</span>
                                </div>
                              </div>
                            )}
                            {isExpanded && isBill && !bill && (
                              <div className="border-b border-border bg-secondary/20 px-4 py-2 text-[10px] text-muted-foreground">No bill details</div>
                            )}
                          </div>
                        );
                      })}
                      {/* Footer */}
                      <div className="grid grid-cols-[55px_65px_40px_55px_65px_55px] gap-1 px-3 py-2 bg-secondary/30 text-[11px] font-bold border-t border-border">
                        <span></span>
                        <span>Total</span>
                        <span></span>
                        <span className="text-right">{formatINR(totalBills + totalPayments + totalReturns + totalExpenses)}</span>
                        <span></span>
                        <span className={cn("text-right", (billWiseData[billWiseData.length - 1]?.runBal || 0) > 0 ? "text-warning" : "text-success")}>
                          {formatINR(Math.abs(billWiseData[billWiseData.length - 1]?.runBal || 0))}
                        </span>
                      </div>
                    </div>
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
