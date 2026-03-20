import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, getDaysInMonth, parseISO } from 'date-fns';
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

type WageCategory = 'present' | 'rate_work' | 'payment';

interface ReportRow {
  date: string;
  wageCategory: WageCategory;
  subCategory: string;
  amount: number;
  payment: number;
  paymentDetail: string;
  balance: number;
}

export function EmployeeReport() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allowanceCategories, setAllowanceCategories] = useState<Record<string, string>>({});
  const [rateWorkTypes, setRateWorkTypes] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('allowance_categories').select('id, name'),
      supabase.from('rate_work_types').select('id, name'),
    ]).then(([empRes, alRes, rwRes]) => {
      setEmployees(empRes.data || []);
      const alMap: Record<string, string> = {};
      (alRes.data || []).forEach(c => { alMap[c.id] = c.name; });
      setAllowanceCategories(alMap);
      const rwMap: Record<string, string> = {};
      (rwRes.data || []).forEach(c => { rwMap[c.id] = c.name; });
      setRateWorkTypes(rwMap);
    });
  }, []);

  useEffect(() => {
    if (!selectedEmpId) { setTxns([]); return; }
    fetchTxns();
  }, [selectedEmpId, month]);

  const fetchTxns = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('employee_id', selectedEmpId)
      .gte('date', start)
      .lte('date', end)
      .order('date');
    setTxns(data || []);
    setLoading(false);
  };

  const selectedEmp = employees.find(e => e.id === selectedEmpId);
  const daysInMonth = getDaysInMonth(month);

  // Count days present: only salary/attendance type, NOT rate_work
  const presentDays = new Set(
    txns.filter(t => t.type === 'salary' || t.type === 'attendance').map(t => t.date)
  ).size;

  const getWageCategory = (t: any): WageCategory => {
    if (t.type === 'salary' || t.type === 'attendance' || t.type === 'daily_wage' || t.type === 'allowance') return 'present';
    if (t.type === 'rate_work') return 'rate_work';
    if (t.type === 'payment') return 'payment';
    return 'present';
  };

  const getSubCategory = (t: any): string => {
    // Allowance: check dedicated column first, then reference
    if (t.type === 'allowance') {
      const catId = t.allowance_category_id || t.reference;
      if (catId) return allowanceCategories[catId] || 'Allowance';
      return 'Allowance';
    }
    // Rate work: check dedicated column first, then reference
    if (t.type === 'rate_work') {
      const typeId = t.rate_work_type_id || t.reference;
      if (typeId) return rateWorkTypes[typeId] || 'Rate Work';
      return 'Rate Work';
    }
    if (t.type === 'payment' && t.reference) {
      const labels: Record<string, string> = { present: 'Present Due', previous: 'Previous Due', ratework: 'Rate Work Due' };
      return labels[t.reference] || t.reference;
    }
    if (t.type === 'salary' || t.type === 'attendance') return 'Day Salary';
    return t.type.replace(/_/g, ' ');
  };

  const getPaymentTotal = (t: any): number => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  };

  const getPaymentStr = (t: any): string => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return payments.filter((p: any) => p.amount > 0).map((p: any) => `${p.mode}: ${formatINR(Number(p.amount))}`).join(', ');
  };

  const wageCategoryLabel: Record<WageCategory, string> = {
    present: 'Present & Allowance',
    rate_work: 'Rate Work',
    payment: 'Payment',
  };

  const wageCategoryColor: Record<WageCategory, string> = {
    present: 'bg-success/10 text-success',
    rate_work: 'bg-accent/10 text-accent',
    payment: 'bg-warning/10 text-warning',
  };

  // Group transactions by wage category
  const groupedByCategory: Record<WageCategory, any[]> = { present: [], rate_work: [], payment: [] };
  txns.forEach(t => {
    const cat = getWageCategory(t);
    groupedByCategory[cat].push(t);
  });

  // Category totals
  const categoryTotals: Record<WageCategory, { amount: number; paid: number }> = {
    present: { amount: 0, paid: 0 },
    rate_work: { amount: 0, paid: 0 },
    payment: { amount: 0, paid: 0 },
  };
  (Object.keys(groupedByCategory) as WageCategory[]).forEach(cat => {
    groupedByCategory[cat].forEach(t => {
      categoryTotals[cat].amount += Number(t.amount);
      categoryTotals[cat].paid += getPaymentTotal(t);
    });
  });

  const totalAmount = txns.reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid = txns.reduce((s, t) => s + getPaymentTotal(t), 0);
  const totalBalance = totalAmount - totalPaid;

  const handleExportPDF = () => {
    if (!selectedEmp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Employee Report: ${selectedEmp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });
    doc.text(`Days Present: ${presentDays}/${daysInMonth} | Total: ${fmtINR(totalAmount)} | Paid: ${fmtINR(totalPaid)} | Balance: ${fmtINR(totalBalance)}`, pw / 2, 31, { align: 'center' });

    let y = 36;

    // Each wage category section
    const categories: WageCategory[] = ['present', 'rate_work', 'payment'];
    categories.forEach(cat => {
      const catTxns = groupedByCategory[cat];
      if (catTxns.length === 0) return;

      doc.setFontSize(11);
      doc.text(wageCategoryLabel[cat], 14, y);
      y += 4;

      let runBal = 0;
      const body = catTxns.map(t => {
        const amt = Number(t.amount);
        const paid = getPaymentTotal(t);
        runBal += amt - paid;
        return [
          format(parseISO(t.date), 'dd MMM'),
          getSubCategory(t),
          fmtINR(amt),
          getPaymentStr(t) || '-',
          fmtINR(runBal),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['Date', 'Sub Category', 'Amount', 'Payment', 'Balance']],
        body,
        foot: [['', 'Total', fmtINR(categoryTotals[cat].amount), fmtINR(categoryTotals[cat].paid), fmtINR(categoryTotals[cat].amount - categoryTotals[cat].paid)]],
        theme: 'striped',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    });

    doc.save(`Employee_${selectedEmp.name}_${format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedEmp) return;
    const header = ['Date', 'Wage Category', 'Sub Category', 'Amount', 'Payment', 'Balance'];
    const rows: string[][] = [header];
    const categories: WageCategory[] = ['present', 'allowance', 'rate_work', 'payment'];
    categories.forEach(cat => {
      let runBal = 0;
      groupedByCategory[cat].forEach(t => {
        const amt = Number(t.amount);
        const paid = getPaymentTotal(t);
        runBal += amt - paid;
        rows.push([
          format(parseISO(t.date), 'dd MMM yyyy'),
          wageCategoryLabel[cat],
          getSubCategory(t),
          String(amt),
          String(paid),
          String(runBal),
        ]);
      });
    });
    downloadCSV(rows, `Employee_${selectedEmp.name}_${format(month, 'yyyy-MM')}.csv`);
  };

  return (
    <div className="space-y-4">
      <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl">
        <option value="">Select Employee</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      {selectedEmpId && (
        <>
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

          {selectedEmp && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Days Present</p>
                <p className="text-lg font-bold">{presentDays} <span className="text-xs text-muted-foreground font-normal">/ {daysInMonth}</span></p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Salary</p>
                <p className="text-sm font-semibold">{formatINR(Number(selectedEmp.salary || 0))}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-lg font-bold text-primary">{formatINR(totalAmount)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Balance Due</p>
                <p className={cn("text-lg font-bold", totalBalance > 0 ? "text-warning" : "text-success")}>
                  {formatINR(totalBalance)}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
          ) : (
            <div className="space-y-3">
              {/* Each wage category section */}
              {(['present', 'allowance', 'rate_work', 'payment'] as WageCategory[]).map(cat => {
                const catTxns = groupedByCategory[cat];
                if (catTxns.length === 0) return null;

                let runBal = 0;
                const catBalance = categoryTotals[cat].amount - categoryTotals[cat].paid;

                return (
                  <div key={cat} className="bg-card border border-border rounded-xl overflow-hidden">
                    {/* Category Header */}
                    <div className="px-3 py-2 bg-secondary/50 border-b border-border flex justify-between items-center">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", wageCategoryColor[cat])}>
                        {wageCategoryLabel[cat]}
                      </span>
                      <div className="flex gap-3 text-[10px] text-muted-foreground">
                        <span>Amt: <span className="font-semibold text-foreground">{formatINR(categoryTotals[cat].amount)}</span></span>
                        <span>Paid: <span className="font-semibold text-foreground">{formatINR(categoryTotals[cat].paid)}</span></span>
                        <span>Bal: <span className={cn("font-semibold", catBalance > 0 ? "text-warning" : "text-success")}>{formatINR(catBalance)}</span></span>
                      </div>
                    </div>

                    {/* Column Header */}
                    <div className="grid grid-cols-[55px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                      <span>Date</span>
                      <span>Sub Category</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Payment</span>
                      <span className="text-right">Balance</span>
                    </div>

                    {/* Rows */}
                    {catTxns.map(t => {
                      const amt = Number(t.amount);
                      const paid = getPaymentTotal(t);
                      runBal += amt - paid;
                      return (
                        <div key={t.id} className="grid grid-cols-[55px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 last:border-0 text-[11px] items-start">
                          <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                          <span className="font-medium truncate">{getSubCategory(t)}</span>
                          <span className="text-right font-semibold">{formatINR(amt)}</span>
                          <span className="text-right text-muted-foreground text-[10px]">{getPaymentStr(t) || '-'}</span>
                          <span className={cn("text-right font-semibold", runBal > 0 ? "text-warning" : "text-success")}>{formatINR(runBal)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Grand Total */}
              <div className="bg-card border border-border rounded-xl p-3 flex justify-between items-center">
                <span className="text-xs font-bold text-foreground">Grand Total</span>
                <div className="flex gap-4 text-xs">
                  <span>Earned: <span className="font-bold">{formatINR(totalAmount)}</span></span>
                  <span>Paid: <span className="font-bold">{formatINR(totalPaid)}</span></span>
                  <span className={cn("font-bold", totalBalance > 0 ? "text-warning" : "text-success")}>
                    Balance: {formatINR(totalBalance)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
