import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, Wallet, CreditCard, ShoppingCart, Users, Home, ArrowLeftRight, Banknote,
  TrendingUp, TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DailySummary, Transaction } from '@/types';

export type CategoryId = 'drawer' | 'customer' | 'purchase' | 'employee' | 'expense' | 'exchange' | 'home';

interface CategoryConfig {
  id: CategoryId;
  label: string;
  icon: any;
  colorClass: string;
  bgClass: string;
}

export const CATEGORIES: CategoryConfig[] = [
  { id: 'drawer', label: 'Drawer', icon: Wallet, colorClass: 'text-accent', bgClass: 'bg-accent/10' },
  { id: 'customer', label: 'Customer', icon: CreditCard, colorClass: 'text-success', bgClass: 'bg-success/10' },
  { id: 'purchase', label: 'Purchase', icon: ShoppingCart, colorClass: 'text-warning', bgClass: 'bg-warning/10' },
  { id: 'employee', label: 'Employee', icon: Users, colorClass: 'text-info', bgClass: 'bg-info/10' },
  { id: 'expense', label: 'Expense', icon: Banknote, colorClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  { id: 'exchange', label: 'Exchange', icon: ArrowLeftRight, colorClass: 'text-primary', bgClass: 'bg-primary/10' },
  { id: 'home', label: 'Home', icon: Home, colorClass: 'text-muted-foreground', bgClass: 'bg-secondary' },
];

interface CategorySummaryData {
  totalCash: number;
  totalUpi: number;
  count: number;
}

function getCategorySummary(categoryId: CategoryId, transactions: Transaction[], summary: DailySummary): CategorySummaryData {
  let totalCash = 0, totalUpi = 0, count = 0;

  const sectionMap: Record<CategoryId, string[]> = {
    drawer: [],
    customer: ['sale'],
    purchase: ['purchase'],
    employee: ['employee'],
    expense: ['expenses'],
    exchange: ['exchange'],
    home: ['home'],
  };

  const sections = sectionMap[categoryId];
  transactions.forEach(t => {
    if (sections.includes(t.section)) {
      count++;
      t.payments.forEach(p => {
        if (p.mode === 'cash') totalCash += p.amount;
        if (p.mode === 'upi') totalUpi += p.amount;
      });
    }
  });

  return { totalCash, totalUpi, count };
}

const formatCompact = (amount: number) => {
  if (amount === 0) return '₹0';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return `₹${amount}`;
};

interface CategoryAccordionProps {
  transactions: Transaction[];
  summary: DailySummary;
  expandedCategory: CategoryId | null;
  onToggle: (id: CategoryId) => void;
  renderContent: (categoryId: CategoryId) => React.ReactNode;
  drawerCash?: number;
  drawerUpi?: number;
}

export function CategoryAccordion({ 
  transactions, summary, expandedCategory, onToggle, renderContent, drawerCash = 0, drawerUpi = 0 
}: CategoryAccordionProps) {
  return (
    <div className="space-y-2">
      {CATEGORIES.map((cat) => {
        const isExpanded = expandedCategory === cat.id;
        const catSummary = cat.id === 'drawer' 
          ? { totalCash: drawerCash, totalUpi: drawerUpi, count: 0 }
          : getCategorySummary(cat.id, transactions, summary);
        const Icon = cat.icon;

        return (
          <div key={cat.id} className="rounded-xl border border-border overflow-hidden bg-card">
            {/* Banner Strip */}
            <button
              onClick={() => onToggle(cat.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 transition-colors",
                isExpanded ? "bg-secondary/70" : "hover:bg-secondary/30"
              )}
            >
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", cat.bgClass)}>
                <Icon className={cn("w-5 h-5", cat.colorClass)} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-sm font-semibold text-foreground">{cat.label}</span>
              </div>
              {/* Summary chips */}
              <div className="flex items-center gap-2 text-xs shrink-0">
                {cat.id !== 'drawer' && catSummary.count > 0 && (
                  <span className="text-muted-foreground">{catSummary.count}</span>
                )}
                {catSummary.totalCash !== 0 && (
                  <span className="flex items-center gap-0.5 text-success font-medium">
                    <Wallet className="w-3 h-3" />
                    {formatCompact(catSummary.totalCash)}
                  </span>
                )}
                {catSummary.totalUpi !== 0 && (
                  <span className="flex items-center gap-0.5 text-info font-medium">
                    <CreditCard className="w-3 h-3" />
                    {formatCompact(catSummary.totalUpi)}
                  </span>
                )}
              </div>
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </motion.div>
            </button>

            {/* Expanded Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 border-t border-border">
                    {renderContent(cat.id)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
