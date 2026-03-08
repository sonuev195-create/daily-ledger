import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSunday } from 'date-fns';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, Receipt, Wallet, CreditCard, ShoppingCart, AlertTriangle } from 'lucide-react';
import { getTransactionsByDateRange, getDrawerClosing } from '@/lib/db';
import { Transaction } from '@/types';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';

interface DaySummary {
  date: Date;
  totalSales: number;
  cashReceived: number;
  upiReceived: number;
  totalExpenses: number;
  purchasePayment: number;
  count: number;
  drawerError: number;
}

interface MonthViewProps {
  initialMonth?: Date;
  onDayClick: (date: Date) => void;
}

export function MonthView({ initialMonth, onDayClick }: MonthViewProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth || new Date());
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadMonthData(); }, [currentMonth]);

  const loadMonthData = async () => {
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    try {
      const allTxns = await getTransactionsByDateRange(start, end);
      const closings = await Promise.all(days.map(d => getDrawerClosing(d)));

      const summaries = days.map((date, idx) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayTxns = allTxns.filter(t => format(t.date, 'yyyy-MM-dd') === dateStr);

        let totalSales = 0, cashReceived = 0, upiReceived = 0, totalExpenses = 0, purchasePayment = 0;

        dayTxns.forEach(t => {
          if (t.section === 'sale' && t.type === 'sale') totalSales += t.amount;
          if (['sale', 'customer_advance', 'balance_paid'].includes(t.type) && t.section === 'sale') {
            t.payments.forEach(p => {
              if (p.mode === 'cash') cashReceived += p.amount;
              if (p.mode === 'upi') upiReceived += p.amount;
            });
          }
          if (t.section === 'expenses' || t.section === 'employee') {
            t.payments.forEach(p => { totalExpenses += p.amount; });
          }
          if (t.section === 'purchase' && (t.type === 'purchase_payment' || t.type === 'purchase_expenses')) {
            t.payments.forEach(p => { purchasePayment += p.amount; });
          }
        });

        return { date, totalSales, cashReceived, upiReceived, totalExpenses, purchasePayment, count: dayTxns.length, drawerError: closings[idx]?.difference || 0 };
      });

      setDaySummaries(summaries);
    } catch (err) {
      console.error('Month load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d); };
  const goToNextMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1); setCurrentMonth(d); };

  const formatCompact = (n: number) => n === 0 ? '-' : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`;

  const monthTotals = daySummaries.reduce((a, d) => ({
    totalSales: a.totalSales + d.totalSales,
    received: a.received + d.cashReceived + d.upiReceived,
    expenses: a.expenses + d.totalExpenses + d.purchasePayment,
    count: a.count + d.count,
  }), { totalSales: 0, received: 0, expenses: 0, count: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={goToPrevMonth} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
        </div>
        <button onClick={goToNextMonth} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Month Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-card rounded-xl border border-border">
        <div>
          <p className="text-lg font-bold text-foreground">{formatINR(monthTotals.totalSales)}</p>
          <p className="text-[10px] text-muted-foreground">Total Sales</p>
        </div>
        <div>
          <p className="text-lg font-bold text-success">{formatINR(monthTotals.received)}</p>
          <p className="text-[10px] text-muted-foreground">Received</p>
        </div>
        <div>
          <p className="text-lg font-bold text-destructive">{formatINR(monthTotals.expenses)}</p>
          <p className="text-[10px] text-muted-foreground">Spent</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{monthTotals.count}</p>
          <p className="text-[10px] text-muted-foreground">Transactions</p>
        </div>
      </div>

      {/* Day rows */}
      <div className="space-y-1.5">
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-secondary/50 animate-pulse" />)
        ) : (
          daySummaries.map((day, index) => (
            <motion.button
              key={day.date.toISOString()}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.015 }}
              onClick={() => onDayClick(day.date)}
              className={cn(
                "w-full bg-card border border-border rounded-xl p-3 text-left transition-colors hover:bg-secondary/30",
                isToday(day.date) && "ring-2 ring-accent"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0",
                  isSunday(day.date) ? "bg-destructive/10 text-destructive" :
                    isToday(day.date) ? "gradient-accent text-accent-foreground" : "bg-secondary text-foreground"
                )}>
                  <span className="text-lg font-bold leading-none">{format(day.date, 'd')}</span>
                  <span className={cn("text-[9px] uppercase mt-0.5", isSunday(day.date) && "text-destructive")}>{format(day.date, 'EEE')}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {day.count > 0 ? (
                    <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[11px]">
                      <div className="flex items-center gap-0.5"><Receipt className="w-3 h-3 text-primary shrink-0" /><span className="font-medium">{formatCompact(day.totalSales)}</span></div>
                      <div className="flex items-center gap-0.5"><Wallet className="w-3 h-3 text-success shrink-0" /><span className="text-success">{formatCompact(day.cashReceived)}</span></div>
                      <div className="flex items-center gap-0.5"><CreditCard className="w-3 h-3 text-info shrink-0" /><span className="text-info">{formatCompact(day.upiReceived)}</span></div>
                      <div className="text-right"><span className="text-muted-foreground">{day.count} txn</span></div>
                      <div className="text-destructive">{formatCompact(day.totalExpenses)}</div>
                      <div className="flex items-center gap-0.5"><ShoppingCart className="w-3 h-3 text-warning shrink-0" /><span className="text-warning">{formatCompact(day.purchasePayment)}</span></div>
                      <div></div>
                      <div></div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-1">No transactions</p>
                  )}
                  {day.drawerError !== 0 && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-warning">
                      <AlertTriangle className="w-3 h-3" /> Drawer: {formatCompact(Math.abs(day.drawerError))}
                    </div>
                  )}
                </div>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}

interface YearViewProps {
  initialYear?: number;
  onMonthClick: (date: Date) => void;
}

interface MonthSummaryData {
  date: Date;
  label: string;
  totalSales: number;
  totalReceived: number;
  totalSpent: number;
  count: number;
}

export function YearView({ initialYear, onMonthClick }: YearViewProps) {
  const [currentYear, setCurrentYear] = useState(initialYear || new Date().getFullYear());
  const [monthSummaries, setMonthSummaries] = useState<MonthSummaryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadYearData(); }, [currentYear]);

  const loadYearData = async () => {
    setLoading(true);
    try {
      const start = new Date(currentYear, 0, 1);
      const end = new Date(currentYear, 11, 31);
      const allTxns = await getTransactionsByDateRange(start, end);

      const months: MonthSummaryData[] = Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(currentYear, i, 1);
        const monthStr = format(monthDate, 'yyyy-MM');
        const monthTxns = allTxns.filter(t => format(t.date, 'yyyy-MM') === monthStr);

        let totalSales = 0, totalReceived = 0, totalSpent = 0;
        monthTxns.forEach(t => {
          if (t.section === 'sale' && t.type === 'sale') totalSales += t.amount;
          if (t.section === 'sale') t.payments.forEach(p => { totalReceived += p.amount; });
          if (['expenses', 'employee', 'purchase'].includes(t.section)) {
            t.payments.forEach(p => { totalSpent += p.amount; });
          }
        });

        return { date: monthDate, label: format(monthDate, 'MMM'), totalSales, totalReceived, totalSpent, count: monthTxns.length };
      });

      setMonthSummaries(months);
    } catch (err) {
      console.error('Year load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const yearTotals = monthSummaries.reduce((a, m) => ({
    sales: a.sales + m.totalSales,
    received: a.received + m.totalReceived,
    spent: a.spent + m.totalSpent,
    count: a.count + m.count,
  }), { sales: 0, received: 0, spent: 0, count: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentYear(y => y - 1)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">{currentYear}</span>
        </div>
        <button onClick={() => setCurrentYear(y => y + 1)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Year Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-card rounded-xl border border-border">
        <div>
          <p className="text-lg font-bold text-foreground">{formatINR(yearTotals.sales)}</p>
          <p className="text-[10px] text-muted-foreground">Total Sales</p>
        </div>
        <div>
          <p className="text-lg font-bold text-success">{formatINR(yearTotals.received)}</p>
          <p className="text-[10px] text-muted-foreground">Received</p>
        </div>
        <div>
          <p className="text-lg font-bold text-destructive">{formatINR(yearTotals.spent)}</p>
          <p className="text-[10px] text-muted-foreground">Spent</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{yearTotals.count}</p>
          <p className="text-[10px] text-muted-foreground">Transactions</p>
        </div>
      </div>

      {/* Month cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {loading ? (
          Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-secondary/50 animate-pulse" />)
        ) : (
          monthSummaries.map((month, idx) => {
            const isCurrent = month.date.getMonth() === new Date().getMonth() && currentYear === new Date().getFullYear();
            return (
              <motion.button
                key={idx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => onMonthClick(month.date)}
                className={cn(
                  "bg-card border rounded-xl p-3 text-left transition-all hover:shadow-md",
                  isCurrent ? "ring-2 ring-accent border-accent" : "border-border"
                )}
              >
                <p className="text-sm font-semibold text-foreground mb-1.5">{month.label}</p>
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sales</span>
                    <span className="font-medium text-foreground">{formatINR(month.totalSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">In</span>
                    <span className="font-medium text-success">{formatINR(month.totalReceived)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Out</span>
                    <span className="font-medium text-destructive">{formatINR(month.totalSpent)}</span>
                  </div>
                </div>
                {month.count > 0 && <p className="text-[9px] text-muted-foreground mt-1">{month.count} txn</p>}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
