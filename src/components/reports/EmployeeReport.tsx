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

type SalarySection = 'day_salary' | 'rate_work';

export function EmployeeReport() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [txns, setTxns] = useState<any[]>([]);
  const [prevTxns, setPrevTxns] = useState<any[]>([]);
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
    if (!selectedEmpId) { setTxns([]); setPrevTxns([]); return; }
    fetchTxns();
  }, [selectedEmpId, month]);

  const fetchTxns = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    const [{ data }, { data: prev }] = await Promise.all([
      supabase.from('transactions').select('*').eq('employee_id', selectedEmpId).gte('date', start).lte('date', end).order('date'),
      supabase.from('transactions').select('*').eq('employee_id', selectedEmpId).lt('date', start).order('date'),
    ]);
    setTxns(data || []);
    setPrevTxns(prev || []);
    setLoading(false);
  };

  const selectedEmp = employees.find(e => e.id === selectedEmpId);
  const daysInMonth = getDaysInMonth(month);

  const presentDays = new Set(
    txns.filter(t => t.type === 'salary' || t.type === 'attendance').map(t => t.date)
  ).size;

  // Classify transaction into day_salary or rate_work section
  const getSection = (t: any): SalarySection => {
    if (t.type === 'rate_work') return 'rate_work';
    if (t.type === 'payment' && t.reference === 'ratework') return 'rate_work';
    return 'day_salary'; // salary, attendance, allowance, payment(present/previous/advance)
  };

  const getSubCategory = (t: any): string => {
    if (t.type === 'allowance') {
      const catId = t.allowance_category_id || t.reference;
      return catId ? (allowanceCategories[catId] || 'Allowance') : 'Allowance';
    }
    if (t.type === 'rate_work') {
      const typeId = t.rate_work_type_id || t.reference;
      return typeId ? (rateWorkTypes[typeId] || 'Rate Work') : 'Rate Work';
    }
    if (t.type === 'payment') {
      if (t.reference === 'advance') return 'Advance';
      if (t.reference === 'previous') return 'Prev Due Pay';
      if (t.reference === 'ratework') return 'Rate Work Pay';
      return 'Day Salary Pay';
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

  // Balance delta: earned amounts are positive, payments are negative
  const getBalanceDelta = (t: any): number => {
    const amt = Number(t.amount);
    const paid = getPaymentTotal(t);
    if (t.type === 'payment') return -paid; // payment reduces balance
    return amt - paid; // salary/allowance/rate_work: earn minus any inline payment
  };

  // Calculate previous dues per section
  const calcPreviousDue = (section: SalarySection): number => {
    return prevTxns.filter(t => getSection(t) === section).reduce((bal, t) => bal + getBalanceDelta(t), 0);
  };

  const sectionLabel: Record<SalarySection, string> = {
    day_salary: 'Day Salary (Present + Allowance)',
    rate_work: 'Rate Work',
  };

  const sectionColor: Record<SalarySection, string> = {
    day_salary: 'bg-success/10 text-success',
    rate_work: 'bg-accent/10 text-accent',
  };

  // Group transactions by section
  const sections: SalarySection[] = ['day_salary', 'rate_work'];
  const groupedBySection: Record<SalarySection, any[]> = { day_salary: [], rate_work: [] };
  txns.forEach(t => {
    const sec = getSection(t);
    groupedBySection[sec].push(t);
  });

  // Section totals
  const sectionTotals: Record<SalarySection, { earned: number; paid: number; prevDue: number }> = {
    day_salary: { earned: 0, paid: 0, prevDue: calcPreviousDue('day_salary') },
    rate_work: { earned: 0, paid: 0, prevDue: calcPreviousDue('rate_work') },
  };
  sections.forEach(sec => {
    groupedBySection[sec].forEach(t => {
      if (t.type === 'payment') {
        sectionTotals[sec].paid += getPaymentTotal(t);
      } else {
        sectionTotals[sec].earned += Number(t.amount);
        sectionTotals[sec].paid += getPaymentTotal(t);
      }
    });
  });

  const totalEarned = sectionTotals.day_salary.earned + sectionTotals.rate_work.earned;
  const totalPaid = sectionTotals.day_salary.paid + sectionTotals.rate_work.paid;
  const totalPrevDue = sectionTotals.day_salary.prevDue + sectionTotals.rate_work.prevDue;
  const totalBalance = totalPrevDue + totalEarned - totalPaid;

  const handleExportPDF = () => {
    if (!selectedEmp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Employee Report: ${selectedEmp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

    let y = 36;
    sections.forEach(sec => {
      const catTxns = groupedBySection[sec];
      if (catTxns.length === 0 && sectionTotals[sec].prevDue === 0) return;

      doc.setFontSize(11);
      doc.text(sectionLabel[sec], 14, y);
      y += 4;

      let runBal = sectionTotals[sec].prevDue;
      const body: string[][] = [];
      if (sectionTotals[sec].prevDue !== 0) {
        body.push(['', 'Previous Due', '', '', fmtINR(runBal)]);
      }
      catTxns.forEach(t => {
        runBal += getBalanceDelta(t);
        body.push([
          format(parseISO(t.date), 'dd MMM'),
          getSubCategory(t),
          t.type === 'payment' ? '' : fmtINR(Number(t.amount)),
          getPaymentStr(t) || '-',
          fmtINR(runBal),
        ]);
      });

      autoTable(doc, {
        startY: y,
        head: [['Date', 'Type', 'Earned', 'Payment', 'Balance']],
        body,
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
    const header = ['Date', 'Section', 'Type', 'Earned', 'Payment', 'Balance'];
    const rows: string[][] = [header];
    sections.forEach(sec => {
      let runBal = sectionTotals[sec].prevDue;
      if (runBal !== 0) rows.push(['', sectionLabel[sec], 'Previous Due', '', '', String(runBal)]);
      groupedBySection[sec].forEach(t => {
        runBal += getBalanceDelta(t);
        rows.push([
          format(parseISO(t.date), 'dd MMM yyyy'),
          sectionLabel[sec],
          getSubCategory(t),
          t.type === 'payment' ? '' : String(Number(t.amount)),
          String(getPaymentTotal(t)),
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
                <p className="text-lg font-bold text-primary">{formatINR(totalEarned)}</p>
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
          ) : txns.length === 0 && totalPrevDue === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
          ) : (
            <div className="space-y-3">
              {sections.map(sec => {
                const catTxns = groupedBySection[sec];
                const prevDue = sectionTotals[sec].prevDue;
                if (catTxns.length === 0 && prevDue === 0) return null;

                let runBal = prevDue;
                const secBalance = prevDue + sectionTotals[sec].earned - sectionTotals[sec].paid;

                return (
                  <div key={sec} className="bg-card border border-border rounded-xl overflow-hidden">
                    {/* Section Header */}
                    <div className="px-3 py-2 bg-secondary/50 border-b border-border flex justify-between items-center">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", sectionColor[sec])}>
                        {sectionLabel[sec]}
                      </span>
                      <div className="flex gap-3 text-[10px] text-muted-foreground">
                        {prevDue > 0 && <span>Prev: <span className="font-semibold text-warning">{formatINR(prevDue)}</span></span>}
                        <span>Earned: <span className="font-semibold text-foreground">{formatINR(sectionTotals[sec].earned)}</span></span>
                        <span>Paid: <span className="font-semibold text-foreground">{formatINR(sectionTotals[sec].paid)}</span></span>
                        <span>Bal: <span className={cn("font-semibold", secBalance > 0 ? "text-warning" : "text-success")}>{formatINR(secBalance)}</span></span>
                      </div>
                    </div>

                    {/* Column Header */}
                    <div className="grid grid-cols-[55px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                      <span>Date</span>
                      <span>Type</span>
                      <span className="text-right">Earned</span>
                      <span className="text-right">Payment</span>
                      <span className="text-right">Balance</span>
                    </div>

                    {/* Previous due row */}
                    {prevDue > 0 && (
                      <div className="grid grid-cols-[55px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 text-[11px] items-start bg-warning/5">
                        <span className="text-muted-foreground">-</span>
                        <span className="font-medium text-warning">Previous Due</span>
                        <span className="text-right">-</span>
                        <span className="text-right">-</span>
                        <span className="text-right font-semibold text-warning">{formatINR(runBal)}</span>
                      </div>
                    )}

                    {/* Rows */}
                    {catTxns.map(t => {
                      runBal += getBalanceDelta(t);
                      return (
                        <div key={t.id} className="grid grid-cols-[55px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 last:border-0 text-[11px] items-start">
                          <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                          <span className="font-medium truncate">{getSubCategory(t)}</span>
                          <span className="text-right font-semibold">{t.type === 'payment' ? '-' : formatINR(Number(t.amount))}</span>
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
                  {totalPrevDue > 0 && <span>Prev: <span className="font-bold text-warning">{formatINR(totalPrevDue)}</span></span>}
                  <span>Earned: <span className="font-bold">{formatINR(totalEarned)}</span></span>
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
