import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval } from 'date-fns';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ItemOption {
  id: string;
  name: string;
  secondary_unit: string | null;
  conversion_rate: number | null;
}

interface StockMovement {
  date: string;
  type: 'in' | 'out';
  label: string;
  primaryQty: number;
  secondaryQty: number;
  rate: number;
  total: number;
  billNumber?: string;
}

export function ItemReport() {
  const [items, setItems] = useState<ItemOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [month, setMonth] = useState(new Date());
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [openingStock, setOpeningStock] = useState({ primary: 0, secondary: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('items').select('id, name, secondary_unit, conversion_rate').order('name')
      .then(({ data }) => setItems(data || []));
  }, []);

  useEffect(() => {
    if (!selectedItemId) { setMovements([]); return; }
    fetchMovements();
  }, [selectedItemId, month]);

  const fetchMovements = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');

    // Get all bill_items for this item within date range via bills -> transactions
    const { data: billItems } = await supabase.from('bill_items').select(`
      id, primary_quantity, secondary_quantity, rate, total_amount, item_name,
      bill:bills!bill_items_bill_id_fkey(id, bill_number, transaction_id, bill_type,
        transaction:transactions!bills_transaction_id_fkey(date, type, section)
      )
    `).eq('item_id', selectedItemId);

    // Get all bill_items before start for opening stock calculation
    const { data: batches } = await supabase.from('batches').select('*').eq('item_id', selectedItemId);

    // Calculate opening stock from batches (total stock = current batches, but we need stock as of start date)
    // Simpler: sum all batch quantities and subtract movements in/after the month
    const totalBatchPrimary = (batches || []).reduce((s, b) => s + Number(b.primary_quantity), 0);
    const totalBatchSecondary = (batches || []).reduce((s, b) => s + Number(b.secondary_quantity), 0);

    const movs: StockMovement[] = [];

    (billItems || []).forEach((bi: any) => {
      const bill = bi.bill;
      if (!bill?.transaction) return;
      const txn = bill.transaction;
      const txnDate = txn.date;
      if (txnDate < start || txnDate > end) return;

      const isReturn = txn.type === 'sales_return' || txn.type === 'purchase_return';
      const isPurchase = txn.section === 'purchase' && !isReturn;
      const isSale = txn.section === 'sale' && txn.type !== 'sales_return';
      const isSaleReturn = txn.type === 'sales_return';
      const isPurchaseReturn = txn.type === 'purchase_return';

      let type: 'in' | 'out' = 'out';
      let label = txn.type?.replace(/_/g, ' ') || '';

      if (isPurchase) { type = 'in'; label = 'Purchase'; }
      else if (isSaleReturn) { type = 'in'; label = 'Sale Return'; }
      else if (isSale) { type = 'out'; label = 'Sale'; }
      else if (isPurchaseReturn) { type = 'out'; label = 'Purchase Return'; }

      movs.push({
        date: txnDate,
        type,
        label,
        primaryQty: Number(bi.primary_quantity),
        secondaryQty: Number(bi.secondary_quantity),
        rate: Number(bi.rate),
        total: Number(bi.total_amount),
        billNumber: bill.bill_number || undefined,
      });
    });

    movs.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate opening stock: current batch total + out movements - in movements within month
    // (reverse engineer what stock was at start of month)
    const monthIn = movs.filter(m => m.type === 'in').reduce((s, m) => s + m.primaryQty, 0);
    const monthOut = movs.filter(m => m.type === 'out').reduce((s, m) => s + m.primaryQty, 0);
    const openPrimary = totalBatchPrimary + monthOut - monthIn;

    const monthInSec = movs.filter(m => m.type === 'in').reduce((s, m) => s + m.secondaryQty, 0);
    const monthOutSec = movs.filter(m => m.type === 'out').reduce((s, m) => s + m.secondaryQty, 0);
    const openSecondary = totalBatchSecondary + monthOutSec - monthInSec;

    setOpeningStock({ primary: openPrimary, secondary: openSecondary });
    setMovements(movs);
    setLoading(false);
  };

  const selectedItem = items.find(i => i.id === selectedItemId);
  const hasSecondary = selectedItem?.secondary_unit;

  // Running balance
  let runPrimary = openingStock.primary;
  let runSecondary = openingStock.secondary;

  const totalIn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.primaryQty, 0);
  const totalOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.primaryQty, 0);
  const closingPrimary = openingStock.primary + totalIn - totalOut;

  return (
    <div className="space-y-4">
      <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl">
        <option value="">Select Item</option>
        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>

      {selectedItemId && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
            <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Opening</p>
              <p className="text-lg font-bold">{openingStock.primary}</p>
              {hasSecondary && <p className="text-[10px] text-muted-foreground">{openingStock.secondary} {selectedItem?.secondary_unit}</p>}
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-xs text-muted-foreground">In / Out</p>
              <p className="text-sm font-bold">
                <span className="text-success">+{totalIn}</span> / <span className="text-destructive">-{totalOut}</span>
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Closing</p>
              <p className="text-lg font-bold text-primary">{closingPrimary}</p>
            </div>
          </div>

          {loading ? (
            <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
          ) : movements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No movements this month</p>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className={cn(
                "gap-1 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border grid",
                hasSecondary ? "grid-cols-[50px_70px_40px_40px_45px_50px_50px]" : "grid-cols-[50px_70px_50px_50px_50px_50px]"
              )}>
                <span>Date</span>
                <span>Type</span>
                {hasSecondary && <span className="text-right">Sec</span>}
                <span className="text-right">Qty</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Total</span>
                <span className="text-right">Stock</span>
              </div>

              {/* Opening row */}
              <div className={cn(
                "gap-1 px-3 py-1.5 border-b border-border/50 text-[11px] bg-secondary/20 grid",
                hasSecondary ? "grid-cols-[50px_70px_40px_40px_45px_50px_50px]" : "grid-cols-[50px_70px_50px_50px_50px_50px]"
              )}>
                <span className="text-muted-foreground">-</span>
                <span className="font-medium">Opening</span>
                {hasSecondary && <span className="text-right">{openingStock.secondary}</span>}
                <span className="text-right font-semibold">{openingStock.primary}</span>
                <span className="text-right">-</span>
                <span className="text-right">-</span>
                <span className="text-right font-semibold">{openingStock.primary}</span>
              </div>

              {movements.map((m, i) => {
                if (m.type === 'in') {
                  runPrimary += m.primaryQty;
                  runSecondary += m.secondaryQty;
                } else {
                  runPrimary -= m.primaryQty;
                  runSecondary -= m.secondaryQty;
                }
                return (
                  <div key={i} className={cn(
                    "gap-1 px-3 py-1.5 border-b border-border/50 last:border-0 text-[11px] grid",
                    hasSecondary ? "grid-cols-[50px_70px_40px_40px_45px_50px_50px]" : "grid-cols-[50px_70px_50px_50px_50px_50px]"
                  )}>
                    <span className="text-muted-foreground">{format(parseISO(m.date), 'dd MMM')}</span>
                    <span className={cn("font-medium truncate", m.type === 'in' ? "text-success" : "text-destructive")}>
                      {m.label}
                    </span>
                    {hasSecondary && (
                      <span className="text-right">{m.type === 'in' ? '+' : '-'}{m.secondaryQty}</span>
                    )}
                    <span className={cn("text-right font-semibold", m.type === 'in' ? "text-success" : "text-destructive")}>
                      {m.type === 'in' ? '+' : '-'}{m.primaryQty}
                    </span>
                    <span className="text-right text-muted-foreground">{formatINR(m.rate)}</span>
                    <span className="text-right">{formatINR(m.total)}</span>
                    <span className="text-right font-semibold">{runPrimary}</span>
                  </div>
                );
              })}

              {/* Closing row */}
              <div className={cn(
                "gap-1 px-3 py-2 bg-secondary/30 text-[11px] font-bold grid",
                hasSecondary ? "grid-cols-[50px_70px_40px_40px_45px_50px_50px]" : "grid-cols-[50px_70px_50px_50px_50px_50px]"
              )}>
                <span>-</span>
                <span>Closing</span>
                {hasSecondary && <span className="text-right">{runSecondary}</span>}
                <span className="text-right">{closingPrimary}</span>
                <span></span>
                <span></span>
                <span className="text-right text-primary">{closingPrimary}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
