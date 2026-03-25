import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bill number format: PREFIX/YYYY.MM.DD/001
 * Resets daily from 001.
 * 
 * Prefixes:
 * - SB: Sale Bill
 * - SR: Sales Return
 * - BP: Balance Payment
 * - CA: Customer Advance
 * - PA: Purchase Bill A
 * - PB: Purchase Bill B
 * - PC: Purchase Bill C
 * - RA: Purchase Return A
 * - RB: Purchase Return B
 * - PP: Purchase Payment
 * - PE: Purchase Expenses
 * - PD: Purchase Delivered
 * - EM: Employee (salary/attendance)
 * - EA: Employee Allowance
 * - RW: Rate Work
 * - EP: Employee Payment
 * - OD: Opening Due
 */

export type BillPrefix = 
  | 'SB' | 'SR' | 'BP' | 'CA'
  | 'PA' | 'PB' | 'PC' | 'RA' | 'RB' | 'PP' | 'PE' | 'PD'
  | 'EM' | 'EA' | 'RW' | 'EP'
  | 'OD';

export async function generateDailyBillNumber(prefix: BillPrefix, date: Date): Promise<string> {
  const dateStr = format(date, 'yyyy.MM.dd');
  const pattern = `${prefix}/${dateStr}/%`;
  
  const { data } = await supabase
    .from('transactions')
    .select('bill_number')
    .like('bill_number', pattern)
    .order('bill_number', { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (data?.[0]?.bill_number) {
    // Extract the suffix number after the last /
    const parts = data[0].bill_number.split('/');
    const lastPart = parts[parts.length - 1];
    const num = parseInt(lastPart, 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  return `${prefix}/${dateStr}/${nextNum.toString().padStart(3, '0')}`;
}

// Map from customer sub-type to prefix
export const customerTypePrefixMap: Record<string, BillPrefix> = {
  sale: 'SB',
  sales_return: 'SR',
  balance_paid: 'BP',
  customer_advance: 'CA',
  opening_due: 'OD',
};

// Map from purchase sub-type to prefix
export const purchaseTypePrefixMap: Record<string, BillPrefix> = {
  purchase_bill_a: 'PA',
  purchase_bill_b: 'PB',
  purchase_bill_c: 'PC',
  purchase_return_a: 'RA',
  purchase_return_b: 'RB',
  purchase_payment: 'PP',
  purchase_expenses: 'PE',
  purchase_delivered: 'PD',
};

// Map from employee type to prefix
export const employeeTypePrefixMap: Record<string, BillPrefix> = {
  salary: 'EM',
  attendance: 'EM',
  allowance: 'EA',
  rate_work: 'RW',
  payment: 'EP',
};
