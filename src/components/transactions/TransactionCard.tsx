import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Receipt, ShoppingCart, Home, ArrowLeftRight, Users, Banknote, Edit2, Trash2 } from 'lucide-react';
import { Transaction } from '@/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface TransactionCardProps {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (id: string) => void;
  onViewBill?: () => void;
  compact?: boolean;
}

const sectionIcons = {
  sale: Receipt,
  expenses: Banknote,
  purchase: ShoppingCart,
  employee: Users,
  home: Home,
  exchange: ArrowLeftRight,
};

const sectionColors = {
  sale: 'bg-success/10 text-success',
  expenses: 'bg-warning/10 text-warning',
  purchase: 'bg-info/10 text-info',
  employee: 'bg-primary/10 text-primary',
  home: 'bg-muted text-muted-foreground',
  exchange: 'bg-accent/10 text-accent',
};

const typeLabels: Record<string, string> = {
  sale: 'Sale',
  sales_return: 'Sales Return',
  customer_advance: 'Customer Advance',
  balance_paid: 'Balance Paid',
  other_expenses: 'Other Expenses',
  vehicle_expenses: 'Vehicle Expenses',
  workshop_expenses: 'Workshop Expenses',
  purchase_bill: 'Purchase Bill',
  purchase_delivered: 'Purchase Delivered',
  purchase_return: 'Purchase Return',
  purchase_payment: 'Purchase Payment',
  purchase_expenses: 'Purchase Expenses',
  home_credit: 'Home Credit',
  home_debit: 'Home Debit',
};

export function TransactionCard({ transaction, onEdit, onDelete, onViewBill, compact }: TransactionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = sectionIcons[transaction.section];
  const colorClass = sectionColors[transaction.section];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const isPositive = transaction.section === 'sale' && transaction.type !== 'sales_return';
  const isNegative = transaction.section === 'expenses' || 
    transaction.section === 'purchase' || 
    transaction.type === 'sales_return';

  return (
    <motion.div 
      layout
      className="transaction-card overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", colorClass)}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground truncate">
              {typeLabels[transaction.type] || transaction.type}
            </span>
            {transaction.billNumber && (
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                #{transaction.billNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{format(new Date(transaction.createdAt), 'h:mm a')}</span>
            {transaction.customerName && (
              <>
                <span>•</span>
                <span className="truncate">{transaction.customerName}</span>
              </>
            )}
            {transaction.supplierName && (
              <>
                <span>•</span>
                <span className="truncate">{transaction.supplierName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn(
            "font-semibold text-lg",
            isPositive && "text-success",
            isNegative && "text-destructive",
            !isPositive && !isNegative && "text-foreground"
          )}>
            {isNegative ? '-' : isPositive ? '+' : ''}{formatCurrency(transaction.amount)}
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

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
            <div className="px-4 pb-4 pt-0 border-t border-border">
              <div className="pt-4 space-y-4">
                {/* Payment Breakdown */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Payment Details
                  </h4>
                  <div className="space-y-2">
                    {transaction.payments.map((payment) => (
                      <div key={payment.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground capitalize">{payment.mode}</span>
                        <span className="font-medium">{formatCurrency(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Due/Overpayment */}
                {(transaction.due !== undefined && transaction.due > 0) && (
                  <div className="bg-destructive/10 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-destructive">Due Amount</span>
                      <span className="font-semibold text-destructive">{formatCurrency(transaction.due)}</span>
                    </div>
                  </div>
                )}

                {(transaction.overpayment !== undefined && transaction.overpayment > 0) && (
                  <div className="bg-success/10 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-success">Overpayment (Advance)</span>
                      <span className="font-semibold text-success">{formatCurrency(transaction.overpayment)}</span>
                    </div>
                  </div>
                )}

                {/* Reference */}
                {transaction.reference && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Reference
                    </h4>
                    <p className="text-sm text-foreground">{transaction.reference}</p>
                  </div>
                )}

                {/* Bill Type */}
                {transaction.billType && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Bill Type:</span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      transaction.billType === 'g_bill' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'
                    )}>
                      {transaction.billType === 'g_bill' ? 'G Bill' : 'N Bill'}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(transaction)}
                      className="flex-1 btn-ghost text-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
                      className="flex-1 btn-ghost text-sm text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
