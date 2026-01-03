import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSunday } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, Receipt, Wallet, CreditCard, ShoppingCart } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { getTransactionsByDate, getDrawerClosing } from '@/lib/db';
import { Transaction, DrawerClosing } from '@/types';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DaySummary {
  date: Date;
  transactions: Transaction[];
  totalSales: number;
  cashReceived: number;
  upiReceived: number;
  cashExpenses: number;
  upiExpenses: number;
  purchasePayment: number;
  purchaseCount: number;
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
        let cashReceived = 0;
        let upiReceived = 0;
        let cashExpenses = 0;
        let upiExpenses = 0;
        let purchasePayment = 0;
        let purchaseCount = 0;

        transactions.forEach((t) => {
          // Calculate total sales
          if (t.section === 'sale' && t.type === 'sale') {
            totalSales += t.amount;
          }
          
          // Calculate received by mode
          if (['sale', 'customer_advance', 'balance_paid'].includes(t.type) || 
              (t.section === 'purchase' && t.type === 'purchase_return')) {
            t.payments.forEach(p => {
              if (p.mode === 'cash') cashReceived += p.amount;
              if (p.mode === 'upi') upiReceived += p.amount;
            });
          }
          
          // Calculate expenses by mode
          if (t.section === 'expenses') {
            t.payments.forEach(p => {
              if (p.mode === 'cash') cashExpenses += p.amount;
              if (p.mode === 'upi') upiExpenses += p.amount;
            });
          }
          
          // Calculate purchase payments
          if (t.section === 'purchase' && t.type !== 'purchase_return') {
            t.payments.forEach(p => {
              if (['cash', 'upi', 'bank'].includes(p.mode)) {
                purchasePayment += p.amount;
              }
            });
            if (t.type === 'purchase_bill') {
              purchaseCount++;
            }
          }
        });

        return {
          date,
          transactions,
          totalSales,
          cashReceived,
          upiReceived,
          cashExpenses,
          upiExpenses,
          purchasePayment,
          purchaseCount,
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
    if (amount === 0) return '-';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCurrencyCompact = (amount: number) => {
    if (amount === 0) return '-';
    if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}k`;
    }
    return `₹${amount}`;
  };

  const monthTotals = daySummaries.reduce(
    (acc, day) => ({
      totalSales: acc.totalSales + day.totalSales,
      cashReceived: acc.cashReceived + day.cashReceived,
      upiReceived: acc.upiReceived + day.upiReceived,
      cashExpenses: acc.cashExpenses + day.cashExpenses,
      upiExpenses: acc.upiExpenses + day.upiExpenses,
      purchasePayment: acc.purchasePayment + day.purchasePayment,
      purchaseCount: acc.purchaseCount + day.purchaseCount,
      count: acc.count + day.count,
      errors: acc.errors + (day.drawerError !== 0 ? 1 : 0),
    }),
    { totalSales: 0, cashReceived: 0, upiReceived: 0, cashExpenses: 0, upiExpenses: 0, purchasePayment: 0, purchaseCount: 0, count: 0, errors: 0 }
  );

  const handleDayClick = (date: Date) => {
    navigate('/', { state: { date: date.toISOString() } });
  };

  return (
    <AppLayout title="All Dates">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
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
              <p className="text-xl font-bold text-success">{formatCurrency(monthTotals.cashReceived + monthTotals.upiReceived)}</p>
              <p className="text-xs text-muted-foreground">Received</p>
            </div>
            <div>
              <p className="text-xl font-bold text-destructive">{formatCurrency(monthTotals.cashExpenses + monthTotals.upiExpenses + monthTotals.purchasePayment)}</p>
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
              <div key={i} className="h-24 rounded-xl bg-secondary/50 animate-pulse" />
            ))
          ) : (
            daySummaries.map((day, index) => {
              const isSundayDate = isSunday(day.date);
              
              return (
                <motion.button
                  key={day.date.toISOString()}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleDayClick(day.date)}
                  className={cn(
                    "w-full transaction-card p-3 text-left",
                    isToday(day.date) && "ring-2 ring-accent"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Date Box */}
                    <div className={cn(
                      "w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0",
                      isSundayDate 
                        ? "bg-destructive/10 text-destructive" 
                        : isToday(day.date) 
                          ? "gradient-accent text-accent-foreground" 
                          : "bg-secondary text-foreground"
                    )}>
                      <span className="text-xl font-bold leading-none">{format(day.date, 'd')}</span>
                      <span className={cn(
                        "text-[10px] uppercase mt-0.5",
                        isSundayDate ? "text-destructive" : ""
                      )}>
                        {format(day.date, 'EEE')}
                      </span>
                    </div>

                    {/* Day Report */}
                    <div className="flex-1 min-w-0">
                      {day.count > 0 ? (
                        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-xs">
                          {/* Row 1 */}
                          <div className="flex items-center gap-1">
                            <Receipt className="w-3 h-3 text-primary shrink-0" />
                            <span className="text-foreground font-medium truncate">{formatCurrencyCompact(day.totalSales)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Wallet className="w-3 h-3 text-success shrink-0" />
                            <span className="text-success truncate">{formatCurrencyCompact(day.cashReceived)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-info shrink-0" />
                            <span className="text-info truncate">{formatCurrencyCompact(day.upiReceived)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground">{day.count} txn</span>
                          </div>
                          
                          {/* Row 2 */}
                          <div className="flex items-center gap-1 text-destructive">
                            <span className="truncate">C.Exp: {formatCurrencyCompact(day.cashExpenses)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-destructive">
                            <span className="truncate">U.Exp: {formatCurrencyCompact(day.upiExpenses)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3 text-warning shrink-0" />
                            <span className="text-warning truncate">{formatCurrencyCompact(day.purchasePayment)}</span>
                          </div>
                          <div className="text-right">
                            {day.purchaseCount > 0 && (
                              <span className="text-muted-foreground">{day.purchaseCount} pur</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-2">
                          No transactions
                        </div>
                      )}
                      
                      {/* Drawer Error */}
                      {day.drawerError !== 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-warning">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Drawer: {formatCurrencyCompact(Math.abs(day.drawerError))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </AppLayout>
  );
}
