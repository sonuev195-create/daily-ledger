import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Wallet, CreditCard, Building2, TrendingUp, TrendingDown, Edit2, Calculator } from 'lucide-react';
import { DailySummary, DrawerOpening, DrawerClosing } from '@/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DrawerSummaryProps {
  date: Date;
  summary: DailySummary;
  opening: DrawerOpening | null;
  closing?: DrawerClosing | null;
  onEditOpening?: () => void;
  onEditClosing?: () => void;
}

export function DrawerSummary({ date, summary, opening, closing, onEditOpening, onEditClosing }: DrawerSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const openingCash = opening ? opening.coin + opening.cash + opening.homeAdvance : 0;
  const currentCash = openingCash + summary.cashIn - summary.cashOut;
  const currentUpi = (opening?.upiOpening || 0) + summary.upiIn - summary.upiOut;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="drawer-summary-card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Drawer Summary</h2>
          <p className="text-sm text-muted-foreground">{format(date, 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </motion.div>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-secondary/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg gradient-success flex items-center justify-center">
              <Wallet className="w-4 h-4 text-success-foreground" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(currentCash)}</p>
          <p className="text-xs text-muted-foreground">Cash</p>
        </div>

        <div className="bg-secondary/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-info flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-info-foreground" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(currentUpi)}</p>
          <p className="text-xs text-muted-foreground">UPI</p>
        </div>

        <div className="bg-secondary/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(opening?.bankOpening || 0)}</p>
          <p className="text-xs text-muted-foreground">Bank</p>
        </div>
      </div>

      {/* Flow Summary */}
      <div className="flex items-center justify-between py-3 border-t border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm text-muted-foreground">In:</span>
            <span className="text-sm font-medium text-success">{formatCurrency(summary.totalSales)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-sm text-muted-foreground">Out:</span>
            <span className="text-sm font-medium text-destructive">{formatCurrency(summary.totalExpenses + summary.totalPurchases)}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{summary.transactionCount} transactions</span>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-border space-y-4">
              {/* Opening Drawer */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground">Opening Drawer</h3>
                  {onEditOpening && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditOpening();
                      }}
                      className="text-xs text-accent flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Coin</p>
                    <p className="font-medium">{formatCurrency(opening?.coin || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cash</p>
                    <p className="font-medium">{formatCurrency(opening?.cash || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Home Adv.</p>
                    <p className="font-medium">{formatCurrency(opening?.homeAdvance || 0)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Opening Cash</span>
                    <span className="font-semibold">{formatCurrency(openingCash)}</span>
                  </div>
                </div>
              </div>

              {/* Closing Section */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground">Closing Drawer</h3>
                  {onEditClosing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditClosing();
                      }}
                      className="text-xs text-accent flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Calculator className="w-3 h-3" /> {closing ? 'Edit' : 'Close Drawer'}
                    </button>
                  )}
                </div>
                {closing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Coin</p>
                        <p className="font-medium">{formatCurrency(closing.manualCoin)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cash</p>
                        <p className="font-medium">{formatCurrency(closing.manualCash)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">To Home</p>
                        <p className="font-medium">{formatCurrency(closing.cashToHome)}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "mt-2 p-2 rounded-lg text-xs",
                      closing.difference === 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    )}>
                      Difference: {formatCurrency(closing.difference)}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not closed yet</p>
                )}
              </div>

              {/* Day Flow */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-success/10 rounded-xl p-4">
                  <h4 className="text-xs text-muted-foreground mb-2">Cash In</h4>
                  <p className="text-lg font-bold text-success">{formatCurrency(summary.cashIn)}</p>
                </div>
                <div className="bg-destructive/10 rounded-xl p-4">
                  <h4 className="text-xs text-muted-foreground mb-2">Cash Out</h4>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(summary.cashOut)}</p>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm py-2">
                  <span className="text-muted-foreground">Total Sales</span>
                  <span className={cn("font-medium", summary.totalSales >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(summary.totalSales)}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-2">
                  <span className="text-muted-foreground">Total Expenses</span>
                  <span className="font-medium text-destructive">{formatCurrency(summary.totalExpenses)}</span>
                </div>
                <div className="flex justify-between text-sm py-2">
                  <span className="text-muted-foreground">Total Purchases</span>
                  <span className="font-medium text-destructive">{formatCurrency(summary.totalPurchases)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
