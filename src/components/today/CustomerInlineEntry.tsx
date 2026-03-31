import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, AlertTriangle, FileText, X, Check, Camera, Upload, Loader2, Settings } from 'lucide-react';
import { Transaction, TransactionSection, PaymentEntry, PaymentMode } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { searchCustomers, getDueBillsForCustomerId, getOrCreateCustomer, saveBillToSupabase, deductFromBatch, getBatchesForItem, getBillItemsForTransaction, restoreInventoryForBillItems, planBatchAllocations } from '@/hooks/useSupabaseData';
import { generateDailyBillNumber, customerTypePrefixMap, generateComputerBillNumber, SaleClassification } from '@/lib/billNumbers';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { useItems } from '@/hooks/useSupabaseData';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { ItemSearchSelect } from '@/components/items/ItemSearchSelect';

type CustomerSubType = 'sale' | 'sales_return' | 'balance_paid' | 'customer_advance';

interface CustomerResult {
  id: string;
  name: string;
  phone: string | null;
  dueBalance: number;
  advanceBalance: number;
}

interface DueBill {
  id: string;
  billNumber: string;
  totalAmount: number;
  dueAmount: number;
  createdAt: Date;
}

interface EntryRow {
  type: CustomerSubType;
  billNumber: string;
  computerBillNumber: string;
  billClassification: SaleClassification;
  customerQuery: string;
  customerId?: string;
  customerAdvance: number;
  amount: string;
  saleAmount: string;
  workshopAmount: string;
  vehicleAmount: string;
  payments: PaymentEntry[];
  useAdvance: string;
  selectedBills: string[];
  dueBills: DueBill[];
  welderId?: string;
  details: string;
}

interface WelderOption {
  id: string;
  name: string;
}

const createEmptyRow = (): EntryRow => ({
  type: 'sale',
  billNumber: '',
  computerBillNumber: '',
  billClassification: 'b2c' as SaleClassification,
  customerQuery: '',
  customerId: undefined,
  customerAdvance: 0,
  amount: '',
  saleAmount: '',
  workshopAmount: '',
  vehicleAmount: '',
  payments: [{ id: uuidv4(), mode: 'cash', amount: 0 }, { id: uuidv4(), mode: 'upi', amount: 0 }],
  useAdvance: '',
  selectedBills: [],
  dueBills: [],
  welderId: undefined,
  details: '',
});

const SUB_TYPES: { value: CustomerSubType; label: string }[] = [
  { value: 'sale', label: 'Sale' },
  { value: 'sales_return', label: 'Sales Return' },
  { value: 'balance_paid', label: 'Balance Payment' },
  { value: 'customer_advance', label: 'Customer Advance' },
];

const shortCustomerTypeLabel: Record<string, string> = {
  sale: 'SALE',
  sales_return: 'S-RTN',
  balance_paid: 'BAL PAY',
  customer_advance: 'ADV',
  opening_due: 'OP DUE',
};

// Expandable transaction row showing bill items
function SaleTransactionRow({ transaction: txn, onEdit, onDelete }: { transaction: Transaction; onEdit: (t: Transaction) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [billItemsLocal, setBillItemsLocal] = useState<any[]>([]);
  const [loadedItems, setLoadedItems] = useState(false);

  const loadItems = async () => {
    if (loadedItems) return;
    const { data: bills } = await supabase.from('bills').select('id').eq('transaction_id', txn.id);
    if (bills?.[0]) {
      const { data: items } = await supabase.from('bill_items').select('*').eq('bill_id', bills[0].id);
      setBillItemsLocal(items || []);
    }
    setLoadedItems(true);
  };

  const handleToggle = () => {
    if (!expanded) loadItems();
    setExpanded(!expanded);
  };

  return (
    <div className="hover:bg-secondary/20">
      <button onClick={handleToggle} className="w-full px-2 py-2 text-left space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[10px] font-medium text-muted-foreground w-16 shrink-0 truncate">{shortCustomerTypeLabel[txn.type] || txn.type.replace(/_/g, ' ').toUpperCase()}</span>
          <span className="font-medium truncate flex-1">{txn.customerName || '-'}</span>
          {txn.billNumber && <span className="text-[10px] text-muted-foreground shrink-0 max-w-[120px] truncate">#{txn.billNumber}</span>}
          <span className="font-semibold shrink-0">{formatINR(txn.amount)}</span>
          <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(txn)} className="p-0.5 hover:text-accent"><Pencil className="w-3 h-3" /></button>
            <button onClick={() => onDelete(txn.id)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-16 text-[10px]">
          {txn.payments.filter(p => p.amount > 0).map((p, pi) => (
            <span key={pi} className={cn(
              p.mode === 'cash' ? 'text-success' : p.mode === 'upi' ? 'text-info' : p.mode === 'cheque' ? 'text-warning' : p.mode === 'advance' ? 'text-primary' : 'text-muted-foreground'
            )}>
              {p.mode === 'cash' ? '💵' : p.mode === 'upi' ? '📱' : p.mode === 'cheque' ? '📄' : p.mode === 'advance' ? '🔄' : '💳'}
              {p.mode === 'advance' ? `Adv:${formatINR(p.amount)}` : formatINR(p.amount)}
            </span>
          ))}
          {txn.due != null && txn.due > 0 && <span className="text-warning font-medium">⚠️Due:{formatINR(txn.due)}</span>}
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="px-3 pb-2 pt-1 bg-secondary/20">
              {!loadedItems ? (
                <div className="text-[10px] text-muted-foreground py-1">Loading...</div>
              ) : billItemsLocal.length === 0 ? (
                <div className="text-[10px] text-muted-foreground py-1">No items recorded</div>
              ) : (
                <div className="space-y-0.5">
                  <div className="grid grid-cols-[1fr_45px_45px_55px] gap-1 text-[9px] text-muted-foreground font-medium">
                    <span>Item</span><span className="text-center">Qty</span><span className="text-right">Rate</span><span className="text-right">Amt</span>
                  </div>
                  {billItemsLocal.map((item: any) => (
                    <div key={item.id} className="grid grid-cols-[1fr_45px_45px_55px] gap-1 text-[10px]">
                      <span className="truncate">{item.item_name}</span>
                      <span className="text-center">{item.primary_quantity}{item.secondary_quantity > 0 ? `/${item.secondary_quantity}` : ''}</span>
                      <span className="text-right text-muted-foreground">{formatINR(Number(item.rate))}</span>
                      <span className="text-right font-medium">{formatINR(Number(item.total_amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CustomerInlineEntryProps {
  transactions: Transaction[];
  selectedDate: Date;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction?: Transaction | null;
  onCancelEdit?: () => void;
}

export function CustomerInlineEntry({
  transactions, selectedDate, onSave, onEditTransaction, onDeleteTransaction,
  editingTransaction, onCancelEdit,
}: CustomerInlineEntryProps) {
  const navigate = useNavigate();
  const { items: allItems } = useItems();
  const { selectableMethods } = usePaymentMethods();
  const [entry, setEntry] = useState<EntryRow>(createEmptyRow());
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [welders, setWelders] = useState<WelderOption[]>([]);
  const billFileRef = useRef<HTMLInputElement>(null);
  const billCameraRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedBillItems, setExtractedBillItems] = useState<any[]>([]);
  const [billImageBase64, setBillImageBase64] = useState<string | null>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  const getItemSecondaryUnit = (itemId: string | null) => {
    if (!itemId) return null;
    const item = allItems.find(i => i.id === itemId);
    return item?.secondaryUnit || null;
  };

  const customerTransactions = transactions.filter(t => t.section === 'sale');

  useEffect(() => {
    if (!editingTransaction) generateBillNumber(entry.type);
  }, [entry.type, editingTransaction]);
  useEffect(() => {
    supabase.from('welders').select('id, name').order('name').then(({ data }) => setWelders(data || []));
  }, []);

  // Populate entry from editingTransaction
  useEffect(() => {
    if (editingTransaction) {
      const typeMap: Record<string, CustomerSubType> = {
        sale: 'sale', sales_return: 'sales_return', balance_paid: 'balance_paid', customer_advance: 'customer_advance',
      };
      setEntry({
        type: typeMap[editingTransaction.type] || 'sale',
        billNumber: editingTransaction.billNumber || '',
        computerBillNumber: editingTransaction.computerBillNumber || '',
        billClassification: (editingTransaction.billClassification || 'b2c') as SaleClassification,
        customerQuery: editingTransaction.customerName || '',
        customerId: editingTransaction.customerId,
        customerAdvance: 0,
        amount: editingTransaction.amount?.toString() || '',
        saleAmount: '',
        workshopAmount: '',
        vehicleAmount: '',
        payments: editingTransaction.payments.length > 0 ? editingTransaction.payments : [{ id: uuidv4(), mode: 'cash', amount: 0 }],
        useAdvance: '',
        selectedBills: [],
        dueBills: [],
        welderId: editingTransaction.welderId,
        details: editingTransaction.details || '',
      });
      // Load existing bill items for editing
      if (editingTransaction.type === 'sale' || editingTransaction.type === 'sales_return') {
        getBillItemsForTransaction(editingTransaction.id).then(result => {
          if (result && result.items.length > 0) {
            const items = result.items.map(i => ({
              extractedName: i.itemName,
              matchedName: i.itemName,
              selectedItemId: i.itemId,
              quantity: i.primaryQty,
              primaryQty: i.primaryQty,
              secondaryQty: i.secondaryQty,
              rate: i.rate,
              amount: i.amount,
              confirmed: !!i.itemId,
              batchId: i.batchId,
            }));
            setExtractedBillItems(items);
          }
        });
      }
    }
  }, [editingTransaction]);

  const generateBillNumber = async (type: CustomerSubType) => {
    const prefix = customerTypePrefixMap[type];
    if (!prefix) return;
    const billNumber = await generateDailyBillNumber(prefix, selectedDate);
    setEntry(prev => ({ ...prev, billNumber }));
  };

  useEffect(() => {
    if (entry.customerId) { setShowCustomerDropdown(false); return; }
    const timer = setTimeout(async () => {
      if (entry.customerId) return; // guard against race
      if (entry.customerQuery.length >= 2) {
        const results = await searchCustomers(entry.customerQuery);
        if (entry.customerId) return; // guard after async
        setCustomerResults(results);
        setShowCustomerDropdown(true);
      } else {
        setCustomerResults([]);
        setShowCustomerDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [entry.customerQuery, entry.customerId]);

  const [customerTotalDue, setCustomerTotalDue] = useState(0);

  useEffect(() => {
    if (entry.type === 'balance_paid' && entry.customerId) {
      // Fetch due bills AND opening_due transactions with remaining due
      getDueBillsForCustomerId(entry.customerId).then((bills) => {
        setCustomerTotalDue(bills.reduce((s, b) => s + b.dueAmount, 0));
        setEntry(prev => ({ ...prev, dueBills: bills }));
      });
    } else if (entry.type === 'balance_paid' && entry.customerQuery.length >= 2) {
      setEntry(prev => ({ ...prev, dueBills: [] }));
    }
  }, [entry.type, entry.customerQuery, entry.customerId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        customerInputRef.current && !customerInputRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCustomer = (customer: CustomerResult) => {
    setEntry(prev => ({ ...prev, customerQuery: customer.name, customerId: customer.id, customerAdvance: customer.advanceBalance }));
    setShowCustomerDropdown(false);
  };

  const updatePayment = (index: number, field: 'mode' | 'amount', value: string) => {
    setEntry(prev => {
      const payments = [...prev.payments];
      if (field === 'amount') payments[index] = { ...payments[index], amount: parseFloat(value) || 0 };
      else payments[index] = { ...payments[index], mode: value as PaymentMode };
      return { ...prev, payments };
    });
  };

  const addPaymentMode = () => setEntry(prev => ({ ...prev, payments: [...prev.payments, { id: uuidv4(), mode: 'upi', amount: 0 }] }));
  const removePayment = (index: number) => { if (entry.payments.length > 1) setEntry(prev => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) })); };
  const toggleBillSelection = (billId: string) => {
    setEntry(prev => ({
      ...prev, selectedBills: prev.selectedBills.includes(billId)
        ? prev.selectedBills.filter(id => id !== billId) : [...prev.selectedBills, billId],
    }));
  };

  const computeDue = () => {
    const amountNum = parseFloat(entry.amount) || 0;
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);
    const advanceUsed = parseFloat(entry.useAdvance) || 0;
    const diff = amountNum - totalPayments - advanceUsed;
    return diff; // positive = due, negative = overpayment
  };

  const [giveBackPayments, setGiveBackPayments] = useState<PaymentEntry[]>([]);
  const [saveAsAdvance, setSaveAsAdvance] = useState(false);

  const addGiveBack = () => setGiveBackPayments(prev => [...prev, { id: uuidv4(), mode: 'cash' as PaymentMode, amount: 0 }]);
  const updateGiveBack = (i: number, field: 'mode' | 'amount', value: string) => {
    setGiveBackPayments(prev => {
      const updated = [...prev];
      if (field === 'amount') updated[i] = { ...updated[i], amount: parseFloat(value) || 0 };
      else updated[i] = { ...updated[i], mode: value as PaymentMode };
      return updated;
    });
  };
  const removeGiveBack = (i: number) => setGiveBackPayments(prev => prev.filter((_, idx) => idx !== i));

  const handleBillCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setBillImageBase64(base64);
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
      const enriched = items.map((ext: any) => {
        const masterItem = allItems.find(i => i.name.toLowerCase() === (ext.matchedName || ext.extractedName)?.toLowerCase());
        return { ...ext, selectedItemId: masterItem?.id || null, confirmed: !!masterItem };
      });
      setExtractedBillItems(enriched);
      const total = enriched.reduce((s: number, i: any) => s + (i.amount || 0), 0);
      if (total > 0) setEntry(prev => ({ ...prev, amount: total.toString() }));
      toast.success(`Extracted ${enriched.length} items`);
    } catch (err: any) {
      toast.error('Extraction failed: ' + (err.message || 'Unknown'));
    } finally {
      setIsExtracting(false);
    }
  };

  const updateExtractedItemMatch = (index: number, itemId: string) => {
    const updated = [...extractedBillItems];
    const masterItem = allItems.find(i => i.id === itemId);
    updated[index] = { ...updated[index], selectedItemId: itemId || null, matchedName: masterItem?.name || null, confirmed: !!itemId };
    setExtractedBillItems(updated);
  };

  const handleSave = async () => {
    const totalPayments = entry.payments.reduce((s, p) => s + p.amount, 0);

    if ((entry.type === 'sale' || entry.type === 'sales_return') && extractedBillItems.length > 0) {
      for (const item of extractedBillItems) {
        if (!item.selectedItemId || entry.type !== 'sale') continue;
        const primaryQty = Number(item.quantity || item.primaryQty || 0);
        const secondaryQty = Number(item.secondaryQty || 0);
        const { remainingPrimary, remainingSecondary } = await planBatchAllocations(item.selectedItemId, primaryQty, secondaryQty);
        if (remainingPrimary > 0 || remainingSecondary > 0) {
          toast.error(`Insufficient stock for ${item.matchedName || item.extractedName || 'selected item'}`);
          return;
        }
      }
    }

    if (entry.type === 'customer_advance') {
      if (totalPayments <= 0) { toast.error('Payment required'); return; }
      if (!entry.customerQuery) { toast.error('Customer required'); return; }
    } else if (entry.type === 'balance_paid') {
      if (totalPayments <= 0) { toast.error('Payment required'); return; }
      if (!entry.customerQuery) { toast.error('Customer name required'); return; }
    } else {
      const amountNum = parseFloat(entry.amount) || 0;
      if (amountNum <= 0) { toast.error('Amount required'); return; }
      // Name mandatory for due bills
      const due = amountNum - totalPayments - (parseFloat(entry.useAdvance) || 0);
      if (due > 0 && !entry.customerQuery) { toast.error('Customer name required for due bills'); return; }
    }

    setSaving(true);
    try {
      let finalCustomerId = entry.customerId;
      if (entry.customerQuery && !finalCustomerId) {
        finalCustomerId = await getOrCreateCustomer(entry.customerQuery) || undefined;
      }

      const amountNum = parseFloat(entry.amount) || 0;
      const advanceUsed = parseFloat(entry.useAdvance) || 0;
      const effectivePayment = totalPayments + advanceUsed;
      const rawBalance = entry.type === 'sale' ? amountNum - effectivePayment : 0;
      const due = Math.max(0, rawBalance);
      const overpayment = Math.max(0, -rawBalance);

      const advancePayments: PaymentEntry[] = advanceUsed > 0
        ? [{ id: uuidv4(), mode: 'advance' as PaymentMode, amount: advanceUsed }] : [];

      const giveBack = giveBackPayments.filter(g => g.amount > 0);

      const transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: selectedDate,
        section: 'sale' as TransactionSection,
        type: entry.type,
        amount: entry.type === 'customer_advance' ? totalPayments : (entry.type === 'balance_paid' ? totalPayments : amountNum),
        payments: [...entry.payments.filter(p => p.amount > 0), ...advancePayments],
        giveBack: giveBack.length > 0 ? giveBack : undefined,
        billNumber: entry.billNumber || undefined,
        computerBillNumber: entry.computerBillNumber || undefined,
        billClassification: entry.billClassification || 'b2c',
        customerId: finalCustomerId,
        customerName: entry.customerQuery || undefined,
        due: due > 0 ? due : undefined,
        overpayment: overpayment > 0 ? overpayment : undefined,
        welderId: entry.welderId || undefined,
        details: entry.details || undefined,
      };

      await onSave(transaction);

      // Save bill items and deduct inventory for sale/sales_return with extracted items
      if ((entry.type === 'sale' || entry.type === 'sales_return') && extractedBillItems.length > 0) {
        const txnId = editingTransaction?.id || null;
        
        // If editing, restore old inventory first
        if (editingTransaction) {
          await restoreInventoryForBillItems(editingTransaction.id);
        }

        // Get the transaction ID
        const targetTxnId = txnId || (await supabase.from('transactions')
          .select('id').eq('bill_number', entry.billNumber).order('created_at', { ascending: false }).limit(1).maybeSingle()).data?.id;
        
        if (targetTxnId) {
          const billItemsData = extractedBillItems.filter(i => i.selectedItemId || i.extractedName?.trim()).map(i => {
            const masterItem = allItems.find(mi => mi.id === i.selectedItemId);
            return {
              itemId: i.selectedItemId,
              batchId: undefined as string | undefined,
              itemName: masterItem?.name || i.extractedName,
              primaryQty: i.quantity || i.primaryQty || 0,
              secondaryQty: i.secondaryQty || 0,
              rate: i.rate || (i.amount && i.quantity ? i.amount / i.quantity : (masterItem?.sellingPrice || 0)),
              total: i.amount || 0,
            };
          });

          const expandedBillItemsData: typeof billItemsData = [];

          // Auto-select batches and deduct for sales, restore for returns
          for (const bi of billItemsData) {
            if (bi.itemId) {
              if (entry.type === 'sale') {
                const { allocations } = await planBatchAllocations(bi.itemId, bi.primaryQty, bi.secondaryQty);
                for (const allocation of allocations) {
                  await deductFromBatch(allocation.batchId, allocation.primaryQty, allocation.secondaryQty);
                  expandedBillItemsData.push({
                    ...bi,
                    batchId: allocation.batchId,
                    primaryQty: allocation.primaryQty,
                    secondaryQty: allocation.secondaryQty,
                    total: bi.primaryQty > 0 ? Number(((bi.total * allocation.primaryQty) / bi.primaryQty).toFixed(2)) : bi.total,
                  });
                }
              } else if (entry.type === 'sales_return') {
                const batches = await getBatchesForItem(bi.itemId);
                const sorted = batches.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
                if (sorted.length > 0) {
                  await deductFromBatch(sorted[0].id, -bi.primaryQty, -bi.secondaryQty);
                  expandedBillItemsData.push({ ...bi, batchId: sorted[0].id });
                }
              } else {
                expandedBillItemsData.push(bi);
              }
            } else {
              expandedBillItemsData.push(bi);
            }
          }

          await saveBillToSupabase(targetTxnId, entry.billNumber, entry.type, amountNum, entry.customerQuery, undefined, expandedBillItemsData);
        }
      } else if (editingTransaction && (entry.type === 'sale' || entry.type === 'sales_return') && extractedBillItems.length === 0) {
        // Editing but items cleared - restore inventory and remove bill
        await restoreInventoryForBillItems(editingTransaction.id);
      }

      if (finalCustomerId) {
        if (entry.type === 'balance_paid') {
          const selectedDueBills = entry.dueBills.filter(b => entry.selectedBills.includes(b.id));
          let remaining = totalPayments;
          for (const bill of selectedDueBills) {
            const payForBill = Math.min(remaining, bill.dueAmount);
            remaining -= payForBill;
            await supabase.from('transactions').update({ due: bill.dueAmount - payForBill }).eq('id', bill.id);
          }
        }

        // Auto-create Customer Advance transaction for overpayment saved as advance
        if (entry.type === 'sale' && saveAsAdvance && overpayment > 0) {
          const overpaymentAmt = overpayment;
          const totalGivenBack = giveBackPayments.reduce((s, g) => s + g.amount, 0);
          const advanceAmount = overpaymentAmt - totalGivenBack;
          if (advanceAmount > 0) {
            // Generate CA bill number
            const caBillNumber = await generateDailyBillNumber('CA', selectedDate);

            const advanceTxn: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
              date: selectedDate,
              section: 'sale' as TransactionSection,
              type: 'customer_advance',
              amount: advanceAmount,
              payments: [{ id: uuidv4(), mode: 'cash' as PaymentMode, amount: advanceAmount }],
              billNumber: caBillNumber,
              customerId: finalCustomerId,
              customerName: entry.customerQuery || undefined,
              reference: `From sale overpayment ${entry.billNumber}`,
            };
            await onSave(advanceTxn);
            toast.success(`₹${advanceAmount.toLocaleString('en-IN')} saved as Customer Advance (${caBillNumber})`);
          }
        }
      }

      setEntry(createEmptyRow());
      setExtractedBillItems([]);
      setGiveBackPayments([]);
      setSaveAsAdvance(false);
      if (editingTransaction) onCancelEdit?.();
      toast.success('Saved');
    } catch (err) {
      toast.error('Error saving');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const renderCustomerSearch = () => (
    <div className="relative">
      <Input ref={customerInputRef} value={entry.customerQuery}
        onChange={e => setEntry(prev => ({ ...prev, customerQuery: e.target.value, customerId: undefined, customerAdvance: 0 }))}
        placeholder="Name or phone..." className="h-8 text-xs" enterKeyHint="next" />
      <AnimatePresence>
        {showCustomerDropdown && customerResults.length > 0 && (
          <motion.div ref={dropdownRef} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {customerResults.map(c => (
              <button key={c.id} onClick={() => selectCustomer(c)}
                className="w-full px-3 py-2 text-left hover:bg-secondary/50 text-xs border-b border-border/30 last:border-0">
                <div className="flex justify-between">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex gap-2">
                    {c.advanceBalance > 0 && <span className="text-success">Adv: {formatINR(c.advanceBalance)}</span>}
                    {c.dueBalance > 0 && <span className="text-warning">Due: {formatINR(c.dueBalance)}</span>}
                  </div>
                </div>
                {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Business Transactions</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/customers')}>
          <Plus className="w-3 h-3" /> Add Customer
        </Button>
      </div>

      {/* Existing transactions with expandable item details */}
      {customerTransactions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
          {customerTransactions.map((txn) => (
            <SaleTransactionRow key={txn.id} transaction={txn} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
          ))}
        </div>
      )}

      {/* New Entry */}
      <div className="border border-accent/30 rounded-lg p-3 bg-accent/5 space-y-2">
        {/* Toggle tabs for type selection */}
        <div className="flex rounded-lg overflow-hidden border border-border">
          {SUB_TYPES.map(st => (
            <button
              key={st.value}
              onClick={() => {
                const newType = st.value;
                setEntry(prev => ({ ...prev, type: newType, selectedBills: [], dueBills: [], customerQuery: '', customerId: undefined, customerAdvance: 0, amount: '', welderId: undefined, billClassification: prev.billClassification }));
              }}
              className={cn(
                "flex-1 py-1.5 text-[10px] font-medium transition-colors",
                entry.type === st.value ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Row 0: Classification + Computer Bill# (for sale) */}
        {entry.type === 'sale' && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
              <Select value={entry.billClassification} onValueChange={v => setEntry(prev => ({ ...prev, billClassification: v }))}>
                <SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="b2c" className="text-xs">B2C</SelectItem>
                  <SelectItem value="b2b" className="text-xs">B2B</SelectItem>
                  <SelectItem value="other_gst" className="text-xs">Other GST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Computer Bill #</label>
              <Input value={entry.computerBillNumber} onChange={e => setEntry(prev => ({ ...prev, computerBillNumber: e.target.value }))} placeholder="Computer bill no..." className="h-8 text-[10px] font-mono" />
            </div>
          </div>
        )}

        {/* Row 1: Bill# + Customer + Welder */}
        <div className="grid grid-cols-3 gap-2 md:grid-cols-[minmax(140px,1.2fr)_2fr_1fr]">
          {(entry.type === 'sale' || entry.type === 'sales_return') && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Bill #</label>
              <Input value={entry.billNumber} onChange={e => setEntry(prev => ({ ...prev, billNumber: e.target.value }))} className="h-8 text-[10px] font-mono" />
            </div>
          )}

          <div className={cn(
            entry.type === 'balance_paid' || entry.type === 'customer_advance' ? 'col-span-2' : '',
            !(entry.type === 'sale' || entry.type === 'sales_return') ? 'col-span-2' : ''
          )}>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Customer</label>
            {renderCustomerSearch()}
          </div>

          {entry.type === 'sale' && welders.length > 0 && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Welder</label>
              <Select value={entry.welderId || 'none'} onValueChange={v => setEntry(prev => ({ ...prev, welderId: v === 'none' ? undefined : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  {welders.map(w => <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Balance paid: due bills + opening due */}
        {entry.type === 'balance_paid' && entry.dueBills.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium flex justify-between">
              <span>Select bills to pay</span>
              {customerTotalDue > 0 && <span className="text-warning font-semibold">Total Due: {formatINR(customerTotalDue)}</span>}
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-border/30">
              {entry.dueBills.map(bill => (
                <label key={bill.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/20 cursor-pointer text-xs">
                  <Checkbox checked={entry.selectedBills.includes(bill.id)} onCheckedChange={() => toggleBillSelection(bill.id)} />
                  <span className="font-medium">{bill.billNumber || '-'}</span>
                  <span className="text-muted-foreground">{format(bill.createdAt, 'dd MMM')}</span>
                  <span className="ml-auto text-warning font-medium">{formatINR(bill.dueAmount)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Row 2: Amount + Payment */}
        <div className="space-y-2">
          {entry.type !== 'balance_paid' && entry.type !== 'customer_advance' && (
            <div>
              {entry.type === 'sale' ? (
                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Sale ₹</label>
                    <Input type="number" inputMode="numeric" value={entry.saleAmount}
                      onChange={e => {
                        const sale = parseFloat(e.target.value) || 0;
                        const workshop = parseFloat(entry.workshopAmount) || 0;
                        const vehicle = parseFloat(entry.vehicleAmount) || 0;
                        setEntry(prev => ({ ...prev, saleAmount: e.target.value, amount: String(sale + workshop + vehicle) }));
                      }}
                      placeholder="₹0" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Work ₹</label>
                    <Input type="number" inputMode="numeric" value={entry.workshopAmount}
                      onChange={e => {
                        const sale = parseFloat(entry.saleAmount) || 0;
                        const workshop = parseFloat(e.target.value) || 0;
                        const vehicle = parseFloat(entry.vehicleAmount) || 0;
                        setEntry(prev => ({ ...prev, workshopAmount: e.target.value, amount: String(sale + workshop + vehicle) }));
                      }}
                      placeholder="₹0" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Veh ₹</label>
                    <Input type="number" inputMode="numeric" value={entry.vehicleAmount}
                      onChange={e => {
                        const sale = parseFloat(entry.saleAmount) || 0;
                        const workshop = parseFloat(entry.workshopAmount) || 0;
                        const vehicle = parseFloat(e.target.value) || 0;
                        setEntry(prev => ({ ...prev, vehicleAmount: e.target.value, amount: String(sale + workshop + vehicle) }));
                      }}
                      placeholder="₹0" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Total ₹</label>
                    <Input type="number" inputMode="numeric" value={entry.amount}
                      onChange={e => setEntry(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="₹0" className="h-8 text-xs font-semibold" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Amount</label>
                  <Input type="number" inputMode="numeric" value={entry.amount}
                    onChange={e => setEntry(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="₹0" className="h-8 text-xs" />
                </div>
              )}
            </div>
          )}
          <div className={entry.type === 'customer_advance' || entry.type === 'balance_paid' ? '' : ''}>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Payment</label>
            <div className="space-y-1">
              {entry.payments.map((p, i) => (
                <div key={p.id} className="flex gap-1">
                  <Select value={p.mode} onValueChange={v => updatePayment(i, 'mode', v)}>
                    <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {selectableMethods.map(m => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" inputMode="numeric" value={p.amount || ''}
                    onChange={e => updatePayment(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
                  {entry.payments.length > 1 && (
                    <button onClick={() => removePayment(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
              <button onClick={addPaymentMode} className="text-[10px] text-accent hover:underline">+ Add</button>
            </div>
          </div>
        </div>

        {/* Row 3: Advance + Due */}
        {entry.type === 'sale' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {entry.customerAdvance > 0 && (
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">
                    From Advance <span className="text-success">({formatINR(entry.customerAdvance)})</span>
                  </label>
                  <Input type="number" inputMode="numeric" value={entry.useAdvance}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setEntry(prev => ({ ...prev, useAdvance: val <= prev.customerAdvance ? e.target.value : prev.customerAdvance.toString() }));
                    }} placeholder="₹0" className="h-8 text-xs" />
                </div>
              )}
              {computeDue() > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-warning/10 rounded-lg text-xs shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-warning font-medium">Due: {formatINR(computeDue())}</span>
                </div>
              )}
            </div>

            {/* Overpayment give-back / save as advance */}
            {computeDue() < 0 && (() => {
              const overpaymentAmt = Math.abs(computeDue());
              const totalGiveBack = giveBackPayments.reduce((s, g) => s + g.amount, 0);
              const remainingOverpay = overpaymentAmt - totalGiveBack;
              return (
                <div className="border border-success/30 rounded-lg p-2 bg-success/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-success">Overpayment: {formatINR(overpaymentAmt)}</span>
                    {giveBackPayments.length === 0 && !saveAsAdvance && (
                      <div className="flex gap-2">
                        <button onClick={addGiveBack} className="text-[10px] text-accent hover:underline">+ Give Back</button>
                        <button onClick={() => setSaveAsAdvance(true)} className="text-[10px] text-info hover:underline">💰 Save as Advance</button>
                      </div>
                    )}
                  </div>
                  {giveBackPayments.map((g, i) => (
                    <div key={g.id} className="flex gap-1">
                      <Select value={g.mode} onValueChange={v => updateGiveBack(i, 'mode', v)}>
                        <SelectTrigger className="h-7 text-[10px] w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                          <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" inputMode="numeric" value={g.amount || ''}
                        onChange={e => updateGiveBack(i, 'amount', e.target.value)} placeholder="₹0" className="h-7 text-xs flex-1" />
                      <button onClick={() => removeGiveBack(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  {giveBackPayments.length > 0 && (
                    <div className="flex gap-2">
                      <button onClick={addGiveBack} className="text-[10px] text-accent hover:underline">+ Add mode</button>
                      {remainingOverpay > 0 && !saveAsAdvance && (
                        <button onClick={() => setSaveAsAdvance(true)} className="text-[10px] text-info hover:underline">
                          💰 Save ₹{remainingOverpay.toLocaleString('en-IN')} as Advance
                        </button>
                      )}
                    </div>
                  )}
                  {saveAsAdvance && (
                    <div className="flex items-center justify-between bg-info/10 rounded-lg px-2 py-1.5">
                      <span className="text-[10px] text-info font-medium">
                        💰 {formatINR(remainingOverpay > 0 ? remainingOverpay : overpaymentAmt)} → Customer Advance
                        {entry.customerQuery && <span className="text-muted-foreground ml-1">({entry.customerQuery})</span>}
                      </span>
                      <button onClick={() => setSaveAsAdvance(false)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {!saveAsAdvance && giveBackPayments.length === 0 && (
                    <p className="text-[9px] text-muted-foreground">Choose to give back or save as customer advance</p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Bill Capture + Manual Item Entry for sale/return */}
        {(entry.type === 'sale' || entry.type === 'sales_return') && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => billCameraRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />} Capture Bill
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => billFileRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload Bill
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                setExtractedBillItems(prev => [...prev, { extractedName: '', matchedName: null, quantity: 1, primaryQty: 1, secondaryQty: 0, rate: 0, amount: 0, selectedItemId: null, confirmed: false }]);
              }}>
                <Plus className="w-3 h-3" /> Item
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowColumnConfig(!showColumnConfig)}
                title="Column config">
                <Settings className="w-3 h-3 text-muted-foreground" />
              </Button>
              <input ref={billCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleBillCapture} />
              <input ref={billFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleBillCapture} />
            </div>
            {/* Inline column config */}
            {showColumnConfig && (
              <SaleColumnConfigInline onClose={() => setShowColumnConfig(false)} />
            )}
            {extractedBillItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-2 py-1 bg-secondary/30 text-[10px] text-muted-foreground font-medium">
                  Items ({extractedBillItems.length}) — {extractedBillItems.filter(i => i.selectedItemId).length} matched
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
                  {extractedBillItems.map((item, idx) => {
                    const secUnit = getItemSecondaryUnit(item.selectedItemId);
                    return (
                      <div key={idx} className="px-2 py-1.5 space-y-1">
                        <div className="flex items-center gap-1 text-xs">
                          <input
                            type="text"
                            value={item.extractedName}
                            onChange={(e) => {
                              const updated = [...extractedBillItems];
                              updated[idx] = { ...updated[idx], extractedName: e.target.value };
                              setExtractedBillItems(updated);
                            }}
                            placeholder="Item name"
                            className="w-20 h-7 px-1 text-[11px] bg-background/50 border border-border rounded truncate"
                          />
                          <ItemSearchSelect
                            items={allItems.map(i => ({ id: i.id, name: i.name, paperBillName: i.paperBillName, sellingPrice: i.sellingPrice, primaryStock: i.primaryQuantity, secondaryStock: i.secondaryQuantity, secondaryUnit: i.secondaryUnit }))}
                            value={item.selectedItemId}
                            onChange={(id) => updateExtractedItemMatch(idx, id || '')}
                            className="flex-1"
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <input type="number" value={item.quantity || ''} onChange={(e) => {
                            const updated = [...extractedBillItems];
                            const qty = parseFloat(e.target.value) || 0;
                            updated[idx] = { ...updated[idx], quantity: qty, primaryQty: qty };
                            if (updated[idx].rate && qty > 0) {
                              updated[idx].amount = qty * updated[idx].rate;
                            }
                            setExtractedBillItems(updated);
                          }} placeholder="Pri Qty" className="w-14 h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                          {secUnit && (
                            <input type="number" value={item.secondaryQty || ''} onChange={(e) => {
                              const updated = [...extractedBillItems];
                              updated[idx] = { ...updated[idx], secondaryQty: parseFloat(e.target.value) || 0 };
                              setExtractedBillItems(updated);
                            }} placeholder={secUnit} className="w-14 h-7 px-1 text-[11px] text-center bg-background/50 border border-border rounded" />
                          )}
                          <input type="number" value={item.rate || ''} onChange={(e) => {
                            const updated = [...extractedBillItems];
                            const rate = parseFloat(e.target.value) || 0;
                            updated[idx] = { ...updated[idx], rate };
                            if (rate > 0 && updated[idx].quantity > 0) {
                              updated[idx].amount = updated[idx].quantity * rate;
                            }
                            setExtractedBillItems(updated);
                          }} placeholder="Rate" className="w-14 h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded" />
                          <input type="number" value={item.amount || ''} onChange={(e) => {
                            const updated = [...extractedBillItems];
                            const amount = parseFloat(e.target.value) || 0;
                            updated[idx] = { ...updated[idx], amount };
                            if (updated[idx].quantity > 0) {
                              updated[idx].rate = amount / updated[idx].quantity;
                            }
                            setExtractedBillItems(updated);
                          }} placeholder="₹" className="w-16 h-7 px-1 text-[11px] text-right bg-background/50 border border-border rounded" />
                          <button onClick={() => setExtractedBillItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-2 py-1 bg-accent/10 flex justify-between text-xs font-medium text-accent">
                  <button onClick={() => {
                    setExtractedBillItems(prev => [...prev, { extractedName: '', matchedName: null, quantity: 1, primaryQty: 1, secondaryQty: 0, rate: 0, amount: 0, selectedItemId: null, confirmed: false }]);
                  }} className="text-[10px] hover:underline">+ Add Item</button>
                  <span>Total: {formatINR(extractedBillItems.reduce((s, i) => s + i.amount, 0))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details field */}
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Details / Notes</label>
          <Input value={entry.details} onChange={e => setEntry(prev => ({ ...prev, details: e.target.value }))} placeholder="Details..." className="h-8 text-xs" />
        </div>

        <div className="flex gap-2">
          {editingTransaction && (
            <Button variant="outline" onClick={() => { onCancelEdit?.(); setEntry(createEmptyRow()); setExtractedBillItems([]); }} size="sm" className="h-8 text-xs">
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 h-8 text-xs gap-1">
            <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : editingTransaction ? 'Update' : 'Save & Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Inline column config for sale OCR
function SaleColumnConfigInline({ onClose }: { onClose: () => void }) {
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
        <span className="text-[10px] font-medium text-muted-foreground">Column Order (Sale)</span>
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
