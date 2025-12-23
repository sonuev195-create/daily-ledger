import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { getTransactionsByDate, getDrawerClosing } from '@/lib/db';
import { Transaction, DrawerClosing } from '@/types';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DaySummary {
  date: Date;
  transactions: Transaction[];
  totalSales: number;
  totalReceived: number;
  totalSpent: number;
  drawerError: number;
  count: number;
}

export default function AllDatesPage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMonthData();
  }, [currentMonth]);

  const loadMonthData = async () => {
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    const summaries: DaySummary[] = await Promise.all(
      days.map(async (date) => {
        const transactions = await getTransactionsByDate(date);
        const closing = await getDrawerClosing(date);
        
        let totalSales = 0;
        let totalReceived = 0;
        let totalSpent = 0;

        transactions.forEach((t) => {
          // Calculate total sales
          if (t.section === 'sale' && t.type !== 'sales_return') {
            totalSales += t.amount;
          }
          
          // Calculate received (money in)
          if (['sale', 'customer_advance', 'balance_paid'].includes(t.type) || 
              (t.section === 'purchase' && t.type === 'purchase_return')) {
            t.payments.forEach(p => {
              if (['cash', 'upi', 'bank'].includes(p.mode)) {
                totalReceived += p.amount;
              }
            });
          }
          
          // Calculate spent (money out)
          if (t.section === 'expenses' || 
              (t.section === 'purchase' && t.type !== 'purchase_return') ||
              t.section === 'employee' ||
              t.type === 'sales_return') {
            t.payments.forEach(p => {
              if (['cash', 'upi', 'bank'].includes(p.mode)) {
                totalSpent += p.amount;
              }
            });
          }
        });

        return {
          date,
          transactions,
          totalSales,
          totalReceived,
          totalSpent,
          drawerError: closing?.difference || 0,
          count: transactions.length,
        };
      })
    );

    setDaySummaries(summaries);
    setLoading(false);
  };

  const goToPreviousMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentMonth(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentMonth(newDate);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const monthTotals = daySummaries.reduce(
    (acc, day) => ({
      totalSales: acc.totalSales + day.totalSales,
      totalReceived: acc.totalReceived + day.totalReceived,
      totalSpent: acc.totalSpent + day.totalSpent,
      count: acc.count + day.count,
      errors: acc.errors + (day.drawerError !== 0 ? 1 : 0),
    }),
    { totalSales: 0, totalReceived: 0, totalSpent: 0, count: 0, errors: 0 }
  );

  const handleDayClick = (date: Date) => {
    navigate('/', { state: { date: date.toISOString() } });
  };

  return (
    <AppLayout title="All Dates">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground hidden lg:block">All Dates</h1>
            <p className="text-muted-foreground hidden lg:block">View transactions by date</p>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            <button
              onClick={goToPreviousMonth}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary">
              <Calendar className="w-4 h-4" />
              <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
            </div>
            <button
              onClick={goToNextMonth}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Month Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="drawer-summary-card mb-6"
        >
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Month Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xl font-bold text-foreground">{formatCurrency(monthTotals.totalSales)}</p>
              <p className="text-xs text-muted-foreground">Total Sales</p>
            </div>
            <div>
              <p className="text-xl font-bold text-success">{formatCurrency(monthTotals.totalReceived)}</p>
              <p className="text-xs text-muted-foreground">Received</p>
            </div>
            <div>
              <p className="text-xl font-bold text-destructive">{formatCurrency(monthTotals.totalSpent)}</p>
              <p className="text-xs text-muted-foreground">Spent</p>
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{monthTotals.count}</p>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </div>
          </div>
        </motion.div>

        {/* Days List */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-secondary/50 animate-pulse" />
            ))
          ) : (
            daySummaries.map((day, index) => (
              <motion.button
                key={day.date.toISOString()}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => handleDayClick(day.date)}
                className={cn(
                  "w-full transaction-card p-4 text-left",
                  isToday(day.date) && "ring-2 ring-accent"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Date */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0",
                      isToday(day.date) ? "gradient-accent text-accent-foreground" : "bg-secondary text-foreground"
                    )}>
                      <span className="text-lg font-bold leading-none">{format(day.date, 'd')}</span>
                      <span className="text-[10px] uppercase">{format(day.date, 'EEE')}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {isToday(day.date) ? 'Today' : format(day.date, 'EEEE')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {day.count} transaction{day.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="text-right shrink-0">
                    <div className="flex flex-col gap-0.5">
                      {day.totalSales > 0 && (
                        <p className="text-sm font-medium text-foreground">
                          Sale: {formatCurrency(day.totalSales)}
                        </p>
                      )}
                      {day.totalReceived > 0 && (
                        <p className="text-xs text-success">
                          +{formatCurrency(day.totalReceived)}
                        </p>
                      )}
                      {day.totalSpent > 0 && (
                        <p className="text-xs text-destructive">
                          -{formatCurrency(day.totalSpent)}
                        </p>
                      )}
                      {day.drawerError !== 0 && (
                        <p className="text-xs text-warning flex items-center gap-1 justify-end">
                          <AlertTriangle className="w-3 h-3" />
                          {formatCurrency(Math.abs(day.drawerError))}
                        </p>
                      )}
                      {day.count === 0 && (
                        <p className="text-sm text-muted-foreground">No activity</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
