import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bill number format: PREFIX/YYYY.MM.DD/001
 * Resets daily from 001.
 * 
 * Computer bill number format: YY-YY/TYPE/NUM
 * e.g., 26-27/C/1 for B2C, 26-27/B/1 for B2B, 26-27/E/1 for Estimate
 */

export type BillPrefix = 
  | 'SB' | 'SR' | 'BP' | 'CA'
  | 'PA' | 'PB' | 'PC' | 'RA' | 'RB' | 'PP' | 'PE' | 'PD'
  | 'EM' | 'EA' | 'RW' | 'EP'
  | 'OD';

export type SaleClassification = 'b2c' | 'b2b' | 'estimate';

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
    const parts = data[0].bill_number.split('/');
    const lastPart = parts[parts.length - 1];
    const num = parseInt(lastPart, 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  return `${prefix}/${dateStr}/${nextNum.toString().padStart(3, '0')}`;
}

/**
 * Generate computer bill number in format YY-YY/TYPE/NUM
 * Financial year: April to March
 * e.g., 26-27/C/1 for B2C, 26-27/B/1 for B2B, 26-27/E/1 for Estimate
 */
export async function generateComputerBillNumber(classification: SaleClassification, date: Date): Promise<string> {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  // Financial year: April (month 3) to March (month 2)
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const fyPrefix = `${(fyStart % 100).toString().padStart(2, '0')}-${(fyEnd % 100).toString().padStart(2, '0')}`;
  
  const typeCode = classification === 'b2c' ? 'C' : classification === 'b2b' ? 'B' : 'E';
  const pattern = `${fyPrefix}/${typeCode}/%`;
  
  const { data } = await supabase
    .from('transactions')
    .select('computer_bill_number')
    .like('computer_bill_number', pattern)
    .order('computer_bill_number', { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (data?.[0]?.computer_bill_number) {
    const parts = data[0].computer_bill_number.split('/');
    const lastPart = parts[parts.length - 1];
    const num = parseInt(lastPart, 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  return `${fyPrefix}/${typeCode}/${nextNum}`;
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
