import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ViewMode = 'bill' | 'item' | 'category';
type DateMode = 'month' | 'custom';

interface BillItemWithBatch {
  id: string;
  bill_id: string;
  item_id: string | null;
  item_name: string;
  batch_id: string | null;
  primary_quantity: number;
  secondary_quantity: number;
  rate: number;
  total_amount: number;
  purchase_rate: number;
  category_id: string | null;
  category_name: string;
}

interface BillWithProfit {
  bill_id: string;
  bill_number: string;
  customer_name: string;
  date: string;
  total_sale: number;
  total_cost: number;
  profit: number;
  items: BillItemWithBatch[];
}

export function ProfitReport() {
  const [viewMode, setViewMode] = useState<ViewMode>('bill');
  const [dateMode, setDateMode] = useState<DateMode>('month');
  const [month, setMonth] = useState(new Date());
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [billData, setBillData] = useState<BillWithProfit[]>([]);

  const getDateRange = () => {
    if (dateMode === 'custom') return { start: fromDate, end: toDate };
    return { start: format(startOfMonth(month), 'yyyy-MM-dd'), end: format(endOfMonth(month), 'yyyy-MM-dd') };
  };

  const fetchData = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    // Get sale transactions in date range
    const { data: saleTxns } = await supabase
      .from('transactions')
      .select('id, date, bill_number, customer_name')
      .eq('type', 'sale')
      .gte('date', start)
      .lte('date', end)
      .order('date');

    if (!saleTxns || saleTxns.length === 0) {
      setBillData([]);
      setLoading(false);
      return;
    }

    const txnIds = saleTxns.map(t => t.id);

    // Get bills linked to these transactions
    const { data: bills } = await supabase
      .from('bills')
      .select('id, transaction_id, bill_number, customer_name')
      .in('transaction_id', txnIds);

    if (!bills || bills.length === 0) {
      setBillData([]);
      setLoading(false);
      return;
    }

    const billIds = bills.map(b => b.id);

    // Get bill items with batch info
    const { data: billItems } = await supabase
      .from('bill_items')
      .select('*')
      .in('bill_id', billIds);

    // Get batch purchase rates
    const batchIds = (billItems || []).filter(bi => bi.batch_id).map(bi => bi.batch_id!);
    const { data: batches } = batchIds.length > 0
      ? await supabase.from('batches').select('id, purchase_rate, item_id').in('id', batchIds)
      : { data: [] };

    // Get items with categories
    const itemIds = [...new Set((billItems || []).filter(bi => bi.item_id).map(bi => bi.item_id!))];
    const { data: items } = itemIds.length > 0
      ? await supabase.from('items').select('id, category_id, name').in('id', itemIds)
      : { data: [] };

    // Get categories
    const catIds = [...new Set((items || []).filter(i => i.category_id).map(i => i.category_id!))];
    const { data: categories } = catIds.length > 0
      ? await supabase.from('categories').select('id, name').in('id', catIds)
      : { data: [] };

    // Build maps
    const batchMap = new Map((batches || []).map(b => [b.id, b]));
    const itemMap = new Map((items || []).map(i => [i.id, i]));
    const catMap = new Map((categories || []).map(c => [c.id, c.name]));
    const billTxnMap = new Map(bills.map(b => [b.id, saleTxns.find(t => t.id === b.transaction_id)]));

    // Build bill-wise profit data
    const result: BillWithProfit[] = bills.map(bill => {
      const txn = billTxnMap.get(bill.id);
      const items_list = (billItems || []).filter(bi => bi.bill_id === bill.id);

      const enrichedItems: BillItemWithBatch[] = items_list.map(bi => {
        const batch = bi.batch_id ? batchMap.get(bi.batch_id) : null;
        const item = bi.item_id ? itemMap.get(bi.item_id) : null;
        const categoryName = item?.category_id ? (catMap.get(item.category_id) || 'Uncategorized') : 'Uncategorized';

        return {
          id: bi.id,
          bill_id: bi.bill_id || '',
          item_id: bi.item_id,
          item_name: bi.item_name,
          batch_id: bi.batch_id,
          primary_quantity: Number(bi.primary_quantity),
          secondary_quantity: Number(bi.secondary_quantity),
          rate: Number(bi.rate),
          total_amount: Number(bi.total_amount),
          purchase_rate: batch ? Number(batch.purchase_rate) : 0,
          category_id: item?.category_id || null,
          category_name: categoryName,
        };
      });

      const total_sale = enrichedItems.reduce((s, i) => s + i.total_amount, 0);
      const total_cost = enrichedItems.reduce((s, i) => s + (i.purchase_rate * i.primary_quantity), 0);

      return {
        bill_id: bill.id,
        bill_number: bill.bill_number || txn?.bill_number || '-',
        customer_name: bill.customer_name || txn?.customer_name || '-',
        date: txn?.date || '',
        total_sale,
        total_cost,
        profit: total_sale - total_cost,
        items: enrichedItems,
      };
    }).filter(b => b.items.length > 0).sort((a, b) => a.date.localeCompare(b.date));

    setBillData(result);
    setLoading(false);
  };

  useEffect(() => {
    if (dateMode === 'month') fetchData();
  }, [month, dateMode]);

  const fetchCustomRange = () => {
    if (dateMode === 'custom') fetchData();
  };

  // All items flattened
  const allItems = useMemo(() => billData.flatMap(b => b.items), [billData]);

  // Item-wise aggregation
  const itemWise = useMemo(() => {
    const map = new Map<string, { name: string; category: string; qty: number; sale: number; cost: number }>();
    allItems.forEach(i => {
      const key = i.item_id || i.item_name;
      const existing = map.get(key);
      if (existing) {
        existing.qty += i.primary_quantity;
        existing.sale += i.total_amount;
        existing.cost += i.purchase_rate * i.primary_quantity;
      } else {
        map.set(key, {
          name: i.item_name,
          category: i.category_name,
          qty: i.primary_quantity,
          sale: i.total_amount,
          cost: i.purchase_rate * i.primary_quantity,
        });
      }
    });
    return [...map.values()].sort((a, b) => (b.sale - b.cost) - (a.sale - a.cost));
  }, [allItems]);

  // Category-wise aggregation
  const categoryWise = useMemo(() => {
    const map = new Map<string, { name: string; itemCount: number; qty: number; sale: number; cost: number }>();
    allItems.forEach(i => {
      const key = i.category_name;
      const existing = map.get(key);
      if (existing) {
        existing.qty += i.primary_quantity;
        existing.sale += i.total_amount;
        existing.cost += i.purchase_rate * i.primary_quantity;
      } else {
        map.set(key, {
          name: i.category_name,
          itemCount: 0,
          qty: i.primary_quantity,
          sale: i.total_amount,
          cost: i.purchase_rate * i.primary_quantity,
        });
      }
    });
    // Count unique items per category
    const itemsByCategory = new Map<string, Set<string>>();
    allItems.forEach(i => {
      const key = i.category_name;
      if (!itemsByCategory.has(key)) itemsByCategory.set(key, new Set());
      itemsByCategory.get(key)!.add(i.item_id || i.item_name);
    });
    return [...map.entries()].map(([key, val]) => ({
      ...val,
      itemCount: itemsByCategory.get(key)?.size || 0,
    })).sort((a, b) => (b.sale - b.cost) - (a.sale - a.cost));
  }, [allItems]);

  // Totals
  const totalSale = billData.reduce((s, b) => s + b.total_sale, 0);
  const totalCost = billData.reduce((s, b) => s + b.total_cost, 0);
  const totalProfit = totalSale - totalCost;
  const profitPct = totalSale > 0 ? ((totalProfit / totalSale) * 100).toFixed(1) : '0';

  const dateLabel = dateMode === 'custom'
    ? `${format(parseISO(fromDate), 'dd MMM yyyy')} - ${format(parseISO(toDate), 'dd MMM yyyy')}`
    : format(month, 'MMMM yyyy');

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(`Profit Report - ${viewMode === 'bill' ? 'Bill-wise' : viewMode === 'item' ? 'Item-wise' : 'Category-wise'}`, pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(dateLabel, pw / 2, 25, { align: 'center' });

    if (viewMode === 'bill') {
      autoTable(doc, {
        startY: 32,
        head: [['Date', 'Bill#', 'Customer', 'Sale', 'Cost', 'Profit', '%']],
        body: billData.map(b => [
          b.date ? format(parseISO(b.date), 'dd MMM') : '-',
          b.bill_number, b.customer_name,
          formatINR(b.total_sale), formatINR(b.total_cost), formatINR(b.profit),
          b.total_sale > 0 ? ((b.profit / b.total_sale) * 100).toFixed(1) + '%' : '-',
        ]),
        foot: [['', '', 'TOTAL', formatINR(totalSale), formatINR(totalCost), formatINR(totalProfit), profitPct + '%']],
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
      });
    } else if (viewMode === 'item') {
      autoTable(doc, {
        startY: 32,
        head: [['Item', 'Category', 'Qty', 'Sale', 'Cost', 'Profit', '%']],
        body: itemWise.map(i => [
          i.name, i.category, String(i.qty),
          formatINR(i.sale), formatINR(i.cost), formatINR(i.sale - i.cost),
          i.sale > 0 ? (((i.sale - i.cost) / i.sale) * 100).toFixed(1) + '%' : '-',
        ]),
        foot: [['', '', '', formatINR(totalSale), formatINR(totalCost), formatINR(totalProfit), profitPct + '%']],
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
      });
    } else {
      autoTable(doc, {
        startY: 32,
        head: [['Category', 'Items', 'Qty', 'Sale', 'Cost', 'Profit', '%']],
        body: categoryWise.map(c => [
          c.name, String(c.itemCount), String(c.qty),
          formatINR(c.sale), formatINR(c.cost), formatINR(c.sale - c.cost),
          c.sale > 0 ? (((c.sale - c.cost) / c.sale) * 100).toFixed(1) + '%' : '-',
        ]),
        foot: [['', '', '', formatINR(totalSale), formatINR(totalCost), formatINR(totalProfit), profitPct + '%']],
        theme: 'striped', headStyles: { fillColor: [66, 66, 66] }, styles: { fontSize: 7 },
      });
    }
    doc.save(`Profit_${viewMode}_${dateMode === 'custom' ? 'custom' : format(month, 'yyyy-MM')}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {(['bill', 'item', 'category'] as ViewMode[]).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)}
            className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
              viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}>
            {mode === 'bill' ? 'Bill-wise' : mode === 'item' ? 'Item-wise' : 'Category-wise'}
          </button>
        ))}
      </div>

      {/* Date controls */}
      <div className="space-y-2">
        <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
          <button onClick={() => setDateMode('month')}
            className={cn("flex-1 px-2 py-1 rounded-md text-[10px] font-medium",
              dateMode === 'month' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
            Monthly
          </button>
          <button onClick={() => setDateMode('custom')}
            className={cn("flex-1 px-2 py-1 rounded-md text-[10px] font-medium flex items-center justify-center gap-1",
              dateMode === 'custom' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
            <Calendar className="w-3 h-3" /> Custom Date
          </button>
        </div>

        {dateMode === 'month' ? (
          <div className="flex items-center justify-between">
            <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || billData.length === 0}>
                <Download className="w-3 h-3" /> PDF
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">From</label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">To</label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={fetchCustomRange}>Go</Button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportPDF} disabled={loading || billData.length === 0}>
                <Download className="w-3 h-3" /> PDF
              </Button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-32 bg-secondary/50 animate-pulse rounded-xl" />
      ) : billData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No sale bills with items for this period</p>
      ) : (
        <>
          {/* Summary Card */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-2 text-primary">Profit Summary</h3>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div><span className="text-muted-foreground">Total Sale</span><p className="font-bold">{formatINR(totalSale)}</p></div>
              <div><span className="text-muted-foreground">Total Cost</span><p className="font-bold text-destructive">{formatINR(totalCost)}</p></div>
              <div><span className="text-muted-foreground">Profit</span><p className={cn("font-bold", totalProfit >= 0 ? "text-success" : "text-destructive")}>{formatINR(totalProfit)}</p></div>
              <div><span className="text-muted-foreground">Margin</span><p className={cn("font-bold", totalProfit >= 0 ? "text-success" : "text-destructive")}>{profitPct}%</p></div>
            </div>
          </div>

          {/* BILL-WISE VIEW */}
          {viewMode === 'bill' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[50px_40px_1fr_55px_50px_50px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                <span>Date</span><span>Bill#</span><span>Customer</span>
                <span className="text-right">Sale</span><span className="text-right">Cost</span><span className="text-right">Profit</span>
              </div>
              {billData.map(b => {
                const pct = b.total_sale > 0 ? ((b.profit / b.total_sale) * 100).toFixed(0) : '0';
                return (
                  <div key={b.bill_id} className="grid grid-cols-[50px_40px_1fr_55px_50px_50px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px] items-center">
                    <span className="text-muted-foreground">{b.date ? format(parseISO(b.date), 'dd MMM') : '-'}</span>
                    <span className="text-muted-foreground truncate">{b.bill_number}</span>
                    <span className="truncate font-medium">{b.customer_name}</span>
                    <span className="text-right">{formatINR(b.total_sale)}</span>
                    <span className="text-right text-destructive text-[10px]">{formatINR(b.total_cost)}</span>
                    <span className={cn("text-right font-semibold", b.profit >= 0 ? "text-success" : "text-destructive")}>
                      {formatINR(b.profit)} <span className="text-[8px]">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ITEM-WISE VIEW */}
          {viewMode === 'item' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_55px_40px_50px_50px_50px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                <span>Item</span><span>Category</span><span className="text-right">Qty</span>
                <span className="text-right">Sale</span><span className="text-right">Cost</span><span className="text-right">Profit</span>
              </div>
              {itemWise.map((i, idx) => {
                const profit = i.sale - i.cost;
                const pct = i.sale > 0 ? ((profit / i.sale) * 100).toFixed(0) : '0';
                return (
                  <div key={idx} className="grid grid-cols-[1fr_55px_40px_50px_50px_50px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px] items-center">
                    <span className="truncate font-medium">{i.name}</span>
                    <span className="text-muted-foreground text-[10px] truncate">{i.category}</span>
                    <span className="text-right">{i.qty}</span>
                    <span className="text-right">{formatINR(i.sale)}</span>
                    <span className="text-right text-destructive text-[10px]">{formatINR(i.cost)}</span>
                    <span className={cn("text-right font-semibold", profit >= 0 ? "text-success" : "text-destructive")}>
                      {formatINR(profit)} <span className="text-[8px]">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* CATEGORY-WISE VIEW */}
          {viewMode === 'category' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_40px_40px_55px_50px_55px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                <span>Category</span><span className="text-right">Items</span><span className="text-right">Qty</span>
                <span className="text-right">Sale</span><span className="text-right">Cost</span><span className="text-right">Profit</span>
              </div>
              {categoryWise.map((c, idx) => {
                const profit = c.sale - c.cost;
                const pct = c.sale > 0 ? ((profit / c.sale) * 100).toFixed(0) : '0';
                return (
                  <div key={idx} className="grid grid-cols-[1fr_40px_40px_55px_50px_55px] gap-1 px-3 py-2 border-b border-border/50 last:border-0 text-[11px] items-center">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="text-right text-muted-foreground">{c.itemCount}</span>
                    <span className="text-right">{c.qty}</span>
                    <span className="text-right">{formatINR(c.sale)}</span>
                    <span className="text-right text-destructive text-[10px]">{formatINR(c.cost)}</span>
                    <span className={cn("text-right font-semibold", profit >= 0 ? "text-success" : "text-destructive")}>
                      {formatINR(profit)} <span className="text-[8px]">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
