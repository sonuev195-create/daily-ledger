import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { differenceInDays, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns whether the current user can edit/delete a transaction for the given date.
 * Admin: always allowed.
 * Employee: only within 4 days of the transaction date.
 */
export function useCanEdit() {
  const { isAdmin } = useAuth();
  const [lockDays, setLockDays] = useState(7);

  useEffect(() => {
    supabase
      .from('bill_format_config')
      .select('total_columns')
      .eq('config_name', 'edit_lock_days')
      .maybeSingle()
      .then(({ data }) => {
        const days = Number(data?.total_columns || 7);
        if (days > 0) setLockDays(days);
      });
  }, []);

  const canEdit = (transactionDate: Date | string): boolean => {
    if (isAdmin) return true;
    const txDate = startOfDay(typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate);
    const today = startOfDay(new Date());
    return differenceInDays(today, txDate) <= lockDays;
  };

  return { canEdit, isAdmin, lockDays };
}
