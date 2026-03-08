import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, ClipboardPaste, Lock, Unlock, Save, AlertTriangle, X, Package, FileSpreadsheet, Camera, Upload, Loader2, Settings, ChevronRight, Check, Pencil, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getOrCreateCustomer, updateCustomerBalance, saveBillToSupabase, deductFromBatch, getBatchesForItem, useItems, restoreInventoryForBillItems } from '@/hooks/useSupabaseData';

interface FullDayBillRow {
  id: string;
  customerName: string;
  itemName: string;
  quantity: number;
  amount: number;
  matchedItemId: string | null;
  matchedItemName: string | null;
  secondaryQty: number;
  rate: number;
}

interface CustomerBillGroup {
  customerName: string;
  items: FullDayBillRow[];
  total: number;
}

interface ExistingSaleBill {
  transactionId: string;
  billNumber: string;
  customerName: string;
  amount: number;
  hasItems: boolean;
  itemCount: number;
  billId: string | null;
}

interface BillItemRow {
  id?: string;
  extractedName: string;
  matchedName: string | null;
  selectedItemId: string | null;
  quantity: number;
  secondaryQty: number;
  rate: number;
  amount: number;
  confirmed: boolean;
  isNew?: boolean;
}

interface FullDayBillContentProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteTransaction: (id: string) => void;
}

type FullDayMode = 'inventory' | 'bills' | 'bill_items';

// Fuzzy match item name against master list
function fuzzyMatchItem(name: string, items: { id: string; name: string; paperBillName?: string | null }[]): { id: string; name: string; score: number } | null {
  if (!name.trim()) return null;
  const norm = name.toLowerCase().trim();
  let best: { id: string; name: string; score: number } | null = null;

  for (const item of items) {
    const masterNorm = item.name.toLowerCase().trim();
    const paperNorm = item.paperBillName?.toLowerCase().trim() || '';
    if (norm === masterNorm || norm === paperNorm) return { id: item.id, name: item.name, score: 1 };
    if (masterNorm.includes(norm) || norm.includes(masterNorm)) {
      const score = 0.9;
      if (!best || score > best.score) best = { id: item.id, name: item.name, score };
      continue;
    }
    if (paperNorm && (paperNorm.includes(norm) || norm.includes(paperNorm))) {
      const score = 0.9;
      if (!best || score > best.score) best = { id: item.id, name: item.name, score };
      continue;
    }
    const maxLen = Math.max(norm.length, masterNorm.length);
    if (maxLen > 0) {
      const dist = levenshtein(norm, masterNorm);
      const sim = 1 - dist / maxLen;
      if (sim > (best?.score || 0.4)) best = { id: item.id, name: item.name, score: sim };
    }
    if (paperNorm) {
      const maxLen2 = Math.max(norm.length, paperNorm.length);
      const dist2 = levenshtein(norm, paperNorm);
      const sim2 = 1 - dist2 / maxLen2;
      if (sim2 > (best?.score || 0.4)) best = { id: item.id, name: item.name, score: sim2 };
    }
  }
  return best && best.score >= 0.45 ? best : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function FullDayBillContent({ transactions, selectedDate, onSave, onDeleteTransaction }: FullDayBillContentProps) {
  const { items: allItems } = useItems();
  const [rows, setRows] = useState<FullDayBillRow[]>([]);
  const [lockMode, setLockMode] = useState<'partial' | 'full'>('partial');
  const [entryMode, setEntryMode] = useState<FullDayMode>('bills');
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  // Bill Wise Items mode state
  const [existingSales, setExistingSales] = useState<ExistingSaleBill[]>([]);
  const [currentBillIdx, setCurrentBillIdx] = useState(0);
  const [billItems, setBillItems] = useState<BillItemRow[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [savedBillIds, setSavedBillIds] = useState<Set<string>>(new Set());
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const billFileRef = useRef<HTMLInputElement>(null);
  const billCameraRef = useRef<HTMLInputElement>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  const saleTransactions = transactions.filter(t => t.section === 'sale' && (t.type === 'sale' || t.type === 'sales_return'));

  // Load ALL existing sales for bill_items mode
  useEffect(() => {
    if (entryMode !== 'bill_items') return;
    (async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data: saleTxns } = await supabase.from('transactions')
        .select('id, bill_number, customer_name, amount')
        .eq('date', dateStr).eq('section', 'sale').in('type', ['sale', 'sales_return'])
        .order('created_at', { ascending: true });

      if (!saleTxns) return;
      const sales: ExistingSaleBill[] = [];
      for (const txn of saleTxns) {
        const { data: bills } = await supabase.from('bills').select('id').eq('transaction_id', txn.id);
        const billId = bills?.[0]?.id || null;
        const { data: items } = billId
          ? await supabase.from('bill_items').select('id').eq('bill_id', billId)
          : { data: null };
        sales.push({
          transactionId: txn.id,
          billNumber: txn.bill_number || '-',
          customerName: txn.customer_name || '-',
          amount: Number(txn.amount),
          hasItems: (items?.length || 0) > 0,
          itemCount: items?.length || 0,
          billId,
        });
      }
      setExistingSales(sales);
      setCurrentBillIdx(0);
      setBillItems([]);
      setSavedBillIds(new Set());
      setEditingBillId(null);
    })();
  }, [entryMode, selectedDate, transactions]);

  const getItemSecondaryUnit = (itemId: string | null) => {
    if (!itemId) return null;
    return allItems.find(i => i.id === itemId)?.secondaryUnit || null;
  };

  const getItemConversion = (itemId: string | null) => {
    if (!itemId) return null;
    const item = allItems.find(i => i.id === itemId);
    if (!item || !item.conversionRate || !item.secondaryUnit) return null;
    return { rate: item.conversionRate, type: item.conversionType };
  };

  // Auto-match item names when rows change
  useEffect(() => {
    if (rows.length === 0 || allItems.length === 0) return;
    const updated = rows.map(row => {
      if (row.matchedItemId) return row;
      if (!row.itemName.trim()) return row;
      const match = fuzzyMatchItem(row.itemName, allItems);
      if (match) {
        const conv = getItemConversion(match.id);
        let secQty = row.secondaryQty;
        if (conv && conv.type === 'permanent' && conv.rate > 0 && row.quantity > 0 && secQty === 0) {
          secQty = row.quantity * conv.rate;
        }
        return { ...row, matchedItemId: match.id, matchedItemName: match.name, secondaryQty: secQty };
      }
      return row;
    });
    const changed = updated.some((r, i) => r.matchedItemId !== rows[i].matchedItemId);
    if (changed) setRows(updated);
  }, [rows, allItems]);

  const groupByCustomer = useCallback((rowList: FullDayBillRow[]): CustomerBillGroup[] => {
    const groups: CustomerBillGroup[] = [];
    let current: CustomerBillGroup | null = null;
    for (const row of rowList) {
      if (!row.customerName.trim() && !row.itemName.trim()) continue;
      const name = row.customerName.trim() || (current?.customerName || 'Unknown');
      if (!current || current.customerName.toLowerCase() !== name.toLowerCase()) {
        current = { customerName: name, items: [], total: 0 };
        groups.push(current);
      }
      current.items.push({ ...row, customerName: name });
      current.total += row.amount;
    }
    return groups;
  }, []);

  const groups = groupByCustomer(rows);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newRows: FullDayBillRow[] = [];

    for (const line of lines) {
      const cols = line.split(/\t|,/).map(c => c.trim());
      if (entryMode === 'inventory') {
        if (cols.length >= 2) {
          const item = cols[0] || '';
          const qty = parseFloat(cols[1]) || 0;
          const amt = cols.length >= 3 ? (parseFloat(cols[2]) || 0) : 0;
          newRows.push({ id: uuidv4(), customerName: '', itemName: item, quantity: qty, amount: amt, matchedItemId: null, matchedItemName: null, secondaryQty: 0, rate: qty > 0 && amt > 0 ? amt / qty : 0 });
        }
      } else {
        if (cols.length >= 3) {
          const name = cols[0] || '';
          const item = cols[1] || '';
          const qty = parseFloat(cols[2]) || 0;
          const amt = cols.length >= 4 ? (parseFloat(cols[3]) || 0) : 0;
          newRows.push({ id: uuidv4(), customerName: name, itemName: item, quantity: qty, amount: amt, matchedItemId: null, matchedItemName: null, secondaryQty: 0, rate: qty > 0 && amt > 0 ? amt / qty : 0 });
        }
      }
    }
    if (newRows.length === 0) { toast.error('No valid rows found'); return; }
    setRows(prev => [...prev, ...newRows]);
    setPasteText('');
    setShowPaste(false);
    toast.success(`Added ${newRows.length} rows`);
  };

  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows(prev => [...prev, {
      id: uuidv4(),
      customerName: entryMode === 'bills' ? (lastRow?.customerName || '') : '',
      itemName: '', quantity: 0, amount: 0, matchedItemId: null, matchedItemName: null, secondaryQty: 0, rate: 0,
    }]);
  };

  const updateRow = (id: string, field: keyof FullDayBillRow, value: string | number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'itemName') { updated.matchedItemId = null; updated.matchedItemName = null; }
      if (field === 'quantity' || field === 'amount') {
        const qty = field === 'quantity' ? (value as number) : updated.quantity;
        const amt = field === 'amount' ? (value as number) : updated.amount;
        if (qty > 0 && amt > 0) updated.rate = amt / qty;
      }
      if (field === 'rate') {
        const rate = value as number;
        if (rate > 0 && updated.quantity > 0) updated.amount = updated.quantity * rate;
      }
      return updated;
    }));
  };

  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const deductInventoryForItems = async (items: { itemId: string; primaryQty: number; secondaryQty: number }[]) => {
    for (const item of items) {
      if (!item.itemId) continue;
      const batches = await getBatchesForItem(item.itemId);
      const withStock = batches.filter(b => b.primaryQuantity > 0)
        .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
      let remaining = item.primaryQty;
      let remainingSec = item.secondaryQty;
      for (const batch of withStock) {
        if (remaining <= 0) break;
        const deductPri = Math.min(remaining, batch.primaryQuantity);
        const deductSec = batch.secondaryQuantity > 0 ? Math.min(remainingSec, batch.secondaryQuantity) : 0;
        await deductFromBatch(batch.id, deductPri, deductSec);
        remaining -= deductPri;
        remainingSec -= deductSec;
      }
    }
  };

  const handleSaveAll = async () => {
    if (entryMode === 'inventory') {
      if (rows.length === 0) { toast.error('No items to save'); return; }
      setSaving(true);
      try {
        const billNumber = `FDI${format(selectedDate, 'yyyyMMdd')}`;
        const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
        const { data: billData } = await supabase.from('bills').insert({
          bill_number: billNumber, bill_type: 'fullday_inventory', total_amount: totalAmt,
        }).select('id').single();

        if (billData) {
          const billItems = rows.filter(r => r.itemName.trim()).map(item => ({
            bill_id: billData.id,
            item_id: item.matchedItemId || null,
            item_name: item.matchedItemName || item.itemName,
            primary_quantity: item.quantity,
            secondary_quantity: item.secondaryQty,
            rate: item.rate,
            total_amount: item.amount,
          }));
          await supabase.from('bill_items').insert(billItems);
          const toDeduct = rows.filter(r => r.matchedItemId).map(r => ({
            itemId: r.matchedItemId!, primaryQty: r.quantity, secondaryQty: r.secondaryQty,
          }));
          if (toDeduct.length > 0) await deductInventoryForItems(toDeduct);
        }
        toast.success(`Saved ${rows.length} inventory items`);
        setRows([]);
      } catch (err) { console.error(err); toast.error('Error saving inventory'); }
      finally { setSaving(false); }
      return;
    }

    // Bills mode - auto group by customer name and create transactions with items
    if (groups.length === 0) { toast.error('No items to save'); return; }
    setSaving(true);
    try {
      for (const group of groups) {
        const customerId = await getOrCreateCustomer(group.customerName);
        if (!customerId) continue;

        const { data: lastBill } = await supabase.from('transactions')
          .select('bill_number').like('bill_number', 'FD%').order('created_at', { ascending: false }).limit(1);
        let nextNum = 1;
        if (lastBill?.[0]?.bill_number) {
          const n = parseInt(lastBill[0].bill_number.replace(/^FD[A-Z]?/, ''), 10);
          if (!isNaN(n)) nextNum = n + 1;
        }
        const billNumber = `FD${nextNum.toString().padStart(4, '0')}`;

        const saleTransaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
          date: selectedDate, section: 'sale' as TransactionSection, type: 'sale',
          amount: group.total,
          payments: [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: group.total }],
          billNumber, customerId, customerName: group.customerName, due: 0,
        };
        await onSave(saleTransaction);

        const { data: savedTxn } = await supabase.from('transactions')
          .select('id').eq('bill_number', billNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();

        if (savedTxn) {
          const billItemsData = group.items.map(item => ({
            itemId: item.matchedItemId || undefined,
            itemName: item.matchedItemName || item.itemName,
            primaryQty: item.quantity, secondaryQty: item.secondaryQty,
            rate: item.rate, total: item.amount,
          }));
          await saveBillToSupabase(savedTxn.id, billNumber, 'sale', group.total, group.customerName, undefined, billItemsData);

          const toDeduct = group.items.filter(i => i.matchedItemId).map(i => ({
            itemId: i.matchedItemId!, primaryQty: i.quantity, secondaryQty: i.secondaryQty,
          }));
          if (toDeduct.length > 0) await deductInventoryForItems(toDeduct);
        }
      }
      toast.success(`Saved ${groups.length} bills`);
      setRows([]);
    } catch (err) { console.error(err); toast.error('Error saving bills'); }
    finally { setSaving(false); }
  };

  // === Bill Wise Items: Load items for a specific bill ===
  const loadBillItems = async (sale: ExistingSaleBill) => {
    if (!sale.billId) {
      setBillItems([]);
      setEditingBillId(null);
      return;
    }
    const { data } = await supabase.from('bill_items').select('*').eq('bill_id', sale.billId);
    if (data && data.length > 0) {
      const items: BillItemRow[] = data.map(d => ({
        id: d.id,
        extractedName: d.item_name,
        matchedName: d.item_name,
        selectedItemId: d.item_id,
        quantity: Number(d.primary_quantity),
        secondaryQty: Number(d.secondary_quantity),
        rate: Number(d.rate),
        amount: Number(d.total_amount),
        confirmed: !!d.item_id,
        isNew: false,
      }));
      setBillItems(items);
      setEditingBillId(sale.billId);
    } else {
      setBillItems([]);
      setEditingBillId(null);
    }
  };

  const currentSale = existingSales[currentBillIdx];
  const salesWithoutItems = existingSales.filter(s => !s.hasItems && !savedBillIds.has(s.transactionId));

  const handleOcrCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentSale) return;
    e.target.value = '';
    setIsExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const itemNames = allItems.map(i => i.name);
      const paperBillNames = allItems.reduce((acc: Record<string, string>, i) => {
        if (i.paperBillName) acc[i.name] = i.paperBillName;
        return acc;
      }, {});
      const { data: configData } = await supabase.from('bill_format_config').select('*').eq('config_name', 'default').maybeSingle();
      const columnMapping = configData ? {
        totalColumns: configData.total_columns, itemNameColumn: configData.item_name_column,
        quantityColumn: configData.quantity_column, quantityType: configData.quantity_type,
        rateColumn: configData.has_rate ? configData.rate_column : null,
        amountColumn: configData.amount_column, hasRate: configData.has_rate, hasAmount: configData.has_amount,
      } : undefined;

      const { data, error } = await supabase.functions.invoke('extract-bill-items', {
        body: { imageBase64: base64, itemNames, paperBillNames, columnMapping },
      });
      if (error) throw error;
      const items = data?.items || [];
      if (items.length === 0) { toast.error('No items found'); return; }

      const enriched: BillItemRow[] = items.map((ext: any) => {
        const masterItem = allItems.find(i => i.name.toLowerCase() === (ext.matchedName || ext.extractedName)?.toLowerCase());
        const conv = masterItem?.conversionRate && masterItem?.conversionType === 'permanent' ? masterItem.conversionRate : 0;
        return {
          extractedName: ext.extractedName || '',
          matchedName: masterItem?.name || ext.matchedName || null,
          selectedItemId: masterItem?.id || null,
          quantity: ext.quantity || 0,
          secondaryQty: conv > 0 ? (ext.quantity || 0) * conv : 0,
          rate: ext.rate || (ext.quantity > 0 && ext.amount > 0 ? ext.amount / ext.quantity : 0),
          amount: ext.amount || 0,
          confirmed: !!masterItem,
          isNew: true,
        };
      });
      setBillItems(prev => [...prev, ...enriched]);
      toast.success(`Extracted ${enriched.length} items`);
    } catch (err: any) {
      toast.error('Extraction failed: ' + (err.message || 'Unknown'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveBillItems = async () => {
    if (!currentSale || billItems.length === 0) return;
    setSaving(true);
    try {
      // If editing existing bill, restore inventory first then delete old items
      if (editingBillId) {
        await restoreInventoryForBillItems(currentSale.transactionId);
      }

      const billItemsData = billItems.filter(i => i.selectedItemId || i.extractedName.trim()).map(i => ({
        itemId: i.selectedItemId || undefined,
        itemName: i.matchedName || i.extractedName,
        primaryQty: i.quantity, secondaryQty: i.secondaryQty,
        rate: i.rate, total: i.amount,
      }));
      const totalAmt = billItems.reduce((s, i) => s + i.amount, 0);
      await saveBillToSupabase(currentSale.transactionId, currentSale.billNumber, 'sale', totalAmt, currentSale.customerName, undefined, billItemsData);

      // Deduct inventory for ALL items (since we restored everything above)
      const itemsToDeduct = billItems.filter(i => i.selectedItemId);
      if (itemsToDeduct.length > 0) {
        await deductInventoryForItems(itemsToDeduct.map(i => ({
          itemId: i.selectedItemId!, primaryQty: i.quantity, secondaryQty: i.secondaryQty,
        })));
      }

      setSavedBillIds(prev => new Set([...prev, currentSale.transactionId]));
      // Update local state
      setExistingSales(prev => prev.map((s, i) => i === currentBillIdx ? { ...s, hasItems: true, itemCount: billItemsData.length } : s));
      toast.success(`Items saved for ${currentSale.billNumber}`);
      setBillItems([]);
      setEditingBillId(null);

      // Auto-advance to next bill without items
      const nextIdx = existingSales.findIndex((s, i) => i > currentBillIdx && !s.hasItems && !savedBillIds.has(s.transactionId));
      if (nextIdx >= 0) setCurrentBillIdx(nextIdx);
    } catch (err) { console.error(err); toast.error('Error saving items'); }
    finally { setSaving(false); }
  };

  const updateBillItem = (idx: number, field: string, value: any) => {
    setBillItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'selectedItemId') {
        const masterItem = allItems.find(i => i.id === value);
        updated[idx].matchedName = masterItem?.name || null;
        updated[idx].confirmed = !!value;
        if (masterItem?.conversionRate && masterItem.conversionType === 'permanent') {
          updated[idx].secondaryQty = updated[idx].quantity * masterItem.conversionRate;
        }
      }
      if (field === 'quantity') {
        const qty = value as number;
        if (updated[idx].rate > 0) updated[idx].amount = qty * updated[idx].rate;
        const item = allItems.find(i => i.id === updated[idx].selectedItemId);
        if (item?.conversionRate && item.conversionType === 'permanent') {
          updated[idx].secondaryQty = qty * item.conversionRate;
        }
      }
      if (field === 'rate') {
        if (updated[idx].quantity > 0) updated[idx].amount = updated[idx].quantity * (value as number);
      }
      if (field === 'amount') {
        if (updated[idx].quantity > 0) updated[idx].rate = (value as number) / updated[idx].quantity;
      }
      return updated;
    });
  };

  // === RENDER ===
  return (
    <div className="space-y-3">
      {/* Mode Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex bg-secondary rounded-lg p-0.5 flex-1">
          {([
            { key: 'inventory' as FullDayMode, icon: Package, label: 'Inventory' },
            { key: 'bills' as FullDayMode, icon: FileSpreadsheet, label: 'Full Bills' },
            { key: 'bill_items' as FullDayMode, icon: Eye, label: 'Bill Wise Items' },
          ]).map(tab => (
            <button key={tab.key}
              onClick={() => { setEntryMode(tab.key); setRows([]); setBillItems([]); setEditingBillId(null); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium transition-colors",
                entryMode === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <tab.icon className="w-3 h-3" /> {tab.label}
            </button>
          ))}
        </div>
        {entryMode !== 'bill_items' && (
          <button onClick={() => setLockMode(lockMode === 'partial' ? 'full' : 'partial')}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors shrink-0",
              lockMode === 'full' ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
            )}
            title={lockMode === 'full' ? 'Full: Today sale items locked for inventory' : 'Partial: Both entries coexist'}
          >
            {lockMode === 'full' ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {lockMode === 'full' ? 'Locked' : 'Partial'}
          </button>
        )}
      </div>

      {/* Lock warning */}
      {lockMode === 'full' && saleTransactions.length > 0 && entryMode !== 'bill_items' && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-xs text-warning font-medium">
            <AlertTriangle className="w-3 h-3" /> {saleTransactions.length} sale(s) may duplicate inventory
          </div>
          <p className="text-[10px] text-muted-foreground">Lock only affects inventory tracking.</p>
        </div>
      )}

      {/* ============ INVENTORY & BILLS MODES ============ */}
      {(entryMode === 'inventory' || entryMode === 'bills') && (
        <>
          {showPaste ? (
            <div className="space-y-2 border border-accent/30 rounded-lg p-2 bg-accent/5">
              <label className="text-[10px] text-muted-foreground">
                {entryMode === 'inventory' ? 'Paste: Item, Qty, Amount' : 'Paste: Customer, Item, Qty, Amount'}
              </label>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder="Paste tab/comma separated data..."
                className="w-full h-24 text-xs p-2 bg-background border border-border rounded-md resize-none font-mono" />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs gap-1 flex-1" onClick={handlePaste}>
                  <ClipboardPaste className="w-3 h-3" /> Parse
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setShowPaste(false); setPasteText(''); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => setShowPaste(true)}>
                <ClipboardPaste className="w-3 h-3" /> Paste from Excel
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addRow}>
                <Plus className="w-3 h-3" /> Add Row
              </Button>
            </div>
          )}

          {/* Rows Table */}
          {rows.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              {entryMode === 'inventory' ? (
                <>
                  <div className="grid grid-cols-[1fr_50px_50px_60px_24px] gap-1 px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                    <span>Item</span><span>Qty</span><span>2nd</span><span>Amt</span><span></span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
                    {rows.map((row) => {
                      const secUnit = getItemSecondaryUnit(row.matchedItemId);
                      return (
                        <div key={row.id} className="space-y-0.5 px-2 py-1">
                          <div className="grid grid-cols-[1fr_50px_50px_60px_24px] gap-1 items-center">
                            <input value={row.itemName} onChange={e => updateRow(row.id, 'itemName', e.target.value)}
                              placeholder="Item" className="h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate" />
                            <input type="number" value={row.quantity || ''} onChange={e => updateRow(row.id, 'quantity', parseFloat(e.target.value) || 0)}
                              placeholder="Qty" className="h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                            <input type="number" value={row.secondaryQty || ''} onChange={e => updateRow(row.id, 'secondaryQty', parseFloat(e.target.value) || 0)}
                              placeholder={secUnit || '2nd'} className="h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                            <input type="number" value={row.amount || ''} onChange={e => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="₹" className="h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded" />
                            <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                          </div>
                          {row.itemName.trim() && (
                            <div className="flex items-center gap-1 pl-1">
                              {row.matchedItemId ? (
                                <span className="text-[9px] text-success flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> {row.matchedItemName}
                                  {secUnit && <span className="text-muted-foreground">({secUnit})</span>}
                                </span>
                              ) : (
                                <select value="" onChange={e => {
                                  const item = allItems.find(i => i.id === e.target.value);
                                  if (item) setRows(prev => prev.map(r => r.id === row.id ? { ...r, matchedItemId: item.id, matchedItemName: item.name } : r));
                                }} className="text-[9px] text-destructive bg-transparent border-none h-4">
                                  <option value="">⚠ No match - Select</option>
                                  {allItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-2 py-1.5 border-t border-border bg-secondary/20 text-xs font-medium flex justify-between">
                    <span>{rows.length} items | {rows.filter(r => r.matchedItemId).length} matched</span>
                    <span>Total: {formatINR(grandTotal)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_1fr_50px_60px_24px] gap-1 px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                    <span>Customer</span><span>Item</span><span>Qty</span><span>Amount</span><span></span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
                    {rows.map((row, idx) => {
                      const prevRow = idx > 0 ? rows[idx - 1] : null;
                      const isNewCustomer = !prevRow || prevRow.customerName.toLowerCase() !== row.customerName.toLowerCase();
                      return (
                        <div key={row.id} className="space-y-0.5">
                          <div className={cn(
                            "grid grid-cols-[1fr_1fr_50px_60px_24px] gap-1 px-2 py-1 items-center",
                            isNewCustomer && idx > 0 && "border-t-2 border-accent/30"
                          )}>
                            <input value={row.customerName} onChange={e => updateRow(row.id, 'customerName', e.target.value)}
                              placeholder="Customer" className={cn("h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate", !isNewCustomer && "text-muted-foreground")} />
                            <input value={row.itemName} onChange={e => updateRow(row.id, 'itemName', e.target.value)}
                              placeholder="Item" className="h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate" />
                            <input type="number" value={row.quantity || ''} onChange={e => updateRow(row.id, 'quantity', parseFloat(e.target.value) || 0)}
                              placeholder="Qty" className="h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                            <input type="number" value={row.amount || ''} onChange={e => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="₹" className="h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded" />
                            <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                          </div>
                          {row.itemName.trim() && (
                            <div className="flex items-center gap-1 px-2 pb-0.5">
                              {row.matchedItemId ? (
                                <span className="text-[9px] text-success flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> {row.matchedItemName}</span>
                              ) : (
                                <select value="" onChange={e => {
                                  const item = allItems.find(i => i.id === e.target.value);
                                  if (item) setRows(prev => prev.map(r => r.id === row.id ? { ...r, matchedItemId: item.id, matchedItemName: item.name } : r));
                                }} className="text-[9px] text-destructive bg-transparent border-none h-4">
                                  <option value="">⚠ No match</option>
                                  {allItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {groups.length > 0 && (
                    <div className="border-t border-border bg-secondary/20">
                      {groups.map((g, gi) => (
                        <div key={gi} className="flex justify-between px-2 py-1 text-xs">
                          <span className="font-medium truncate">{g.customerName} ({g.items.length} items)</span>
                          <span className="font-semibold text-accent">{formatINR(g.total)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-2 py-1.5 border-t border-border text-xs font-bold bg-accent/10">
                        <span>Grand Total ({groups.length} bills, {rows.length} items)</span>
                        <span className="text-accent">{formatINR(grandTotal)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {entryMode === 'bills' && rows.length > 0 && (
            <div className="bg-secondary/30 rounded-lg p-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Today Individual Sales</span>
                <span className="font-medium">{formatINR(saleTransactions.filter(t => t.type === 'sale').reduce((s, t) => s + t.amount, 0))}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Full Day Bill Total</span>
                <span className="font-medium">{formatINR(grandTotal)}</span>
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <Button onClick={handleSaveAll} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : entryMode === 'inventory' ? `Save ${rows.length} Item(s)` : `Save ${groups.length} Bill(s)`}
            </Button>
          )}
        </>
      )}

      {/* ============ BILL WISE ITEMS MODE ============ */}
      {entryMode === 'bill_items' && (
        <div className="space-y-3">
          {/* All bills list */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-2 py-1.5 bg-secondary/30 text-[10px] text-muted-foreground font-medium flex justify-between">
              <span>Today's Sales — Select bill to view/edit items</span>
              {salesWithoutItems.length > 0 && (
                <span className="text-warning">{salesWithoutItems.length} need items</span>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border/30">
              {existingSales.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">No sales found for today</div>
              ) : existingSales.map((sale, idx) => {
                const isSaved = savedBillIds.has(sale.transactionId);
                const isSelected = currentBillIdx === idx;
                return (
                  <button key={sale.transactionId}
                    onClick={() => {
                      setCurrentBillIdx(idx);
                      setBillItems([]);
                      setEditingBillId(null);
                      if (sale.hasItems || isSaved) {
                        loadBillItems(sale);
                      }
                    }}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-xs flex items-center gap-2 transition-colors",
                      isSelected ? "bg-accent/10" : "hover:bg-secondary/30"
                    )}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">#{sale.billNumber}</span>
                    <span className="font-medium truncate flex-1">{sale.customerName}</span>
                    <span className="font-semibold shrink-0">{formatINR(sale.amount)}</span>
                    {(sale.hasItems || isSaved) ? (
                      <span className="text-[9px] text-success flex items-center gap-0.5 shrink-0">
                        <Check className="w-3 h-3" /> {sale.itemCount} items
                      </span>
                    ) : (
                      <span className="text-[9px] text-warning shrink-0">No items</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current bill items editor */}
          {currentSale && (
            <div className="border border-accent/30 rounded-lg p-2 bg-accent/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-accent">
                  #{currentSale.billNumber} — {currentSale.customerName} — {formatINR(currentSale.amount)}
                </span>
                {(currentSale.hasItems || editingBillId) && (
                  <span className="text-[9px] text-success flex items-center gap-0.5">
                    <Pencil className="w-2.5 h-2.5" /> Editing
                  </span>
                )}
              </div>

              {/* OCR + Manual buttons */}
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1"
                  onClick={() => billCameraRef.current?.click()} disabled={isExtracting}>
                  {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />} Capture
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1"
                  onClick={() => billFileRef.current?.click()} disabled={isExtracting}>
                  {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => setBillItems(prev => [...prev, { extractedName: '', matchedName: null, selectedItemId: null, quantity: 1, secondaryQty: 0, rate: 0, amount: 0, confirmed: false, isNew: true }])}>
                  <Plus className="w-3 h-3" /> Item
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowColumnConfig(!showColumnConfig)}
                  title="Column config">
                  <Settings className="w-3 h-3 text-muted-foreground" />
                </Button>
                <input ref={billCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOcrCapture} />
                <input ref={billFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleOcrCapture} />
              </div>

              {/* Inline column config */}
              {showColumnConfig && (
                <BillColumnConfigInline onClose={() => setShowColumnConfig(false)} />
              )}

              {/* Items table */}
              {billItems.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                    Items ({billItems.length}) — {billItems.filter(i => i.selectedItemId).length} matched
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
                    {billItems.map((item, idx) => {
                      const secUnit = getItemSecondaryUnit(item.selectedItemId);
                      return (
                        <div key={idx} className="px-2 py-1.5 space-y-1">
                          <div className="flex items-center gap-1 text-xs">
                            <input type="text" value={item.extractedName}
                              onChange={e => updateBillItem(idx, 'extractedName', e.target.value)}
                              placeholder="Name" className="w-20 h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate" />
                            <select value={item.selectedItemId || ''}
                              onChange={e => updateBillItem(idx, 'selectedItemId', e.target.value || null)}
                              className={cn("flex-1 h-7 px-1 text-[11px] bg-background/50 border rounded truncate",
                                !item.selectedItemId ? "border-destructive/50 text-destructive" : "border-border text-foreground")}>
                              <option value="">No match</option>
                              {allItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <input type="number" value={item.quantity || ''} onChange={e => updateBillItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              placeholder="Qty" className="w-14 h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                            {secUnit && (
                              <input type="number" value={item.secondaryQty || ''} onChange={e => updateBillItem(idx, 'secondaryQty', parseFloat(e.target.value) || 0)}
                                placeholder={secUnit} className="w-14 h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                            )}
                            <input type="number" value={item.rate || ''} onChange={e => updateBillItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                              placeholder="Rate" className="w-14 h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded" />
                            <input type="number" value={item.amount || ''} onChange={e => updateBillItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="₹" className="w-16 h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded" />
                            <button onClick={() => setBillItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-2 py-1 bg-accent/10 flex justify-between text-xs font-medium text-accent">
                    <span>Total: {formatINR(billItems.reduce((s, i) => s + i.amount, 0))}</span>
                    <span className={cn(
                      Math.abs(billItems.reduce((s, i) => s + i.amount, 0) - currentSale.amount) < 1 ? "text-success" : "text-warning"
                    )}>
                      Bill: {formatINR(currentSale.amount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Save + Next */}
              <div className="flex gap-1">
                <Button onClick={handleSaveBillItems} disabled={saving || billItems.length === 0} size="sm" className="flex-1 h-8 text-xs gap-1">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingBillId ? 'Update Items' : 'Save Items'}
                </Button>
                {existingSales.findIndex((s, i) => i > currentBillIdx && !s.hasItems && !savedBillIds.has(s.transactionId)) >= 0 && (
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
                    onClick={() => {
                      const nextIdx = existingSales.findIndex((s, i) => i > currentBillIdx && !s.hasItems && !savedBillIds.has(s.transactionId));
                      if (nextIdx >= 0) { setCurrentBillIdx(nextIdx); setBillItems([]); setEditingBillId(null); }
                    }}>
                    Next <ChevronRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline column config for Full Day Bill OCR
function BillColumnConfigInline({ onClose }: { onClose: () => void }) {
  const [totalCols, setTotalCols] = useState(4);
  const [itemCol, setItemCol] = useState(1);
  const [qtyCol, setQtyCol] = useState(2);
  const [rateCol, setRateCol] = useState<number | null>(null);
  const [amtCol, setAmtCol] = useState(3);
  const [hasRate, setHasRate] = useState(false);
  const [qtyType, setQtyType] = useState('primary');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('bill_format_config').select('*')
        .eq('config_name', 'default').maybeSingle();
      if (data) {
        setTotalCols(data.total_columns);
        setItemCol(data.item_name_column);
        setQtyCol(data.quantity_column);
        setRateCol(data.has_rate ? data.rate_column : null);
        setAmtCol(data.amount_column);
        setHasRate(data.has_rate);
        setQtyType(data.quantity_type);
      }
      setLoaded(true);
    })();
  }, []);

  const handleSaveConfig = async () => {
    await supabase.from('bill_format_config').upsert({
      config_name: 'default',
      total_columns: totalCols,
      item_name_column: itemCol,
      quantity_column: qtyCol,
      rate_column: hasRate ? rateCol : null,
      amount_column: amtCol,
      has_rate: hasRate,
      has_amount: true,
      quantity_type: qtyType,
    }, { onConflict: 'config_name' });
    toast.success('Column config saved');
    onClose();
  };

  if (!loaded) return null;

  return (
    <div className="border border-border rounded-lg p-2 bg-secondary/10 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">Column Order (OCR)</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <div>
          <label className="text-[9px] text-muted-foreground">Total Cols</label>
          <Input type="number" value={totalCols} onChange={e => setTotalCols(parseInt(e.target.value) || 4)} className="h-6 text-[10px]" />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground">Item Col</label>
          <Input type="number" value={itemCol} onChange={e => setItemCol(parseInt(e.target.value) || 1)} className="h-6 text-[10px]" />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground">Qty Col</label>
          <Input type="number" value={qtyCol} onChange={e => setQtyCol(parseInt(e.target.value) || 2)} className="h-6 text-[10px]" />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground">Amt Col</label>
          <Input type="number" value={amtCol} onChange={e => setAmtCol(parseInt(e.target.value) || 3)} className="h-6 text-[10px]" />
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        <label className="flex items-center gap-1">
          <Checkbox checked={hasRate} onCheckedChange={(v) => { setHasRate(!!v); if (v && !rateCol) setRateCol(3); }} />
          Has Rate
        </label>
        {hasRate && (
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-muted-foreground">Rate Col</label>
            <Input type="number" value={rateCol || ''} onChange={e => setRateCol(parseInt(e.target.value) || null)} className="h-6 w-10 text-[10px]" />
          </div>
        )}
        <Select value={qtyType} onValueChange={setQtyType}>
          <SelectTrigger className="h-6 text-[10px] w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="primary" className="text-xs">Primary</SelectItem>
            <SelectItem value="secondary" className="text-xs">Secondary</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" className="h-6 text-[10px] w-full" onClick={handleSaveConfig}>Save Config</Button>
    </div>
  );
}
