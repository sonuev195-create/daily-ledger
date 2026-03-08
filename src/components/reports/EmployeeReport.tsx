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

export function EmployeeReport() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [month, setMonth] = useState(new Date());
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('employees').select('*').order('name').then(({ data }) => {
      setEmployees(data || []);
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

  // Attendance: days with at least one transaction
  const uniqueDays = new Set(txns.map(t => t.date));
  const daysPresent = uniqueDays.size;

  // Transaction totals
  const totalPaid = txns.reduce((s, t) => s + Number(t.amount), 0);

  // Running balance calculation
  const runningTxns = txns.map((t, i) => {
    const runningTotal = txns.slice(0, i + 1).reduce((s, x) => s + Number(x.amount), 0);
    return { ...t, runningTotal };
  });

  // Type labels
  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      salary: 'Salary', daily_wage: 'Daily Wage', advance: 'Advance',
      bonus: 'Bonus', deduction: 'Deduction',
    };
    return map[type] || type.replace(/_/g, ' ');
  };

  const paymentStr = (t: any) => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    return payments.map((p: any) => `${p.mode}: ${formatINR(Number(p.amount))}`).join(', ');
  };

  const handleExportPDF = () => {
    if (!selectedEmp) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text(`Employee Report: ${selectedEmp.name}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

    // Summary
    doc.setFontSize(11);
    autoTable(doc, {
      startY: 32,
      head: [['Summary', 'Value']],
      body: [
        ['Days Present', `${daysPresent} / ${daysInMonth}`],
        ['Total Paid', fmtINR(totalPaid)],
        ['Monthly Salary', fmtINR(Number(selectedEmp.salary || 0))],
        ['Advance Balance', fmtINR(Number(selectedEmp.advance_balance || 0))],
      ],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9 },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;

    // Transactions
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Type', 'Amount', 'Payment', 'Running Total']],
      body: runningTxns.map(t => [
        format(parseISO(t.date), 'dd MMM'),
        typeLabel(t.type),
        fmtINR(Number(t.amount)),
        paymentStr(t) || '-',
        fmtINR(t.runningTotal),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 8 },
    });

    doc.save(`Employee_${selectedEmp.name}_${format(month, 'yyyy-MM')}.pdf`);
  };

  const handleExportCSV = () => {
    if (!selectedEmp) return;
    const header = ['Date', 'Type', 'Amount', 'Payment', 'Running Total'];
    const rows = [header, ...runningTxns.map(t => [
      format(parseISO(t.date), 'dd MMM yyyy'),
      typeLabel(t.type),
      String(Number(t.amount)),
      paymentStr(t),
      String(t.runningTotal),
    ])];
    downloadCSV(rows, `Employee_${selectedEmp.name}_${format(month, 'yyyy-MM')}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Employee selector */}
      <select
        value={selectedEmpId}
        onChange={e => setSelectedEmpId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl"
      >
        <option value="">Select Employee</option>
        {employees.map(e => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      {selectedEmpId && (
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

          {/* Summary cards */}
          {selectedEmp && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Days Present</p>
                <p className="text-lg font-bold">{daysPresent} <span className="text-xs text-muted-foreground font-normal">/ {daysInMonth}</span></p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="text-lg font-bold text-primary">{formatINR(totalPaid)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Salary</p>
                <p className="text-sm font-semibold">{formatINR(Number(selectedEmp.salary || 0))}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Advance Balance</p>
                <p className={cn("text-sm font-semibold", Number(selectedEmp.advance_balance) > 0 ? "text-warning" : "text-success")}>
                  {formatINR(Number(selectedEmp.advance_balance || 0))}
                </p>
              </div>
            </div>
          )}

          {/* Transaction list with running balance */}
          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions this month</p>
          ) : (
            <div className="space-y-2">
              {runningTxns.map((t, i) => (
                <div key={t.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <p className="font-medium">{format(parseISO(t.date), 'dd MMM, EEE')}</p>
                      <p className="text-muted-foreground">{typeLabel(t.type)}</p>
                      {t.reference && <p className="text-[10px] text-muted-foreground">{t.reference}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatINR(Number(t.amount))}</p>
                      <p className="text-[10px] text-muted-foreground">{paymentStr(t)}</p>
                      <p className="text-[10px] font-semibold text-primary mt-0.5">Running: {formatINR(t.runningTotal)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
