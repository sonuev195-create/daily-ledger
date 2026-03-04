import { useState, useEffect } from 'react';
import { Edit2, Calculator, Check, AlertCircle, Wallet, CreditCard, Users, Truck } from 'lucide-react';
import { DrawerOpening, DrawerClosing, DailySummary } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface DrawerAccordionContentProps {
  opening: DrawerOpening | null;
  closing: DrawerClosing | null;
  summary: DailySummary;
  onSaveOpening: (data: Partial<DrawerOpening>) => Promise<DrawerOpening>;
  onSaveClosing: (data: Partial<DrawerClosing>) => Promise<DrawerClosing>;
}

export function DrawerAccordionContent({ opening, closing, summary, onSaveOpening, onSaveClosing }: DrawerAccordionContentProps) {
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingClosing, setEditingClosing] = useState(false);

  // Opening state - Coin and Note (Indian banknotes)
  const [coin, setCoin] = useState(opening?.coin?.toString() || '0');
  const [note, setNote] = useState(opening?.cash?.toString() || '0');

  // Closing state
  const [manualCoin, setManualCoin] = useState(closing?.manualCoin?.toString() || '0');
  const [manualNote, setManualNote] = useState(closing?.manualCash?.toString() || '0');

  // Live balances
  const [customerAdvanceTotal, setCustomerAdvanceTotal] = useState(0);
  const [customerDueTotal, setCustomerDueTotal] = useState(0);
  const [supplierDueTotal, setSupplierDueTotal] = useState(0);

  const [saving, setSaving] = useState(false);

  // Load live balances
  useEffect(() => {
    (async () => {
      const [custRes, suppRes] = await Promise.all([
        supabase.from('customers').select('advance_balance, due_balance'),
        supabase.from('suppliers').select('balance'),
      ]);
      if (custRes.data) {
        setCustomerAdvanceTotal(custRes.data.reduce((s, c) => s + Number(c.advance_balance), 0));
        setCustomerDueTotal(custRes.data.reduce((s, c) => s + Number(c.due_balance), 0));
      }
      if (suppRes.data) {
        setSupplierDueTotal(suppRes.data.reduce((s, c) => s + Number(c.balance), 0));
      }
    })();
  }, []);

  // Update state when props change
  useEffect(() => {
    setCoin(opening?.coin?.toString() || '0');
    setNote(opening?.cash?.toString() || '0');
  }, [opening]);

  useEffect(() => {
    setManualCoin(closing?.manualCoin?.toString() || '0');
    setManualNote(closing?.manualCash?.toString() || '0');
  }, [closing]);

  // Cash = Coin + Note
  const openingCash = opening ? opening.coin + opening.cash : 0;
  const systemCash = openingCash + summary.cashIn - summary.cashOut;
  // UPI opening = 0 always
  const systemUpi = summary.upiIn - summary.upiOut;

  // Closing
  const closingTotal = (parseFloat(manualCoin) || 0) + (parseFloat(manualNote) || 0);
  const cashError = closingTotal - systemCash;

  const handleSaveOpening = async () => {
    setSaving(true);
    try {
      await onSaveOpening({
        coin: parseFloat(coin) || 0,
        cash: parseFloat(note) || 0,
        homeAdvance: 0,
        upiOpening: 0,
        bankOpening: 0,
      });
      setEditingOpening(false);
      toast.success('Opening saved');
    } finally { setSaving(false); }
  };

  const handleSaveClosing = async () => {
    setSaving(true);
    try {
      await onSaveClosing({
        systemCash,
        manualCoin: parseFloat(manualCoin) || 0,
        manualCash: parseFloat(manualNote) || 0,
        cashToHome: 0,
        difference: cashError,
        systemUpi,
        systemBank: 0,
      });
      setEditingClosing(false);
      toast.success('Closing saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const rows = [
    {
      label: 'Cash',
      icon: Wallet,
      colorClass: 'text-success',
      bgClass: 'bg-success/10',
      value: closing ? closingTotal : systemCash,
      detail: `Coin: ${formatINR(opening?.coin || 0)} + Note: ${formatINR(opening?.cash || 0)}`,
    },
    {
      label: 'UPI',
      icon: CreditCard,
      colorClass: 'text-info',
      bgClass: 'bg-info/10',
      value: closing ? closing.systemUpi : systemUpi,
      detail: 'Opening: ₹0',
    },
    {
      label: 'Customer Advance',
      icon: Users,
      colorClass: 'text-success',
      bgClass: 'bg-success/10',
      value: customerAdvanceTotal,
    },
    {
      label: 'Customer Due',
      icon: Users,
      colorClass: 'text-warning',
      bgClass: 'bg-warning/10',
      value: customerDueTotal,
    },
    {
      label: 'Supplier Due',
      icon: Truck,
      colorClass: 'text-destructive',
      bgClass: 'bg-destructive/10',
      value: supplierDueTotal,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Summary Rows */}
      <div className="space-y-1.5">
        {rows.map(row => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30">
              <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0", row.bgClass)}>
                <Icon className={cn("w-4 h-4", row.colorClass)} />
              </div>
              <span className="text-sm text-foreground flex-1">{row.label}</span>
              <span className={cn("text-sm font-bold", row.colorClass)}>{formatINR(row.value)}</span>
            </div>
          );
        })}
      </div>

      {/* Opening Section */}
      <div className="bg-secondary/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-foreground">Opening (Cash)</h4>
          <button onClick={() => setEditingOpening(!editingOpening)} className="text-xs text-accent flex items-center gap-1 hover:underline">
            <Edit2 className="w-3 h-3" /> {editingOpening ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingOpening ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Coin</label>
                <Input type="number" value={coin} onChange={e => setCoin(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Note</label>
                <Input type="number" value={note} onChange={e => setNote(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm bg-secondary/50 rounded-lg p-2">
              <span className="text-muted-foreground">Total Cash</span>
              <span className="font-semibold">{formatINR((parseFloat(coin) || 0) + (parseFloat(note) || 0))}</span>
            </div>
            <Button size="sm" onClick={handleSaveOpening} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Opening'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Coin</p>
              <p className="font-medium">{formatINR(opening?.coin || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Note</p>
              <p className="font-medium">{formatINR(opening?.cash || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="font-medium">{formatINR(openingCash)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Closing Section */}
      <div className="bg-secondary/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-foreground">Closing (Cash)</h4>
          <button onClick={() => setEditingClosing(!editingClosing)} className="text-xs text-accent flex items-center gap-1 hover:underline">
            <Calculator className="w-3 h-3" /> {closing ? (editingClosing ? 'Cancel' : 'Edit') : (editingClosing ? 'Cancel' : 'Close Drawer')}
          </button>
        </div>

        {/* System Cash */}
        <div className="flex items-center justify-between text-sm mb-2 bg-accent/10 rounded-lg p-2">
          <span className="text-muted-foreground text-xs">System Cash</span>
          <span className="font-bold text-accent">{formatINR(systemCash)}</span>
        </div>

        {editingClosing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Coin</label>
                <Input type="number" value={manualCoin} onChange={e => setManualCoin(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Note</label>
                <Input type="number" value={manualNote} onChange={e => setManualNote(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div className="flex justify-between text-xs p-2 bg-secondary/50 rounded-lg">
              <span className="text-muted-foreground">Closing Total</span>
              <span className="font-semibold">{formatINR(closingTotal)}</span>
            </div>
            <div className={cn(
              "flex justify-between text-xs p-2 rounded-lg items-center",
              cashError === 0 ? "bg-success/10" : "bg-destructive/10"
            )}>
              <span className="text-muted-foreground flex items-center gap-1">
                {cashError === 0 ? <Check className="w-3 h-3 text-success" /> : <AlertCircle className="w-3 h-3 text-destructive" />}
                Error
              </span>
              <span className={cn("font-bold", cashError === 0 ? "text-success" : "text-destructive")}>
                {cashError === 0 ? '0 Error' : `${cashError >= 0 ? '+' : ''}${formatINR(cashError)}`}
              </span>
            </div>
            <Button size="sm" onClick={handleSaveClosing} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Closing'}
            </Button>
          </div>
        ) : closing ? (
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Coin</p>
                <p className="font-medium">{formatINR(closing.manualCoin)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Note</p>
                <p className="font-medium">{formatINR(closing.manualCash)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total</p>
                <p className="font-medium">{formatINR(closing.manualCoin + closing.manualCash)}</p>
              </div>
            </div>
            <div className={cn(
              "flex justify-between text-xs p-2 rounded-lg items-center mt-1",
              closing.difference === 0 ? "bg-success/10" : "bg-destructive/10"
            )}>
              <span className="flex items-center gap-1">
                {closing.difference === 0 ? <Check className="w-3 h-3 text-success" /> : <AlertCircle className="w-3 h-3 text-destructive" />}
                Error
              </span>
              <span className={cn("font-bold", closing.difference === 0 ? "text-success" : "text-destructive")}>
                {closing.difference === 0 ? '0 Error' : formatINR(closing.difference)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not closed yet. Click "Close Drawer" to enter manual count.</p>
        )}
      </div>
    </div>
  );
}
