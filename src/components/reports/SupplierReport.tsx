import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
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

type ViewMode = 'summary' | 'bills' | 'ledger';

export function SupplierReport() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSuppId, setSelectedSuppId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [txns, setTxns] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [expandedBill, setExpandedBill] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => {
      setSuppliers(data || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedSuppId) { setTxns([]); setBills([]); return; }
    fetchData();
  }, [selectedSuppId, month]);

  const fetchData = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');

    // Get all supplier transactions
    const { data: txnData } = await supabase
      .from('transactions')
      .select('*')
      .eq('supplier_id', selectedSuppId)
      .gte('date', start)
      .lte('date', end)
      .order('date');
    setTxns(txnData || []);

    // Get bills for this supplier's transactions
    const txnIds = (txnData || []).filter(t => ['purchase_bill', 'purchase_return'].includes(t.type)).map(t => t.id);
    if (txnIds.length > 0) {
      const { data: billData } = await supabase
        .from('bills')
        .select('*, bill_items(*)')
        .in('transaction_id', txnIds);
      setBills(billData || []);
    } else {
      setBills([]);
    }
    setLoading(false);
  };

  const selectedSupp = suppliers.find(s => s.id === selectedSuppId);

  // Monthly summary calculations
  const billATxns = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'g_bill');
  const billBTxns = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'n_bill');
  const billCTxns = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'ng_bill');
  const returnATxns = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'g_bill');
  const returnBTxns = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'n_bill');
  const returnCTxns = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'ng_bill');
  const paymentTxns = txns.filter(t => t.type === 'purchase_payment');
  const expenseTxns = txns.filter(t => t.type === 'purchase_expenses');

  const sum = (arr: any[]) => arr.reduce((s, t) => s + Number(t.amount), 0);

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

  // Running balance (chronological ledger)
  const ledgerTxns = txns.map((t, i) => {
    const isDebit = ['purchase_bill'].includes(t.type);
    const isCredit = ['purchase_payment', 'purchase_return'].includes(t.type);
    const direction = isDebit ? 'debit' : isCredit ? 'credit' : 'expense';
    const runningBalance = txns.slice(0, i + 1).reduce((bal, x) => {
      if (['purchase_bill'].includes(x.type)) return bal + Number(x.amount);
      if (['purchase_payment', 'purchase_return'].includes(x.type)) return bal - Number(x.amount);
      return bal;
    }, 0);
    return { ...t, direction, runningBalance };
  });

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      purchase_bill: 'Bill', purchase_return: 'Return',
      purchase_payment: 'Payment', purchase_expenses: 'Expense',
      purchase_delivered: 'Delivered',
    };
    return map[type] || type.replace(/_/g, ' ');
  };

  const paymentStr = (t: any) => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return payments.map((p: any) => `${p.mode}: ${formatINR(Number(p.amount))}`).join(', ');
  };

  const handleExportPDF = () => {
    if (!selectedSupp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text(`Supplier Report: ${selectedSupp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

    // Summary
    autoTable(doc, {
      startY: 32,
      head: [['Category', 'Amount']],
      body: [
        ['Bill A', fmtINR(totalBillA)],
        ['Bill B', fmtINR(totalBillB)],
        ['Bill C', fmtINR(totalBillC)],
        ['Return A', fmtINR(totalRetA)],
        ['Return B', fmtINR(totalRetB)],
        ['Return C', fmtINR(totalRetC)],
        ['Net Bill A', fmtINR(netBillA)],
        ['Net Bill B', netBillB >= 0 ? fmtINR(netBillB) : `-${fmtINR(netBillB)}`],
        ['Total Payments', fmtINR(totalPayments)],
        ['Total Expenses', fmtINR(totalExpenses)],
        ['Current Balance', fmtINR(Number(selectedSupp.balance || 0))],
      ],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9 },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;

    // Ledger
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Type', 'Bill#', 'BT', 'Amount', 'Payment', 'Balance']],
      body: ledgerTxns.map(t => [
        format(parseISO(t.date), 'dd MMM'),
        typeLabel(t.type),
        t.bill_number || '-',
        billTypeLabel(t.bill_type) || '-',
        fmtINR(Number(t.amount)),
        paymentStr(t) || '-',
        fmtINR(t.runningBalance),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 7 },
    });

    doc.save(`Supplier_${selectedSupp.name}_${format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedSupp) return;
    const header = ['Date', 'Type', 'Bill#', 'Bill Type', 'Amount', 'Payment', 'Running Balance'];
    const rows = [header, ...ledgerTxns.map(t => [
      format(parseISO(t.date), 'dd MMM yyyy'),
      typeLabel(t.type),
      t.bill_number || '',
      billTypeLabel(t.bill_type) || '',
      String(Number(t.amount)),
      paymentStr(t),
      String(t.runningBalance),
    ])];
    downloadCSV(rows, `Supplier_${selectedSupp.name}_${format(month, 'yyyy-MM')}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Supplier selector */}
      <select
        value={selectedSuppId}
        onChange={e => setSelectedSuppId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl"
      >
        <option value="">Select Supplier</option>
        {suppliers.map(s => (
          <option key={s.id} value={s.id}>{s.name}{Number(s.balance) > 0 ? ` (Due: ${formatINR(Number(s.balance))})` : ''}</option>
        ))}
      </select>

      {selectedSuppId && (
        <>
          {/* Month nav */}
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

          {/* View mode tabs */}
          <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
            {(['summary', 'bills', 'ledger'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}>
                {mode === 'bills' ? 'Bill-wise' : mode === 'ledger' ? 'Ledger' : 'Summary'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
          ) : (
            <>
              {/* SUMMARY VIEW */}
              {viewMode === 'summary' && (
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
              )}

              {/* BILL-WISE VIEW */}
              {viewMode === 'bills' && (
                <div className="space-y-2">
                  {txns.filter(t => ['purchase_bill', 'purchase_return'].includes(t.type)).map(t => {
                    const bill = bills.find(b => b.transaction_id === t.id);
                    const isExpanded = expandedBill === t.id;
                    return (
                      <div key={t.id} className="bg-card border border-border rounded-xl overflow-hidden">
                        <button onClick={() => setExpandedBill(isExpanded ? null : t.id)}
                          className="w-full p-3 flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className={cn("px-1.5 py-0.5 rounded font-mono text-[10px] font-bold",
                              t.type === 'purchase_return' ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                            )}>
                              {t.type === 'purchase_return' ? 'RET' : billTypeLabel(t.bill_type)}
                            </span>
                            <div className="text-left">
                              <p className="font-medium">{t.bill_number ? `#${t.bill_number}` : 'No Bill#'}</p>
                              <p className="text-[10px] text-muted-foreground">{format(parseISO(t.date), 'dd MMM yyyy')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{formatINR(Number(t.amount))}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </div>
                        </button>
                        {isExpanded && bill && (
                          <div className="border-t border-border px-3 pb-3">
                            <div className="text-[10px] text-muted-foreground mt-2 mb-1">Bill Items:</div>
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
                        {isExpanded && !bill && (
                          <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                            No bill details available
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Payments */}
                  {paymentTxns.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-muted-foreground mt-3">PAYMENTS</div>
                      {paymentTxns.map(t => (
                        <div key={t.id} className="bg-card border border-border rounded-xl p-3 flex justify-between text-xs">
                          <div>
                            <p className="font-medium">{format(parseISO(t.date), 'dd MMM yyyy')}</p>
                            <p className="text-[10px] text-muted-foreground">{paymentStr(t)}</p>
                          </div>
                          <span className="font-bold text-success">{formatINR(Number(t.amount))}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* LEDGER VIEW */}
              {viewMode === 'ledger' && (
                <div className="space-y-2">
                  {ledgerTxns.map(t => (
                    <div key={t.id} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex justify-between items-start text-xs">
                        <div>
                          <p className="font-medium">{format(parseISO(t.date), 'dd MMM yyyy, EEE')}</p>
                          <p className="text-muted-foreground">
                            {typeLabel(t.type)}
                            {t.bill_number ? ` #${t.bill_number}` : ''}
                            {t.bill_type ? ` [${billTypeLabel(t.bill_type)}]` : ''}
                          </p>
                          {paymentStr(t) && <p className="text-[10px] text-muted-foreground">{paymentStr(t)}</p>}
                        </div>
                        <div className="text-right">
                          <p className={cn("font-bold",
                            t.direction === 'debit' ? "text-warning" : t.direction === 'credit' ? "text-success" : "text-foreground"
                          )}>
                            {t.direction === 'credit' ? '-' : '+'}{formatINR(Number(t.amount))}
                          </p>
                          <p className="text-[10px] font-semibold text-primary mt-0.5">
                            Bal: {formatINR(t.runningBalance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
