import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { getTransactionsByDate } from '@/lib/db';
import { Transaction, DailySummary } from '@/types';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DaySummary {
  date: Date;
  transactions: Transaction[];
  totalIn: number;
  totalOut: number;
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
        let totalIn = 0;
        let totalOut = 0;

        transactions.forEach((t) => {
          if (t.section === 'sale' && t.type !== 'sales_return') {
            totalIn += t.amount;
          } else if (t.section === 'sale' && t.type === 'sales_return') {
            totalOut += t.amount;
          } else if (t.section === 'expenses' || t.section === 'home') {
            totalOut += t.amount;
          } else if (t.section === 'purchase' && t.type !== 'purchase_return') {
            totalOut += t.amount;
          } else if (t.section === 'purchase' && t.type === 'purchase_return') {
            totalIn += t.amount;
          }
        });

        return {
          date,
          transactions,
          totalIn,
          totalOut,
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
      totalIn: acc.totalIn + day.totalIn,
      totalOut: acc.totalOut + day.totalOut,
      count: acc.count + day.count,
    }),
    { totalIn: 0, totalOut: 0, count: 0 }
  );

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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-success">{formatCurrency(monthTotals.totalIn)}</p>
              <p className="text-xs text-muted-foreground">Total In</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(monthTotals.totalOut)}</p>
              <p className="text-xs text-muted-foreground">Total Out</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{monthTotals.count}</p>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </div>
          </div>
        </motion.div>

        {/* Days List */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-secondary/50 animate-pulse" />
            ))
          ) : (
            daySummaries.map((day, index) => (
              <motion.button
                key={day.date.toISOString()}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => {
                  // Navigate to today page with date param
                  navigate('/', { state: { date: day.date } });
                }}
                className={cn(
                  "w-full transaction-card p-4 flex items-center justify-between text-left",
                  isToday(day.date) && "ring-2 ring-accent"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex flex-col items-center justify-center",
                    isToday(day.date) ? "gradient-accent text-accent-foreground" : "bg-secondary text-foreground"
                  )}>
                    <span className="text-lg font-bold leading-none">{format(day.date, 'd')}</span>
                    <span className="text-[10px] uppercase">{format(day.date, 'EEE')}</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {isToday(day.date) ? 'Today' : format(day.date, 'EEEE')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {day.count} transaction{day.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {day.totalIn > 0 && (
                    <p className="text-sm font-medium text-success">+{formatCurrency(day.totalIn)}</p>
                  )}
                  {day.totalOut > 0 && (
                    <p className="text-sm font-medium text-destructive">-{formatCurrency(day.totalOut)}</p>
                  )}
                  {day.count === 0 && (
                    <p className="text-sm text-muted-foreground">No activity</p>
                  )}
                </div>
              </motion.button>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
