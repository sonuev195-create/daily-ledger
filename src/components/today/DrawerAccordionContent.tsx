import { useState } from 'react';
import { Edit2, Calculator, Wallet, CreditCard, Building2, Check, AlertCircle } from 'lucide-react';
import { DrawerOpening, DrawerClosing, DailySummary } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DrawerAccordionContentProps {
  opening: DrawerOpening | null;
  closing: DrawerClosing | null;
  summary: DailySummary;
  onSaveOpening: (data: Partial<DrawerOpening>) => Promise<DrawerOpening>;
  onSaveClosing: (data: Partial<DrawerClosing>) => Promise<DrawerClosing>;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export function DrawerAccordionContent({ opening, closing, summary, onSaveOpening, onSaveClosing }: DrawerAccordionContentProps) {
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingClosing, setEditingClosing] = useState(false);

  // Opening state
  const [coin, setCoin] = useState(opening?.coin?.toString() || '0');
  const [cash, setCash] = useState(opening?.cash?.toString() || '0');
  const [homeAdvance, setHomeAdvance] = useState(opening?.homeAdvance?.toString() || '0');
  const [upiOpening, setUpiOpening] = useState(opening?.upiOpening?.toString() || '0');
  const [bankOpening, setBankOpening] = useState(opening?.bankOpening?.toString() || '0');

  // Closing state
  const [manualCoin, setManualCoin] = useState(closing?.manualCoin?.toString() || '0');
  const [manualCash, setManualCash] = useState(closing?.manualCash?.toString() || '0');
  const [cashToHome, setCashToHome] = useState(closing?.cashToHome?.toString() || '0');

  const [saving, setSaving] = useState(false);

  const openingCash = opening ? opening.coin + opening.cash + opening.homeAdvance : 0;
  const systemCash = openingCash + summary.cashIn - summary.cashOut;
  const systemUpi = (opening?.upiOpening || 0) + summary.upiIn - summary.upiOut;
  const systemBank = opening?.bankOpening || 0;

  const closingManualTotal = (parseFloat(manualCoin) || 0) + (parseFloat(manualCash) || 0) + (parseFloat(cashToHome) || 0);
  const shopKept = (parseFloat(manualCoin) || 0) + (parseFloat(manualCash) || 0);
  const difference = closingManualTotal - systemCash;

  const handleSaveOpening = async () => {
    setSaving(true);
    try {
      await onSaveOpening({
        coin: parseFloat(coin) || 0,
        cash: parseFloat(cash) || 0,
        homeAdvance: parseFloat(homeAdvance) || 0,
        upiOpening: parseFloat(upiOpening) || 0,
        bankOpening: parseFloat(bankOpening) || 0,
      });
      setEditingOpening(false);
      toast.success('Opening saved');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClosing = async () => {
    setSaving(true);
    try {
      await onSaveClosing({
        systemCash,
        manualCoin: parseFloat(manualCoin) || 0,
        manualCash: parseFloat(manualCash) || 0,
        cashToHome: parseFloat(cashToHome) || 0,
        difference,
        systemUpi,
        systemBank,
      });
      setEditingClosing(false);
      toast.success('Closing saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const openingTotal = (parseFloat(coin) || 0) + (parseFloat(cash) || 0) + (parseFloat(homeAdvance) || 0);

  return (
    <div className="space-y-4">
      {/* Current Drawer Status */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-success/10 rounded-lg p-3 text-center">
          <Wallet className="w-4 h-4 mx-auto text-success mb-1" />
          <p className="text-xs text-muted-foreground">Cash</p>
          <p className="text-lg font-bold text-success">{formatCurrency(closing ? (closing.manualCoin + closing.manualCash) : systemCash)}</p>
        </div>
        <div className="bg-info/10 rounded-lg p-3 text-center">
          <CreditCard className="w-4 h-4 mx-auto text-info mb-1" />
          <p className="text-xs text-muted-foreground">UPI</p>
          <p className="text-lg font-bold text-info">{formatCurrency(closing ? closing.systemUpi : systemUpi)}</p>
        </div>
        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <Building2 className="w-4 h-4 mx-auto text-primary mb-1" />
          <p className="text-xs text-muted-foreground">Bank</p>
          <p className="text-lg font-bold text-primary">{formatCurrency(systemBank)}</p>
        </div>
      </div>

      {/* Opening Section */}
      <div className="bg-secondary/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-foreground">Opening</h4>
          <button onClick={() => setEditingOpening(!editingOpening)} className="text-xs text-accent flex items-center gap-1 hover:underline">
            <Edit2 className="w-3 h-3" /> {editingOpening ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingOpening ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Coin</label>
                <Input type="number" value={coin} onChange={(e) => setCoin(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cash</label>
                <Input type="number" value={cash} onChange={(e) => setCash(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">From Home</label>
                <Input type="number" value={homeAdvance} onChange={(e) => setHomeAdvance(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">UPI Opening</label>
                <Input type="number" value={upiOpening} onChange={(e) => setUpiOpening(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Bank Opening</label>
                <Input type="number" value={bankOpening} onChange={(e) => setBankOpening(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm bg-secondary/50 rounded-lg p-2">
              <span className="text-muted-foreground">Total Opening Cash</span>
              <span className="font-semibold">{formatCurrency(openingTotal)}</span>
            </div>
            <Button size="sm" onClick={handleSaveOpening} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Opening'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Coin</p>
              <p className="font-medium">{formatCurrency(opening?.coin || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cash</p>
              <p className="font-medium">{formatCurrency(opening?.cash || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">From Home</p>
              <p className="font-medium">{formatCurrency(opening?.homeAdvance || 0)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Closing Section */}
      <div className="bg-secondary/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-foreground">Closing</h4>
          <button onClick={() => setEditingClosing(!editingClosing)} className="text-xs text-accent flex items-center gap-1 hover:underline">
            <Calculator className="w-3 h-3" /> {closing ? (editingClosing ? 'Cancel' : 'Edit') : (editingClosing ? 'Cancel' : 'Close Drawer')}
          </button>
        </div>
        
        {/* System calculated */}
        <div className="flex items-center justify-between text-sm mb-2 bg-accent/10 rounded-lg p-2">
          <span className="text-muted-foreground text-xs">System Cash</span>
          <span className="font-bold text-accent">{formatCurrency(systemCash)}</span>
        </div>

        {editingClosing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Coin</label>
                <Input type="number" value={manualCoin} onChange={(e) => setManualCoin(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cash</label>
                <Input type="number" value={manualCash} onChange={(e) => setManualCash(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To Home</label>
                <Input type="number" value={cashToHome} onChange={(e) => setCashToHome(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs p-2 bg-secondary/50 rounded-lg">
                <span className="text-muted-foreground">Manual Total</span>
                <span className="font-semibold">{formatCurrency(closingManualTotal)}</span>
              </div>
              <div className="flex justify-between text-xs p-2 bg-accent/10 rounded-lg">
                <span className="text-muted-foreground">Shop Kept</span>
                <span className="font-semibold text-accent">{formatCurrency(shopKept)}</span>
              </div>
              <div className={cn(
                "flex justify-between text-xs p-2 rounded-lg items-center",
                difference === 0 ? "bg-success/10" : "bg-warning/10"
              )}>
                <span className="text-muted-foreground flex items-center gap-1">
                  {difference === 0 ? <Check className="w-3 h-3 text-success" /> : <AlertCircle className="w-3 h-3 text-warning" />}
                  Difference
                </span>
                <span className={cn("font-bold", difference === 0 ? "text-success" : "text-warning")}>
                  {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                </span>
              </div>
            </div>
            <Button size="sm" onClick={handleSaveClosing} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Closing'}
            </Button>
          </div>
        ) : closing ? (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Coin</p>
              <p className="font-medium">{formatCurrency(closing.manualCoin)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cash</p>
              <p className="font-medium">{formatCurrency(closing.manualCash)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">To Home</p>
              <p className="font-medium">{formatCurrency(closing.cashToHome)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not closed yet. Click "Close Drawer" to enter manual count.</p>
        )}
      </div>
    </div>
  );
}
