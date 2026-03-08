import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, Wallet, CreditCard, ShoppingCart, Users, Home, ArrowLeftRight, Banknote, TrendingUp, TrendingDown, FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { DailySummary, Transaction } from '@/types';

export type CategoryId = 'drawer' | 'customer' | 'purchase' | 'employee' | 'expense' | 'exchange' | 'home' | 'fullday';

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
  { id: 'fullday', label: 'Full Day Bill', icon: FileSpreadsheet, colorClass: 'text-accent', bgClass: 'bg-accent/10' },
];

interface SectionFlowData {
  cashIn: number;
  cashOut: number;
  upiIn: number;
  upiOut: number;
  adjustIn: number;
  adjustOut: number;
  chequeIn: number;
  chequeOut: number;
  count: number;
}

function getSectionFlow(categoryId: CategoryId, transactions: Transaction[]): SectionFlowData {
  let cashIn = 0, cashOut = 0, upiIn = 0, upiOut = 0, adjustIn = 0, adjustOut = 0, chequeIn = 0, chequeOut = 0, count = 0;

  const sectionMap: Record<CategoryId, string[]> = {
    drawer: [],
    customer: ['sale'],
    purchase: ['purchase'],
    employee: ['employee'],
    expense: ['expenses'],
    exchange: ['exchange'],
    home: ['home'],
    fullday: [],
  };

  const addIn = (payments: any[]) => {
    payments.forEach(p => {
      if (p.mode === 'cash') cashIn += p.amount;
      if (p.mode === 'upi') upiIn += p.amount;
      if (p.mode === 'cheque') chequeIn += p.amount;
      if (p.mode === 'adjust') adjustIn += p.amount;
    });
  };

  const addOut = (payments: any[]) => {
    payments.forEach(p => {
      if (p.mode === 'cash') cashOut += p.amount;
      if (p.mode === 'upi') upiOut += p.amount;
      if (p.mode === 'cheque') chequeOut += p.amount;
      if (p.mode === 'adjust') adjustOut += p.amount;
    });
  };

  const sections = sectionMap[categoryId];
  transactions.forEach(t => {
    if (!sections.includes(t.section)) return;
    count++;

    if (t.section === 'sale') {
      if (t.type === 'sales_return') {
        addOut(t.payments);
      } else {
        addIn(t.payments);
        if (t.giveBack) addOut(t.giveBack);
      }
    } else if (t.section === 'home') {
      if (t.type === 'home_credit') {
        addIn(t.payments);
      } else {
        addOut(t.payments);
      }
    } else if (t.section === 'exchange') {
      addIn(t.payments);
      if (t.giveBack) addOut(t.giveBack);
    } else {
      // purchase payment/expenses, employee, expenses → all out
      addOut(t.payments);
    }
  });

  return { cashIn, cashOut, upiIn, upiOut, adjustIn, adjustOut, chequeIn, chequeOut, count };
}

interface FlowBadgeProps {
  icon: any;
  inAmount: number;
  outAmount: number;
  inColor: string;
  outColor: string;
}

function FlowBadge({ icon: Icon, inAmount, outAmount, inColor, outColor }: FlowBadgeProps) {
  if (inAmount === 0 && outAmount === 0) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] lg:text-xs">
      <Icon className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-muted-foreground" />
      {inAmount > 0 && <span className={cn("font-medium", inColor)}>+{formatINR(inAmount)}</span>}
      {outAmount > 0 && <span className={cn("font-medium", outColor)}>-{formatINR(outAmount)}</span>}
    </div>
  );
}

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
        const flow = cat.id === 'drawer' ? null : getSectionFlow(cat.id, transactions);
        const Icon = cat.icon;

        return (
          <div key={cat.id} className="rounded-xl border border-border overflow-hidden bg-card">
            <button
              onClick={() => onToggle(cat.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-4 transition-colors",
                isExpanded ? "bg-secondary/70" : "hover:bg-secondary/30"
              )}
            >
              <div className={cn("w-9 h-9 lg:w-11 lg:h-11 rounded-lg flex items-center justify-center shrink-0", cat.bgClass)}>
                <Icon className={cn("w-5 h-5 lg:w-6 lg:h-6", cat.colorClass)} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="text-sm lg:text-base font-semibold text-foreground">{cat.label}</span>
                {/* Per-section flow summary */}
                {flow && flow.count > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    <FlowBadge icon={Wallet} inAmount={flow.cashIn} outAmount={flow.cashOut} inColor="text-success" outColor="text-destructive" />
                    <FlowBadge icon={CreditCard} inAmount={flow.upiIn} outAmount={flow.upiOut} inColor="text-info" outColor="text-destructive" />
                    {(flow.chequeIn > 0 || flow.chequeOut > 0) && (
                      <FlowBadge icon={Wallet} inAmount={flow.chequeIn} outAmount={flow.chequeOut} inColor="text-warning" outColor="text-destructive" />
                    )}
                    {(flow.adjustIn > 0 || flow.adjustOut > 0) && (
                      <FlowBadge icon={ArrowLeftRight} inAmount={flow.adjustIn} outAmount={flow.adjustOut} inColor="text-primary" outColor="text-destructive" />
                    )}
                  </div>
                )}
                {cat.id === 'drawer' && (
                  <div className="flex gap-2 mt-0.5 text-[10px] lg:text-xs">
                    <span className="text-success font-medium">💵 {formatINR(drawerCash)}</span>
                    <span className="text-info font-medium">📱 {formatINR(drawerUpi)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {flow && flow.count > 0 && (
                  <span className="text-xs lg:text-sm text-muted-foreground bg-secondary rounded-full px-1.5 py-0.5 lg:px-2 lg:py-1">{flow.count}</span>
                )}
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground" />
                </motion.div>
              </div>
            </button>

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
