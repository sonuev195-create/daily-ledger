import { useState, useEffect, useCallback } from 'react';
import { Transaction, DailySummary } from '@/types';
import { getTransactionsByDate, addTransaction, updateTransaction, deleteTransaction } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export function useTransactions(date: Date) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTransactionsByDate(date);
      setTransactions(data);
    } catch (err) {
      setError('Failed to load transactions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const add = useCallback(async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await addTransaction(newTransaction);
    await loadTransactions();
    return newTransaction;
  }, [loadTransactions]);

  const update = useCallback(async (transaction: Transaction) => {
    await updateTransaction(transaction);
    await loadTransactions();
  }, [loadTransactions]);

  const remove = useCallback(async (id: string) => {
    await deleteTransaction(id);
    await loadTransactions();
  }, [loadTransactions]);

  const getSummary = useCallback((): DailySummary => {
    let totalSales = 0;
    let totalExpenses = 0;
    let totalPurchases = 0;
    let cashIn = 0;
    let cashOut = 0;
    let upiIn = 0;
    let upiOut = 0;

    transactions.forEach(t => {
      if (t.section === 'sale') {
        if (t.type === 'sale' || t.type === 'customer_advance' || t.type === 'balance_paid') {
          totalSales += t.amount;
          t.payments.forEach(p => {
            if (p.mode === 'cash') cashIn += p.amount;
            if (p.mode === 'upi') upiIn += p.amount;
          });
          // Deduct giveBack from cash/UPI (overpayment returned to customer)
          if (t.giveBack) {
            t.giveBack.forEach(g => {
              if (g.mode === 'cash') cashOut += g.amount;
              if (g.mode === 'upi') upiOut += g.amount;
            });
          }
        } else if (t.type === 'sales_return') {
          totalSales -= t.amount;
          t.payments.forEach(p => {
            if (p.mode === 'cash') cashOut += p.amount;
            if (p.mode === 'upi') upiOut += p.amount;
          });
        }
      } else if (t.section === 'expenses') {
        totalExpenses += t.amount;
        t.payments.forEach(p => {
          if (p.mode === 'cash') cashOut += p.amount;
          if (p.mode === 'upi') upiOut += p.amount;
        });
      } else if (t.section === 'home') {
        // Home: cash only. From Owner = cash in, To Owner = cash out
        if (t.type === 'home_credit') {
          t.payments.forEach(p => {
            if (p.mode === 'cash') cashIn += p.amount;
          });
        } else {
          t.payments.forEach(p => {
            if (p.mode === 'cash') cashOut += p.amount;
          });
        }
      } else if (t.section === 'purchase') {
        // Bills (purchase_bill): amount only, no cash/UPI effect
        // Payment & expenses: affects cash/UPI
        if (t.type === 'purchase_payment' || t.type === 'purchase_expenses') {
          totalPurchases += t.amount;
          t.payments.forEach(p => {
            if (p.mode === 'cash') cashOut += p.amount;
            if (p.mode === 'upi') upiOut += p.amount;
          });
        } else if (t.type === 'purchase_return') {
          // Returns: amount only, no cash effect
          totalPurchases -= t.amount;
        } else {
          // purchase_bill, purchase_delivered: amount only
          totalPurchases += t.amount;
        }
      } else if (t.section === 'exchange') {
        // Exchange: payments = what customer gives (income), giveBack = what you give
        t.payments.forEach(p => {
          if (p.mode === 'cash') cashIn += p.amount;
          if (p.mode === 'upi') upiIn += p.amount;
        });
        if (t.giveBack) {
          t.giveBack.forEach(g => {
            if (g.mode === 'cash') cashOut += g.amount;
            if (g.mode === 'upi') upiOut += g.amount;
          });
        }
      } else if (t.section === 'employee') {
        totalExpenses += t.amount;
        t.payments.forEach(p => {
          if (p.mode === 'cash') cashOut += p.amount;
          if (p.mode === 'upi') upiOut += p.amount;
        });
      }
    });

    return {
      date,
      totalSales,
      totalExpenses,
      totalPurchases,
      cashIn,
      cashOut,
      upiIn,
      upiOut,
      transactionCount: transactions.length,
    };
  }, [transactions, date]);

  return {
    transactions,
    loading,
    error,
    add,
    update,
    remove,
    refresh: loadTransactions,
    getSummary,
  };
}
