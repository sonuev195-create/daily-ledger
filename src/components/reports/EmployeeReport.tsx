import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, getDaysInMonth, parseISO, subDays } from 'date-fns';
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

type ViewMode = 'month' | 'yearly' | 'custom';

export function EmployeeReport() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [month, setMonth] = useState(new Date());
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
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

  // Compute date range
  const getDateRange = (): { startDate: string; endDate: string; label: string } => {
    if (viewMode === 'month') {
      return {
        startDate: format(startOfMonth(month), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(month), 'yyyy-MM-dd'),
        label: format(month, 'MMMM yyyy'),
      };
    } else if (viewMode === 'yearly') {
      return {
        startDate: format(startOfYear(month), 'yyyy-MM-dd'),
        endDate: format(endOfYear(month), 'yyyy-MM-dd'),
        label: format(month, 'yyyy'),
      };
    } else {
      return {
        startDate: customStart,
        endDate: customEnd,
        label: `${format(parseISO(customStart), 'dd MMM yyyy')} - ${format(parseISO(customEnd), 'dd MMM yyyy')}`,
      };
    }
  };

  const { startDate, endDate, label: dateLabel } = getDateRange();

  useEffect(() => {
    if (!selectedEmpId) { setAllTxns([]); return; }
    fetchTxns();
  }, [selectedEmpId, viewMode, month, customStart, customEnd]);

  const fetchTxns = async () => {
    setLoading(true);
    // Fetch ALL transactions up to end of range
    const { data } = await supabase.from('transactions').select('*')
      .eq('employee_id', selectedEmpId)
      .eq('section', 'employee')
      .lte('date', endDate)
      .order('date');
    setAllTxns(data || []);
    setLoading(false);
  };

  const selectedEmp = employees.find(e => e.id === selectedEmpId);

  const isDaySalary = (t: any) => t.type !== 'rate_work' && !(t.type === 'payment' && t.reference === 'ratework');
  const isRateWork = (t: any) => t.type === 'rate_work' || (t.type === 'payment' && t.reference === 'ratework');

  // Split: before range vs in range
  const beforeRangeTxns = allTxns.filter(t => t.date < startDate);
  const inRangeTxns = allTxns.filter(t => t.date >= startDate && t.date <= endDate);

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

  // Opening dues (before the range)
  const calcOpeningDue = (txns: any[]): number => {
    return txns.reduce((s, t) => s + getBalanceDelta(t), 0);
  };

  const beforeDaySalaryTxns = beforeRangeTxns.filter(isDaySalary);
  const beforeRateWorkTxns = beforeRangeTxns.filter(isRateWork);
  const openingDaySalaryDue = calcOpeningDue(beforeDaySalaryTxns);
  const openingRateWorkDue = calcOpeningDue(beforeRateWorkTxns);

  // In-range txns
  const rangeDaySalaryTxns = inRangeTxns.filter(isDaySalary);
  const rangeRateWorkTxns = inRangeTxns.filter(isRateWork);

  const rangeEarned = (txns: any[]) => txns.filter(t => t.type !== 'payment').reduce((s, t) => s + Number(t.amount), 0);
  const rangePaid = (txns: any[]) => txns.reduce((s, t) => s + getPaymentTotal(t), 0);

  const dayEarned = rangeEarned(rangeDaySalaryTxns);
  const dayPaid = rangePaid(rangeDaySalaryTxns);
  const rwEarned = rangeEarned(rangeRateWorkTxns);
  const rwPaid = rangePaid(rangeRateWorkTxns);

  const closingDaySalaryDue = openingDaySalaryDue + dayEarned - dayPaid;
  const closingRateWorkDue = openingRateWorkDue + rwEarned - rwPaid;
  const grandTotalDue = closingDaySalaryDue + closingRateWorkDue;

  const presentDays = new Set(
    rangeDaySalaryTxns.filter(t => t.type === 'salary' || t.type === 'attendance').map(t => t.date)
  ).size;

  const handleExportPDF = () => {
    if (!selectedEmp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Employee Report: ${selectedEmp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(dateLabel, pw / 2, 25, { align: 'center' });

    let y = 36;

    // Day Salary section
    doc.setFontSize(11);
    doc.text('Day Salary + Allowance', 14, y);
    y += 4;
    const dsBody: string[][] = [];
    dsBody.push(['Opening Due', '', '', '', fmtINR(openingDaySalaryDue)]);
    let runBal = openingDaySalaryDue;
    rangeDaySalaryTxns.forEach(t => {
      runBal += getBalanceDelta(t);
      dsBody.push([
        format(parseISO(t.date), 'dd MMM'),
        getSubCategory(t),
        t.type === 'payment' ? '' : fmtINR(Number(t.amount)),
        getPaymentStr(t) || '-',
        fmtINR(runBal),
      ]);
    });
    autoTable(doc, {
      startY: y, head: [['Date', 'Type', 'Earned', 'Payment', 'Balance']], body: dsBody,
      theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Rate Work section
    if (openingRateWorkDue !== 0 || rangeRateWorkTxns.length > 0) {
      doc.setFontSize(11);
      doc.text('Rate Work', 14, y);
      y += 4;
      const rwBody: string[][] = [];
      rwBody.push(['Opening Due', '', '', '', fmtINR(openingRateWorkDue)]);
      let rwBal = openingRateWorkDue;
      rangeRateWorkTxns.forEach(t => {
        rwBal += getBalanceDelta(t);
        rwBody.push([
          format(parseISO(t.date), 'dd MMM'),
          getSubCategory(t),
          t.type === 'payment' ? '' : fmtINR(Number(t.amount)),
          getPaymentStr(t) || '-',
          fmtINR(rwBal),
        ]);
      });
      autoTable(doc, {
        startY: y, head: [['Date', 'Type', 'Earned', 'Payment', 'Balance']], body: rwBody,
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 8 },
      });
    }

    doc.save(`Employee_${selectedEmp.name}_${dateLabel.replace(/\s/g, '_')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedEmp) return;
    const header = ['Date', 'Section', 'Type', 'Earned', 'Payment', 'Balance'];
    const rows: string[][] = [header];

    rows.push(['Opening Due', 'Day Salary', '', '', '', String(openingDaySalaryDue)]);
    let runBal = openingDaySalaryDue;
    rangeDaySalaryTxns.forEach(t => {
      runBal += getBalanceDelta(t);
      rows.push([format(parseISO(t.date), 'dd MMM yyyy'), 'Day Salary', getSubCategory(t),
        t.type === 'payment' ? '' : String(Number(t.amount)), String(getPaymentTotal(t)), String(runBal)]);
    });

    rows.push(['Opening Due', 'Rate Work', '', '', '', String(openingRateWorkDue)]);
    let rwBal = openingRateWorkDue;
    rangeRateWorkTxns.forEach(t => {
      rwBal += getBalanceDelta(t);
      rows.push([format(parseISO(t.date), 'dd MMM yyyy'), 'Rate Work', getSubCategory(t),
        t.type === 'payment' ? '' : String(Number(t.amount)), String(getPaymentTotal(t)), String(rwBal)]);
    });

    downloadCSV(rows, `Employee_${selectedEmp.name}_${dateLabel.replace(/\s/g, '_')}.csv`);
  };

  const viewModes: { id: ViewMode; label: string }[] = [
    { id: 'month', label: 'Month' },
    { id: 'yearly', label: 'Yearly' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4">
      <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl">
        <option value="">Select Employee</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      {selectedEmpId && (
        <>
          {/* View Mode Tabs */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            {viewModes.map(m => (
              <button key={m.id} onClick={() => setViewMode(m.id)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition-colors",
                  viewMode === m.id ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                )}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Date Navigation */}
          {viewMode === 'month' && (
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
          )}

          {viewMode === 'yearly' && (
            <div className="flex items-center justify-between">
              <button onClick={() => { const d = new Date(month); d.setFullYear(d.getFullYear() - 1); setMonth(d); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium">{format(month, 'yyyy')}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => { const d = new Date(month); d.setFullYear(d.getFullYear() + 1); setMonth(d); }}
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
          )}

          {viewMode === 'custom' && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">From</label>
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">To</label>
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="flex gap-1 pt-3">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || allTxns.length === 0}>
                    <Download className="w-3 h-3" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={loading || allTxns.length === 0}>
                    <FileSpreadsheet className="w-3 h-3" /> CSV
                  </Button>
                </div>
              </div>
            </div>
          )}

          {selectedEmp && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Days Present</p>
                <p className="text-lg font-bold">{presentDays}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Salary/Day</p>
                <p className="text-sm font-semibold">{formatINR(Number(selectedEmp.salary || 0))}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Period Earned</p>
                <p className="text-lg font-bold text-primary">{formatINR(dayEarned + rwEarned)}</p>
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
              {/* Day Salary Section */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-success/10 border-b border-border flex justify-between items-center">
                  <span className="text-xs font-semibold text-success">Day Salary + Allowance</span>
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    <span>Earned: <span className="font-semibold text-foreground">{formatINR(dayEarned)}</span></span>
                    <span>Due: <span className={cn("font-semibold", closingDaySalaryDue > 0 ? "text-warning" : "text-success")}>{formatINR(closingDaySalaryDue)}</span></span>
                  </div>
                </div>
                <div className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                  <span>Date</span>
                  <span>Type</span>
                  <span className="text-right">Earned</span>
                  <span className="text-right">Payment</span>
                  <span className="text-right">Balance</span>
                </div>
                {/* Opening Due Row */}
                <div className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 text-[11px] bg-warning/5">
                  <span className="text-muted-foreground">-</span>
                  <span className="font-semibold text-warning">Opening Due</span>
                  <span></span>
                  <span></span>
                  <span className={cn("text-right font-bold", openingDaySalaryDue > 0 ? "text-warning" : "text-success")}>{formatINR(openingDaySalaryDue)}</span>
                </div>
                {(() => {
                  let runBal = openingDaySalaryDue;
                  return rangeDaySalaryTxns.map(t => {
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

              {/* Rate Work Section */}
              {(openingRateWorkDue !== 0 || rangeRateWorkTxns.length > 0) && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-accent/10 border-b border-border flex justify-between items-center">
                    <span className="text-xs font-semibold text-accent">Rate Work</span>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span>Earned: <span className="font-semibold text-foreground">{formatINR(rwEarned)}</span></span>
                      <span>Due: <span className={cn("font-semibold", closingRateWorkDue > 0 ? "text-warning" : "text-success")}>{formatINR(closingRateWorkDue)}</span></span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                    <span>Date</span>
                    <span>Type</span>
                    <span className="text-right">Earned</span>
                    <span className="text-right">Payment</span>
                    <span className="text-right">Balance</span>
                  </div>
                  {/* Opening Due Row */}
                  <div className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 text-[11px] bg-warning/5">
                    <span className="text-muted-foreground">-</span>
                    <span className="font-semibold text-warning">Opening Due</span>
                    <span></span>
                    <span></span>
                    <span className={cn("text-right font-bold", openingRateWorkDue > 0 ? "text-warning" : "text-success")}>{formatINR(openingRateWorkDue)}</span>
                  </div>
                  {(() => {
                    let rwBal = openingRateWorkDue;
                    return rangeRateWorkTxns.map(t => {
                      rwBal += getBalanceDelta(t);
                      return (
                        <div key={t.id} className="grid grid-cols-[50px_1fr_55px_70px_55px] gap-1 px-3 py-1.5 border-b border-border/50 last:border-0 text-[11px]">
                          <span className="text-muted-foreground">{format(parseISO(t.date), 'dd MMM')}</span>
                          <span className="font-medium truncate">{getSubCategory(t)}</span>
                          <span className="text-right font-semibold">{t.type === 'payment' ? '-' : formatINR(Number(t.amount))}</span>
                          <span className="text-right text-muted-foreground text-[10px]">{getPaymentStr(t) || '-'}</span>
                          <span className={cn("text-right font-semibold", rwBal > 0 ? "text-warning" : "text-success")}>{formatINR(rwBal)}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Grand Total */}
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold">Grand Total Due</span>
                  <div className="flex gap-3">
                    <span>Day Salary: <span className={cn("font-bold", closingDaySalaryDue > 0 ? "text-warning" : "text-success")}>{formatINR(closingDaySalaryDue)}</span></span>
                    <span>Rate Work: <span className={cn("font-bold", closingRateWorkDue > 0 ? "text-warning" : "text-success")}>{formatINR(closingRateWorkDue)}</span></span>
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
