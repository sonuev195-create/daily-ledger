import { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Wallet, CreditCard, AlertTriangle, Plus } from 'lucide-react';
import { Transaction, TransactionSection } from '@/types';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { CategoryId } from './CategoryAccordion';

interface SubCategory {
  value: string;
  label: string;
}

const SUBCATEGORIES: Record<Exclude<CategoryId, 'drawer' | 'customer' | 'purchase' | 'employee'>, SubCategory[]> = {
  expense: [],
  exchange: [],
  home: [
    { value: 'home_credit', label: 'Credit' },
    { value: 'home_debit', label: 'Debit' },
  ],
};

const SECTION_MAP: Record<Exclude<CategoryId, 'drawer' | 'customer' | 'purchase' | 'employee'>, TransactionSection> = {
  expense: 'expenses',
  exchange: 'exchange',
  home: 'home',
};

interface CategoryTransactionListProps {
  categoryId: Exclude<CategoryId, 'drawer' | 'customer' | 'purchase' | 'employee'>;
  transactions: Transaction[];
  onAddTransaction: (section: TransactionSection, type: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  expenseCategories?: { id: string; name: string }[];
}

export function CategoryTransactionList({
  categoryId,
  transactions,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  expenseCategories = [],
}: CategoryTransactionListProps) {
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const section = SECTION_MAP[categoryId];

  const sectionTransactions = transactions.filter(t => t.section === section);
  const filteredTransactions = selectedSub
    ? sectionTransactions.filter(t => t.type === selectedSub)
    : sectionTransactions;

  let subCategories = SUBCATEGORIES[categoryId] || [];
  if (categoryId === 'expense' && expenseCategories.length > 0) {
    subCategories = expenseCategories.map(c => ({ value: c.id, label: c.name }));
  }

  const handleAdd = () => {
    const type = selectedSub || (subCategories.length > 0 ? subCategories[0].value : section);
    onAddTransaction(section, type);
  };

  return (
    <div className="space-y-3">
      {subCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setSelectedSub(null)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              selectedSub === null ? "bg-accent text-accent-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary")}>
            All
          </button>
          {subCategories.map(sub => (
            <button key={sub.value} onClick={() => setSelectedSub(selectedSub === sub.value ? null : sub.value)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                selectedSub === sub.value ? "bg-accent text-accent-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary")}>
              {sub.label}
            </button>
          ))}
        </div>
      )}

      <button onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors">
        <Plus className="w-4 h-4" />
        Add {selectedSub ? subCategories.find(s => s.value === selectedSub)?.label : categoryId}
      </button>

      {filteredTransactions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No transactions</p>
      ) : (
        <div className="space-y-1">
          {filteredTransactions.map((t, i) => {
            const cashAmt = t.payments.filter(p => p.mode === 'cash').reduce((s, p) => s + p.amount, 0);
            const upiAmt = t.payments.filter(p => p.mode === 'upi').reduce((s, p) => s + p.amount, 0);

            return (
              <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }} onClick={() => onEditTransaction(t)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 cursor-pointer transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {t.customerName || t.supplierName || t.type.replace(/_/g, ' ')}
                    </span>
                    {t.billNumber && <span className="text-xs text-muted-foreground">#{t.billNumber}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{t.type.replace(/_/g, ' ')}</span>
                    <span>•</span>
                    <span>{format(new Date(t.createdAt), 'HH:mm')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {cashAmt > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-success">
                      <Wallet className="w-3 h-3" />{formatINR(cashAmt)}
                    </span>
                  )}
                  {upiAmt > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-info">
                      <CreditCard className="w-3 h-3" />{formatINR(upiAmt)}
                    </span>
                  )}
                  {t.due && t.due > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-warning">
                      <AlertTriangle className="w-3 h-3" />Due
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
