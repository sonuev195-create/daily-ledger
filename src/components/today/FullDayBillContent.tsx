import { useState, useRef, useCallback } from 'react';
import { Plus, Trash2, ClipboardPaste, Lock, Unlock, Save, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getOrCreateCustomer, updateCustomerBalance, searchCustomers } from '@/hooks/useSupabaseData';

interface FullDayBillRow {
  id: string;
  customerName: string;
  itemName: string;
  quantity: number;
  amount: number;
}

interface CustomerBillGroup {
  customerName: string;
  items: FullDayBillRow[];
  total: number;
}

interface FullDayBillContentProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteTransaction: (id: string) => void;
}

export function FullDayBillContent({ transactions, selectedDate, onSave, onDeleteTransaction }: FullDayBillContentProps) {
  const [rows, setRows] = useState<FullDayBillRow[]>([]);
  const [mode, setMode] = useState<'partial' | 'full'>('partial');
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get individual sale items added through CustomerInlineEntry
  const saleTransactions = transactions.filter(t => t.section === 'sale' && (t.type === 'sale' || t.type === 'sales_return'));

  // Group rows by consecutive customer name
  const groupByCustomer = useCallback((rowList: FullDayBillRow[]): CustomerBillGroup[] => {
    const groups: CustomerBillGroup[] = [];
    let current: CustomerBillGroup | null = null;
    for (const row of rowList) {
      if (!row.customerName.trim()) continue;
      if (!current || current.customerName.toLowerCase() !== row.customerName.toLowerCase()) {
        current = { customerName: row.customerName, items: [], total: 0 };
        groups.push(current);
      }
      current.items.push(row);
      current.total += row.amount;
    }
    return groups;
  }, []);

  const groups = groupByCustomer(rows);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  // Parse pasted data (tab or comma separated)
  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newRows: FullDayBillRow[] = [];
    for (const line of lines) {
      const cols = line.split(/\t|,/).map(c => c.trim());
      if (cols.length >= 3) {
        const name = cols[0] || '';
        const item = cols[1] || '';
        const qty = parseFloat(cols[2]) || 0;
        const amt = cols.length >= 4 ? (parseFloat(cols[3]) || 0) : 0;
        newRows.push({ id: uuidv4(), customerName: name, itemName: item, quantity: qty, amount: amt });
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
      customerName: lastRow?.customerName || '',
      itemName: '',
      quantity: 0,
      amount: 0,
    }]);
  };

  const updateRow = (id: string, field: keyof FullDayBillRow, value: string | number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleSaveAll = async () => {
    if (groups.length === 0) { toast.error('No items to save'); return; }
    setSaving(true);
    try {
      for (const group of groups) {
        const customerId = await getOrCreateCustomer(group.customerName);
        if (!customerId) continue;

        // Get customer current balance
        const { data: custData } = await supabase.from('customers').select('due_balance, advance_balance').eq('id', customerId).maybeSingle();
        const currentDue = Number(custData?.due_balance || 0);
        const currentAdvance = Number(custData?.advance_balance || 0);

        // Generate bill number
        const { data: lastBill } = await supabase.from('transactions')
          .select('bill_number').like('bill_number', 'FD%').order('created_at', { ascending: false }).limit(1);
        let nextNum = 1;
        if (lastBill?.[0]?.bill_number) {
          const n = parseInt(lastBill[0].bill_number.replace('FD', ''), 10);
          if (!isNaN(n)) nextNum = n + 1;
        }
        const billNumber = `FD${nextNum.toString().padStart(4, '0')}`;

        // Create sale transaction (cash payment = full amount for now, user adjusts later)
        const saleTransaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
          date: selectedDate,
          section: 'sale' as TransactionSection,
          type: 'sale',
          amount: group.total,
          payments: [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: group.total }],
          billNumber,
          customerId,
          customerName: group.customerName,
          due: 0,
        };

        await onSave(saleTransaction);

        // Save bill items
        const { data: savedTxn } = await supabase.from('transactions')
          .select('id').eq('bill_number', billNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();

        if (savedTxn) {
          const { data: billData } = await supabase.from('bills').insert({
            transaction_id: savedTxn.id,
            bill_number: billNumber,
            bill_type: 'sale',
            total_amount: group.total,
            customer_name: group.customerName,
          }).select('id').single();

          if (billData) {
            const billItems = group.items.map(item => ({
              bill_id: billData.id,
              item_name: item.itemName,
              primary_quantity: item.quantity,
              secondary_quantity: 0,
              rate: item.quantity > 0 ? item.amount / item.quantity : 0,
              total_amount: item.amount,
            }));
            await supabase.from('bill_items').insert(billItems);
          }
        }
      }

      toast.success(`Saved ${groups.length} bills`);
      setRows([]);
    } catch (err) {
      console.error(err);
      toast.error('Error saving bills');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Full Day Bill</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === 'partial' ? 'full' : 'partial')}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
              mode === 'full' ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
            )}
          >
            {mode === 'full' ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {mode === 'full' ? 'Full (Today sale locked)' : 'Partial'}
          </button>
        </div>
      </div>

      {/* Warning if full mode and individual sales exist */}
      {mode === 'full' && saleTransactions.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-xs text-warning font-medium">
            <AlertTriangle className="w-3 h-3" /> {saleTransactions.length} individual sale(s) exist for today
          </div>
          <p className="text-[10px] text-muted-foreground">Remove individual sales to avoid duplicate inventory. Items from Full Day Bill will be used for inventory.</p>
          <div className="space-y-0.5">
            {saleTransactions.map(txn => (
              <div key={txn.id} className="flex items-center justify-between text-[10px] px-1">
                <span>{txn.customerName || '-'} — {formatINR(txn.amount)}</span>
                <button onClick={() => onDeleteTransaction(txn.id)} className="text-destructive hover:underline flex items-center gap-0.5">
                  <Trash2 className="w-2.5 h-2.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paste Area */}
      {showPaste ? (
        <div className="space-y-2 border border-accent/30 rounded-lg p-2 bg-accent/5">
          <label className="text-[10px] text-muted-foreground">Paste from Excel (Customer, Item, Qty, Amount)</label>
          <textarea
            ref={textareaRef}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste tab/comma separated data..."
            className="w-full h-24 text-xs p-2 bg-background border border-border rounded-md resize-none font-mono"
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs gap-1 flex-1" onClick={handlePaste}>
              <ClipboardPaste className="w-3 h-3" /> Parse
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setShowPaste(false); setPasteText(''); }}>
              Cancel
            </Button>
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
          <div className="grid grid-cols-[1fr_1fr_60px_70px_24px] gap-1 px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
            <span>Customer</span><span>Item</span><span>Qty</span><span>Amount</span><span></span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
            {rows.map((row, idx) => {
              const prevRow = idx > 0 ? rows[idx - 1] : null;
              const isNewCustomer = !prevRow || prevRow.customerName.toLowerCase() !== row.customerName.toLowerCase();
              return (
                <div key={row.id} className={cn(
                  "grid grid-cols-[1fr_1fr_60px_70px_24px] gap-1 px-2 py-1 items-center",
                  isNewCustomer && idx > 0 && "border-t-2 border-accent/30"
                )}>
                  <input
                    value={row.customerName}
                    onChange={e => updateRow(row.id, 'customerName', e.target.value)}
                    placeholder="Customer"
                    className={cn(
                      "h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate",
                      !isNewCustomer && "text-muted-foreground"
                    )}
                  />
                  <input
                    value={row.itemName}
                    onChange={e => updateRow(row.id, 'itemName', e.target.value)}
                    placeholder="Item"
                    className="h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate"
                  />
                  <input
                    type="number"
                    value={row.quantity || ''}
                    onChange={e => updateRow(row.id, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="Qty"
                    className="h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded"
                  />
                  <input
                    type="number"
                    value={row.amount || ''}
                    onChange={e => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)}
                    placeholder="₹"
                    className="h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded"
                  />
                  <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Per-customer totals */}
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
        </div>
      )}

      {/* Today's sale total comparison */}
      {rows.length > 0 && (
        <div className="bg-secondary/30 rounded-lg p-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Today Individual Sales Total</span>
            <span className="font-medium">{formatINR(saleTransactions.filter(t => t.type === 'sale').reduce((s, t) => s + t.amount, 0))}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Full Day Bill Total</span>
            <span className="font-medium">{formatINR(grandTotal)}</span>
          </div>
          <div className="flex justify-between text-xs font-semibold border-t border-border pt-1">
            <span>Combined</span>
            <span>{formatINR(saleTransactions.filter(t => t.type === 'sale').reduce((s, t) => s + t.amount, 0) + grandTotal)}</span>
          </div>
        </div>
      )}

      {/* Save */}
      {rows.length > 0 && (
        <Button onClick={handleSaveAll} disabled={saving} size="sm" className="w-full h-8 text-xs gap-1">
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : `Save ${groups.length} Bill(s)`}
        </Button>
      )}
    </div>
  );
}
