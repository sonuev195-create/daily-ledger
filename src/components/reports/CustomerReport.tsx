import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, eachMonthOfInterval } from 'date-fns';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type ViewMode = 'ledger' | 'summary' | 'yearly';
type DateMode = 'month' | 'custom';

export function CustomerReport() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [year, setYear] = useState(new Date());
  const [txns, setTxns] = useState<any[]>([]);
  const [yearlyTxns, setYearlyTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('ledger');
  const [dateMode, setDateMode] = useState<DateMode>('month');
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    supabase.from('customers').select('*').order('name').then(({ data }) => {
      setCustomers(data || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedCustId) { setTxns([]); return; }
    if (viewMode !== 'yearly') fetchData();
  }, [selectedCustId, month, viewMode, dateMode]);

  useEffect(() => {
    if (!selectedCustId || viewMode !== 'yearly') return;
    fetchYearlyData();
  }, [selectedCustId, year, viewMode]);

  const getDateRange = () => {
    if (dateMode === 'custom') return { start: fromDate, end: toDate };
    return { start: format(startOfMonth(month), 'yyyy-MM-dd'), end: format(endOfMonth(month), 'yyyy-MM-dd') };
  };

  const fetchData = async () => {
    setLoading(true);
    const { start, end } = getDateRange();
    const { data } = await supabase
      .from('transactions').select('*').eq('customer_id', selectedCustId)
      .gte('date', start).lte('date', end).order('date');
    setTxns(data || []);
    setLoading(false);
  };

  const fetchCustomRange = () => {
    if (selectedCustId && dateMode === 'custom') fetchData();
  };

  const fetchYearlyData = async () => {
    setLoading(true);
    const start = format(startOfYear(year), 'yyyy-MM-dd');
    const end = format(endOfYear(year), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('transactions').select('*').eq('customer_id', selectedCustId)
      .gte('date', start).lte('date', end).order('date');
    setYearlyTxns(data || []);
    setLoading(false);
  };

  const selectedCust = customers.find(c => c.id === selectedCustId);
  const sum = (arr: any[]) => arr.reduce((s, t) => s + Number(t.amount), 0);

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      sale: 'Sale', sales_return: 'Return', balance_paid: 'Bal Paid',
      customer_advance: 'Advance',
    };
    return map[type] || type.replace(/_/g, ' ');
  };

  const paymentStr = (t: any) => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return payments.map((p: any) => `${p.mode}: ${formatINR(Number(p.amount))}`).join(', ');
  };

  // Running balance
  const ledgerTxns = txns.map((t, i) => {
    const runningBalance = txns.slice(0, i + 1).reduce((bal, x) => {
      if (x.type === 'sale') return bal + (Number(x.due) || 0);
      if (x.type === 'sales_return') return bal - Number(x.amount);
      if (x.type === 'balance_paid') return bal - Number(x.amount);
      if (x.type === 'customer_advance') return bal - Number(x.amount);
      return bal;
    }, 0);
    const direction = t.type === 'sale' ? 'debit' : 'credit';
    return { ...t, runningBalance, direction };
  });

  const saleTxns = txns.filter(t => t.type === 'sale');
  const returnTxns = txns.filter(t => t.type === 'sales_return');
  const balancePaidTxns = txns.filter(t => t.type === 'balance_paid');
  const advanceTxns = txns.filter(t => t.type === 'customer_advance');

  const totalSales = sum(saleTxns);
  const totalReturns = sum(returnTxns);
  const totalBalancePaid = sum(balancePaidTxns);
  const totalAdvance = sum(advanceTxns);
  const totalDue = saleTxns.reduce((s, t) => s + (Number(t.due) || 0), 0);

  // Yearly
  const yearlyMonths = eachMonthOfInterval({ start: startOfYear(year), end: endOfYear(year) });
  const yearlyMonthData = yearlyMonths.map(m => {
    const mStr = format(m, 'yyyy-MM');
    const mTxns = yearlyTxns.filter(t => t.date.startsWith(mStr));
    const sales = mTxns.filter(t => t.type === 'sale');
    const returns = mTxns.filter(t => t.type === 'sales_return');
    const bPaid = mTxns.filter(t => t.type === 'balance_paid');
    const adv = mTxns.filter(t => t.type === 'customer_advance');
    const due = sales.reduce((s, t) => s + (Number(t.due) || 0), 0);
    return {
      month: m, label: format(m, 'MMM'),
      totalSales: sum(sales), totalReturns: sum(returns),
      totalPaid: sum(bPaid), totalAdvance: sum(adv), due, count: mTxns.length,
    };
  });

  const dateLabel = dateMode === 'custom'
    ? `${format(parseISO(fromDate), 'dd MMM yyyy')} - ${format(parseISO(toDate), 'dd MMM yyyy')}`
    : format(month, 'MMMM yyyy');

  const handleExportPDF = () => {
    if (!selectedCust) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Customer Report: ${selectedCust.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(dateLabel, pw / 2, 25, { align: 'center' });

    autoTable(doc, {
      startY: 32,
      head: [['Date', 'Type', 'Bill#', 'Amount', 'Due', 'Payment', 'Balance']],
      body: ledgerTxns.map(t => [
        format(parseISO(t.date), 'dd MMM yyyy'),
        typeLabel(t.type), t.bill_number || '-',
        fmtINR(Number(t.amount)),
        t.due > 0 ? fmtINR(Number(t.due)) : '-',
        paymentStr(t) || '-',
        t.runningBalance >= 0 ? fmtINR(t.runningBalance) : `-${fmtINR(t.runningBalance)}`,
      ]),
      theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
    });
    doc.save(`Customer_${selectedCust.name}_${dateMode === 'custom' ? 'custom' : format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedCust) return;
    const header = ['Date', 'Type', 'Bill#', 'Amount', 'Due', 'Payment', 'Balance'];
    const rows = [header, ...ledgerTxns.map(t => [
      format(parseISO(t.date), 'dd MMM yyyy'),
      typeLabel(t.type), t.bill_number || '',
      String(Number(t.amount)), String(Number(t.due) || 0),
      paymentStr(t), String(t.runningBalance),
    ])];
    downloadCSV(rows, `Customer_${selectedCust.name}_${dateMode === 'custom' ? 'custom' : format(month, 'yyyy-MM')}.csv`);
  };

  return (
    <div className="space-y-4">
      <select value={selectedCustId} onChange={e => setSelectedCustId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl">
        <option value="">Select Customer</option>
        {customers.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
            {Number(c.due_balance) > 0 ? ` (Due: ${formatINR(Number(c.due_balance))})` : ''}
            {Number(c.advance_balance) > 0 ? ` (Adv: ${formatINR(Number(c.advance_balance))})` : ''}
          </option>
        ))}
      </select>

      {selectedCustId && (
        <>
          <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
            {(['ledger', 'summary', 'yearly'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}>
                {mode === 'yearly' ? 'Yearly' : mode === 'ledger' ? 'Ledger' : 'Summary'}
              </button>
            ))}
          </div>

          {viewMode === 'yearly' ? (
            <div className="flex items-center justify-between">
              <button onClick={() => { const d = new Date(year); d.setFullYear(d.getFullYear() - 1); setYear(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium">{format(year, 'yyyy')}</span>
              <button onClick={() => { const d = new Date(year); d.setFullYear(d.getFullYear() + 1); setYear(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Date mode toggle */}
              <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
                <button onClick={() => setDateMode('month')}
                  className={cn("flex-1 px-2 py-1 rounded-md text-[10px] font-medium",
                    dateMode === 'month' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                  Monthly
                </button>
                <button onClick={() => setDateMode('custom')}
                  className={cn("flex-1 px-2 py-1 rounded-md text-[10px] font-medium flex items-center justify-center gap-1",
                    dateMode === 'custom' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                  <Calendar className="w-3 h-3" /> Custom Date
                </button>
              </div>

              {dateMode === 'month' ? (
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
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground">From</label>
                      <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground">To</label>
                      <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <Button size="sm" className="h-8 text-xs" onClick={fetchCustomRange}>Go</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{dateLabel}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || txns.length === 0}>
                        <Download className="w-3 h-3" /> PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={loading || txns.length === 0}>
                        <FileSpreadsheet className="w-3 h-3" /> CSV
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : (
            <>
              {/* YEARLY VIEW */}
              {viewMode === 'yearly' && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_55px_45px_50px_45px_45px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                    <span>Month</span><span className="text-right">Sales</span><span className="text-right">Return</span>
                    <span className="text-right">Paid</span><span className="text-right">Adv</span><span className="text-right">Due</span>
                  </div>
                  {yearlyMonthData.filter(m => m.count > 0).map(m => (
                    <div key={m.label} className="grid grid-cols-[40px_55px_45px_50px_45px_45px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px]">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-right">{formatINR(m.totalSales)}</span>
                      <span className="text-right text-destructive">{m.totalReturns > 0 ? formatINR(m.totalReturns) : '-'}</span>
                      <span className="text-right text-success">{m.totalPaid > 0 ? formatINR(m.totalPaid) : '-'}</span>
                      <span className="text-right text-info">{m.totalAdvance > 0 ? formatINR(m.totalAdvance) : '-'}</span>
                      <span className="text-right text-warning font-semibold">{m.due > 0 ? formatINR(m.due) : '-'}</span>
                    </div>
                  ))}
                  {yearlyMonthData.every(m => m.count === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-8">No transactions this year</p>
                  )}
                  {selectedCust && (
                    <div className="px-3 py-2 bg-secondary/50 text-[11px] font-bold border-t border-border space-y-0.5">
                      <div className="flex justify-between">
                        <span>Due Balance</span>
                        <span className={Number(selectedCust.due_balance) > 0 ? "text-warning" : "text-success"}>
                          {formatINR(Number(selectedCust.due_balance || 0))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Advance Balance</span>
                        <span className="text-info">{formatINR(Number(selectedCust.advance_balance || 0))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LEDGER VIEW */}
              {viewMode === 'ledger' && (
                txns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions for this period</p>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[50px_55px_35px_50px_35px_55px_45px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                      <span>Date</span><span>Type</span><span>Bill#</span>
                      <span className="text-right">Amount</span><span className="text-right">Due</span>
                      <span className="text-right">Payment</span><span className="text-right">Balance</span>
                    </div>
                    {ledgerTxns.map(t => (
                      <div key={t.id} className="grid grid-cols-[50px_55px_35px_50px_35px_55px_45px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px] items-start">
                        <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                        <span className={cn("font-medium truncate", t.direction === 'debit' ? "text-warning" : "text-success")}>
                          {typeLabel(t.type)}
                        </span>
                        <span className="text-muted-foreground truncate">{t.bill_number || '-'}</span>
                        <span className="text-right font-semibold">{formatINR(Number(t.amount))}</span>
                        <span className="text-right text-warning text-[10px]">{Number(t.due) > 0 ? formatINR(Number(t.due)) : '-'}</span>
                        <span className="text-right text-muted-foreground text-[10px]">{paymentStr(t) || '-'}</span>
                        <span className={cn("text-right font-semibold", t.runningBalance > 0 ? "text-warning" : "text-success")}>
                          {t.runningBalance < 0 ? '-' : ''}{formatINR(Math.abs(t.runningBalance))}
                        </span>
                      </div>
                    ))}
                    {selectedCust && (
                      <div className="px-3 py-2 bg-secondary/30 text-[11px] font-bold border-t border-border flex justify-between">
                        <span>Current Due</span>
                        <span className={Number(selectedCust.due_balance) > 0 ? "text-warning" : "text-success"}>
                          {formatINR(Number(selectedCust.due_balance || 0))}
                        </span>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* SUMMARY VIEW */}
              {viewMode === 'summary' && (
                txns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions for this period</p>
                ) : (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1 text-xs">
                    <div className="font-semibold underline mb-1">CUSTOMER SUMMARY</div>
                    <div className="flex justify-between"><span>Total Sales</span><span>{formatINR(totalSales)}</span></div>
                    <div className="flex justify-between"><span>Total Returns</span><span className="text-destructive">-{formatINR(totalReturns)}</span></div>
                    <div className="flex justify-between"><span>Balance Paid</span><span className="text-success">{formatINR(totalBalancePaid)}</span></div>
                    <div className="flex justify-between"><span>Advance</span><span className="text-info">{formatINR(totalAdvance)}</span></div>
                    <div className="border-t border-border pt-1 mt-1">
                      <div className="flex justify-between"><span>New Due</span><span className="text-warning">{formatINR(totalDue)}</span></div>
                    </div>
                    {selectedCust && (
                      <div className="border-t-2 border-border pt-2 mt-2 space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>Due Balance</span>
                          <span className={Number(selectedCust.due_balance) > 0 ? "text-warning" : "text-success"}>
                            {Number(selectedCust.due_balance) > 0 ? formatINR(Number(selectedCust.due_balance)) : 'Clear'}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span>Advance Balance</span>
                          <span className="text-info">{formatINR(Number(selectedCust.advance_balance || 0))}</span>
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
