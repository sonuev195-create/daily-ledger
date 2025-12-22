import { motion } from 'framer-motion';
import { Transaction } from '@/types';
import { TransactionCard } from './TransactionCard';

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (id: string) => void;
}

export function TransactionList({ transactions, onEdit, onDelete }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">No transactions yet</h3>
        <p className="text-sm text-muted-foreground">Add your first transaction to get started</p>
      </div>
    );
  }

  // Group transactions by section
  const groupedTransactions = transactions.reduce((acc, transaction) => {
    if (!acc[transaction.section]) {
      acc[transaction.section] = [];
    }
    acc[transaction.section].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const sectionOrder = ['sale', 'expenses', 'purchase', 'employee', 'home', 'exchange'];
  const sectionLabels: Record<string, string> = {
    sale: 'Sales',
    expenses: 'Expenses',
    purchase: 'Purchases',
    employee: 'Employee',
    home: 'Home',
    exchange: 'Exchange',
  };

  return (
    <div className="space-y-6">
      {sectionOrder.map((section) => {
        const sectionTransactions = groupedTransactions[section];
        if (!sectionTransactions || sectionTransactions.length === 0) return null;

        return (
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">
              {sectionLabels[section]}
            </h3>
            <div className="space-y-2">
              {sectionTransactions.map((transaction, index) => (
                <motion.div
                  key={transaction.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <TransactionCard
                    transaction={transaction}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
