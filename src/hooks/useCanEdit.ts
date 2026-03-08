import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, startOfDay } from 'date-fns';

/**
 * Returns whether the current user can edit/delete a transaction for the given date.
 * Admin: always allowed.
 * Employee: only within 4 days of the transaction date.
 */
export function useCanEdit() {
  const { isAdmin } = useAuth();

  const canEdit = (transactionDate: Date | string): boolean => {
    if (isAdmin) return true;
    const txDate = startOfDay(typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate);
    const today = startOfDay(new Date());
    return differenceInDays(today, txDate) <= 4;
  };

  return { canEdit, isAdmin };
}
