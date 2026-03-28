import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, getDaysInMonth, parseISO, subMonths, isAfter, isBefore, startOfDay } from 'date-fns';
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

interface MonthDue {
  monthLabel: string;
  monthKey: string;
  earned: number;
  paid: number;
  due: number;
  txns: any[];
}

export function EmployeeReport() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [allTxns, setAllTxns] = useState<any[]>([]);
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
    if (!selectedEmpId) { setAllTxns([]); return; }
    fetchTxns();
  }, [selectedEmpId, month]);

  const fetchTxns = async () => {
    setLoading(true);
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    // Fetch ALL transactions up to end of selected month
    const { data } = await supabase.from('transactions').select('*')
      .eq('employee_id', selectedEmpId)
      .eq('section', 'employee')
      .lte('date', end)
      .order('date');
    setAllTxns(data || []);
    setLoading(false);
  };

  const selectedEmp = employees.find(e => e.id === selectedEmpId);
  const daysInMonth = getDaysInMonth(month);
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  // Separate day salary vs rate work
  const isDaySalary = (t: any) => t.type !== 'rate_work' && !(t.type === 'payment' && t.reference === 'ratework');
  const isRateWork = (t: any) => t.type === 'rate_work' || (t.type === 'payment' && t.reference === 'ratework');

  // Current month txns
  const currentMonthTxns = allTxns.filter(t => t.date >= monthStartStr && t.date <= monthEndStr);
  const prevTxns = allTxns.filter(t => t.date < monthStartStr);

  // Present days count
  const presentDays = new Set(
    currentMonthTxns.filter(t => t.type === 'salary' || t.type === 'attendance').map(t => t.date)
  ).size;

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
      if (t.reference === 'present') return 'Current Pay';
      return 'Payment';
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

  const getBalanceDelta = (t: any): number => {
    const amt = Number(t.amount);
    const paid = getPaymentTotal(t);
    if (t.type === 'payment') return -paid;
    return amt - paid;
  };

  // ===== DAY SALARY SECTION =====
  // Group previous day salary txns by month to show month-wise dues
  const prevDaySalaryTxns = prevTxns.filter(isDaySalary);
  const currentDaySalaryTxns = currentMonthTxns.filter(isDaySalary);

  // Build month-wise previous dues
  const prevMonthDues: MonthDue[] = [];
  const monthGroups: Record<string, any[]> = {};
  prevDaySalaryTxns.forEach(t => {
    const key = t.date.substring(0, 7); // yyyy-MM
    if (!monthGroups[key]) monthGroups[key] = [];
    monthGroups[key].push(t);
  });

  Object.keys(monthGroups).sort().forEach(key => {
    const txns = monthGroups[key];
    const earned = txns.filter(t => t.type !== 'payment').reduce((s, t) => s + Number(t.amount), 0);
    const paid = txns.reduce((s, t) => s + getPaymentTotal(t), 0);
    const due = earned - paid;
    if (Math.abs(due) > 0.5) {
      const d = parseISO(key + '-01');
      prevMonthDues.push({
        monthLabel: format(d, 'MMM yyyy'),
        monthKey: key,
        earned, paid, due,
        txns,
      });
    }
  });

  const totalPrevDaySalaryDue = prevMonthDues.reduce((s, m) => s + m.due, 0);

  // Current month day salary
  const currentDayEarned = currentDaySalaryTxns.filter(t => t.type !== 'payment').reduce((s, t) => s + Number(t.amount), 0);
  const currentDayPaid = currentDaySalaryTxns.reduce((s, t) => s + getPaymentTotal(t), 0);
  const currentDayDue = currentDayEarned - currentDayPaid;

  // ===== RATE WORK SECTION =====
  const prevRateWorkTxns = prevTxns.filter(isRateWork);
  const currentRateWorkTxns = currentMonthTxns.filter(isRateWork);

  // Group rate work by month
  const rwMonthGroups: Record<string, any[]> = {};
  prevRateWorkTxns.forEach(t => {
    const key = t.date.substring(0, 7);
    if (!rwMonthGroups[key]) rwMonthGroups[key] = [];
    rwMonthGroups[key].push(t);
  });

  const prevRateWorkDues: MonthDue[] = [];
  Object.keys(rwMonthGroups).sort().forEach(key => {
    const txns = rwMonthGroups[key];
    const earned = txns.filter(t => t.type !== 'payment').reduce((s, t) => s + Number(t.amount), 0);
    const paid = txns.reduce((s, t) => s + getPaymentTotal(t), 0);
    const due = earned - paid;
    if (Math.abs(due) > 0.5) {
      const d = parseISO(key + '-01');
      prevRateWorkDues.push({
        monthLabel: format(d, 'MMM yyyy'),
        monthKey: key,
        earned, paid, due,
        txns,
      });
    }
  });

  const totalPrevRateWorkDue = prevRateWorkDues.reduce((s, m) => s + m.due, 0);
  const currentRWEarned = currentRateWorkTxns.filter(t => t.type !== 'payment').reduce((s, t) => s + Number(t.amount), 0);
  const currentRWPaid = currentRateWorkTxns.reduce((s, t) => s + getPaymentTotal(t), 0);
  const currentRWDue = currentRWEarned - currentRWPaid;

  // Grand totals
  const totalDaySalaryDue = totalPrevDaySalaryDue + currentDayDue;
  const totalRateWorkDue = totalPrevRateWorkDue + currentRWDue;
  const grandTotalDue = totalDaySalaryDue + totalRateWorkDue;

  const currentMonthLabel = format(month, 'MMM');

  const handleExportPDF = () => {
    if (!selectedEmp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Employee Report: ${selectedEmp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

    let y = 36;

    // Previous Day Salary Dues
    if (prevMonthDues.length > 0) {
      doc.setFontSize(11);
      doc.text('Previous Month Dues (Day Salary)', 14, y);
      y += 4;
      const body = prevMonthDues.map(m => [m.monthLabel, fmtINR(m.earned), fmtINR(m.paid), fmtINR(m.due)]);
      body.push(['Total', '', '', fmtINR(totalPrevDaySalaryDue)]);
      autoTable(doc, {
        startY: y, head: [['Month', 'Earned', 'Paid', 'Due']], body,
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Current Month Day Salary
    if (currentDaySalaryTxns.length > 0) {
      doc.setFontSize(11);
      doc.text(`${currentMonthLabel} - Day Salary`, 14, y);
      y += 4;
      let runBal = 0;
      const body = currentDaySalaryTxns.map(t => {
        runBal += getBalanceDelta(t);
        return [
          format(parseISO(t.date), 'dd MMM'),
          getSubCategory(t),
          t.type === 'payment' ? '' : fmtINR(Number(t.amount)),
          getPaymentStr(t) || '-',
          fmtINR(runBal),
        ];
      });
      autoTable(doc, {
        startY: y, head: [['Date', 'Type', 'Earned', 'Payment', 'Balance']], body,
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Rate Work
    if (prevRateWorkDues.length > 0 || currentRateWorkTxns.length > 0) {
      doc.setFontSize(11);
      doc.text('Rate Work', 14, y);
      y += 4;
      const body: string[][] = [];
      prevRateWorkDues.forEach(m => body.push([m.monthLabel, 'Previous Due', '', '', fmtINR(m.due)]));
      let runBal = totalPrevRateWorkDue;
      currentRateWorkTxns.forEach(t => {
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
        startY: y, head: [['Date', 'Type', 'Earned', 'Payment', 'Balance']], body,
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    doc.save(`Employee_${selectedEmp.name}_${format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedEmp) return;
    const header = ['Date', 'Section', 'Type', 'Earned', 'Payment', 'Balance'];
    const rows: string[][] = [header];

    // Previous dues
    prevMonthDues.forEach(m => {
      rows.push([m.monthLabel, 'Day Salary', 'Previous Due', String(m.earned), String(m.paid), String(m.due)]);
    });

    // Current day salary
    let runBal = 0;
    currentDaySalaryTxns.forEach(t => {
      runBal += getBalanceDelta(t);
      rows.push([format(parseISO(t.date), 'dd MMM yyyy'), 'Day Salary', getSubCategory(t),
        t.type === 'payment' ? '' : String(Number(t.amount)), String(getPaymentTotal(t)), String(runBal)]);
    });

    // Rate work
    let rwBal = totalPrevRateWorkDue;
    prevRateWorkDues.forEach(m => {
      rows.push([m.monthLabel, 'Rate Work', 'Previous Due', '', '', String(m.due)]);
    });
    currentRateWorkTxns.forEach(t => {
      rwBal += getBalanceDelta(t);
      rows.push([format(parseISO(t.date), 'dd MMM yyyy'), 'Rate Work', getSubCategory(t),
        t.type === 'payment' ? '' : String(Number(t.amount)), String(getPaymentTotal(t)), String(rwBal)]);
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
            <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary">
                <ChevronRight className="w-4 h-4" />
              </button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || allTxns.length === 0}>
                <Download className="w-3 h-3" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={loading || allTxns.length === 0}>
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
                <p className="text-xs text-muted-foreground">Salary/Day</p>
                <p className="text-sm font-semibold">{formatINR(Number(selectedEmp.salary || 0))}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">{currentMonthLabel} Earned</p>
                <p className="text-lg font-bold text-primary">{formatINR(currentDayEarned + currentRWEarned)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Total Due</p>
                <p className={cn("text-lg font-bold", grandTotalDue > 0 ? "text-warning" : "text-success")}>
                  {formatINR(grandTotalDue)}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : allTxns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions</p>
          ) : (
            <div className="space-y-3">
              {/* 1. Previous Month Dues (Day Salary) */}
              {prevMonthDues.length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-warning/10 border-b border-border">
                    <span className="text-xs font-semibold text-warning">Previous Month Dues (Day Salary)</span>
                  </div>
                  <div className="grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                    <span>Month</span>
                    <span className="text-right">Earned</span>
                    <span className="text-right">Paid</span>
                    <span className="text-right">Due</span>
                  </div>
                  {prevMonthDues.map(m => (
                    <div key={m.monthKey} className="grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-1.5 border-b border-border/50 text-[11px]">
                      <span className="font-medium">{m.monthLabel}</span>
                      <span className="text-right">{formatINR(m.earned)}</span>
                      <span className="text-right text-muted-foreground">{formatINR(m.paid)}</span>
                      <span className={cn("text-right font-semibold", m.due > 0 ? "text-warning" : "text-success")}>{formatINR(m.due)}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-2 bg-secondary/30 text-[11px] font-bold">
                    <span>Total Previous</span>
                    <span></span>
                    <span></span>
                    <span className="text-right text-warning">{formatINR(totalPrevDaySalaryDue)}</span>
                  </div>
                </div>
              )}

              {/* 2. Current Month Day Salary */}
              {(currentDaySalaryTxns.length > 0 || currentDayEarned > 0) && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-success/10 border-b border-border flex justify-between items-center">
                    <span className="text-xs font-semibold text-success">{currentMonthLabel} - Day Salary + Allowance</span>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span>Earned: <span className="font-semibold text-foreground">{formatINR(currentDayEarned)}</span></span>
                      <span>Paid: <span className="font-semibold text-foreground">{formatINR(currentDayPaid)}</span></span>
                      <span>Due: <span className={cn("font-semibold", currentDayDue > 0 ? "text-warning" : "text-success")}>{formatINR(currentDayDue)}</span></span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                    <span>Date</span>
                    <span>Type</span>
                    <span className="text-right">Earned</span>
                    <span className="text-right">Payment</span>
                    <span className="text-right">Balance</span>
                  </div>
                  {(() => {
                    let runBal = 0;
                    return currentDaySalaryTxns.map(t => {
                      runBal += getBalanceDelta(t);
                      return (
                        <div key={t.id} className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 last:border-0 text-[11px]">
                          <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                          <span className="font-medium truncate">{getSubCategory(t)}</span>
                          <span className="text-right font-semibold">{t.type === 'payment' ? '-' : formatINR(Number(t.amount))}</span>
                          <span className="text-right text-muted-foreground text-[10px]">{getPaymentStr(t) || '-'}</span>
                          <span className={cn("text-right font-semibold", runBal > 0 ? "text-warning" : "text-success")}>{formatINR(runBal)}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* 3. Rate Work - Previous + Current */}
              {(prevRateWorkDues.length > 0 || currentRateWorkTxns.length > 0) && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-accent/10 border-b border-border flex justify-between items-center">
                    <span className="text-xs font-semibold text-accent">Rate Work</span>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      {totalPrevRateWorkDue > 0 && <span>Prev: <span className="font-semibold text-warning">{formatINR(totalPrevRateWorkDue)}</span></span>}
                      <span>{currentMonthLabel}: <span className={cn("font-semibold", currentRWDue > 0 ? "text-warning" : "text-success")}>{formatINR(currentRWDue)}</span></span>
                    </div>
                  </div>

                  {/* Previous rate work month-wise */}
                  {prevRateWorkDues.length > 0 && (
                    <>
                      <div className="grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                        <span>Month</span>
                        <span className="text-right">Earned</span>
                        <span className="text-right">Paid</span>
                        <span className="text-right">Due</span>
                      </div>
                      {prevRateWorkDues.map(m => (
                        <div key={m.monthKey} className="grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-1.5 border-b border-border/50 text-[11px]">
                          <span className="font-medium">{m.monthLabel}</span>
                          <span className="text-right">{formatINR(m.earned)}</span>
                          <span className="text-right text-muted-foreground">{formatINR(m.paid)}</span>
                          <span className={cn("text-right font-semibold", m.due > 0 ? "text-warning" : "text-success")}>{formatINR(m.due)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Current month rate work detail */}
                  {currentRateWorkTxns.length > 0 && (
                    <>
                      <div className="px-3 py-1 bg-secondary/30 text-[10px] font-semibold text-muted-foreground border-b border-border">
                        {currentMonthLabel} Rate Work Detail
                      </div>
                      <div className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                        <span>Date</span>
                        <span>Type</span>
                        <span className="text-right">Earned</span>
                        <span className="text-right">Payment</span>
                        <span className="text-right">Balance</span>
                      </div>
                      {(() => {
                        let rwRunBal = totalPrevRateWorkDue;
                        return currentRateWorkTxns.map(t => {
                          rwRunBal += getBalanceDelta(t);
                          return (
                            <div key={t.id} className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 last:border-0 text-[11px]">
                              <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                              <span className="font-medium truncate">{getSubCategory(t)}</span>
                              <span className="text-right font-semibold">{t.type === 'payment' ? '-' : formatINR(Number(t.amount))}</span>
                              <span className="text-right text-muted-foreground text-[10px]">{getPaymentStr(t) || '-'}</span>
                              <span className={cn("text-right font-semibold", rwRunBal > 0 ? "text-warning" : "text-success")}>{formatINR(rwRunBal)}</span>
                            </div>
                          );
                        });
                      })()}
                    </>
                  )}
                </div>
              )}

              {/* Grand Total */}
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold">Grand Total Due</span>
                  <div className="flex gap-3">
                    <span>Day Salary: <span className={cn("font-bold", totalDaySalaryDue > 0 ? "text-warning" : "text-success")}>{formatINR(totalDaySalaryDue)}</span></span>
                    <span>Rate Work: <span className={cn("font-bold", totalRateWorkDue > 0 ? "text-warning" : "text-success")}>{formatINR(totalRateWorkDue)}</span></span>
                  </div>
                </div>
                <div className="text-right mt-1">
                  <span className={cn("text-sm font-bold", grandTotalDue > 0 ? "text-warning" : "text-success")}>
                    Total: {formatINR(grandTotalDue)}
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
