import { useState, useEffect } from 'react';
import { X, Calculator, Wallet, CreditCard, Building2, Check, AlertCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DailySummary, DrawerOpening, DrawerClosing } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DrawerClosingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  opening: DrawerOpening | null;
  closing: DrawerClosing | null;
  summary: DailySummary;
  onSave: (closing: Partial<DrawerClosing>) => Promise<DrawerClosing>;
}

export function DrawerClosingSheet({ isOpen, onClose, opening, closing, summary, onSave }: DrawerClosingSheetProps) {
  // Calculate system values
  const openingCash = opening ? opening.coin + opening.cash + opening.homeAdvance : 0;
  const systemCash = openingCash + summary.cashIn - summary.cashOut;
  const systemUpi = (opening?.upiOpening || 0) + summary.upiIn - summary.upiOut;
  const systemBank = opening?.bankOpening || 0;
  
  // Manual entry values
  const [manualCoin, setManualCoin] = useState(closing?.manualCoin || 0);
  const [manualCash, setManualCash] = useState(closing?.manualCash || 0);
  const [cashToHome, setCashToHome] = useState(closing?.cashToHome || 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (closing) {
      setManualCoin(closing.manualCoin);
      setManualCash(closing.manualCash);
      setCashToHome(closing.cashToHome);
    } else {
      setManualCoin(0);
      setManualCash(0);
      setCashToHome(0);
    }
  }, [closing, isOpen]);

  // Calculations
  const manualTotal = manualCoin + manualCash + cashToHome;
  const shopKept = manualCoin + manualCash; // What stays in shop for next day
  const difference = manualTotal - systemCash;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        systemCash,
        manualCoin,
        manualCash,
        cashToHome,
        difference,
        systemUpi,
        systemBank,
      });
      toast.success('Drawer closing saved');
      onClose();
    } catch (error) {
      console.error('Failed to save closing:', error);
      toast.error('Failed to save closing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Drawer Closing
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-150px)]">
          {/* System Calculated Section */}
          <div className="bg-secondary/30 rounded-xl p-4">
            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-accent" />
              System Calculated
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-success/10 rounded-lg p-3 text-center">
                <Wallet className="w-5 h-5 mx-auto text-success mb-1" />
                <p className="text-xs text-muted-foreground">Cash</p>
                <p className="text-lg font-bold text-success">{formatCurrency(systemCash)}</p>
              </div>
              <div className="bg-info/10 rounded-lg p-3 text-center">
                <CreditCard className="w-5 h-5 mx-auto text-info mb-1" />
                <p className="text-xs text-muted-foreground">UPI</p>
                <p className="text-lg font-bold text-info">{formatCurrency(systemUpi)}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <Building2 className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Bank</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(systemBank)}</p>
              </div>
            </div>
          </div>

          {/* Manual Entry Section */}
          <div className="bg-secondary/30 rounded-xl p-4">
            <h3 className="text-sm font-medium text-foreground mb-3">Manual Cash Entry</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Coin (in drawer)</label>
                <Input
                  type="number"
                  value={manualCoin || ''}
                  onChange={(e) => setManualCoin(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cash (in drawer)</label>
                <Input
                  type="number"
                  value={manualCash || ''}
                  onChange={(e) => setManualCash(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cash to Home</label>
                <Input
                  type="number"
                  value={cashToHome || ''}
                  onChange={(e) => setCashToHome(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Manual Total (Coin + Cash + Home)</span>
              <span className="font-bold text-foreground">{formatCurrency(manualTotal)}</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-accent/10 rounded-lg">
              <span className="text-sm text-muted-foreground">Shop Kept (Coin + Cash)</span>
              <span className="font-bold text-accent">{formatCurrency(shopKept)}</span>
            </div>
            
            <div className={cn(
              "flex justify-between items-center p-3 rounded-lg",
              difference === 0 ? "bg-success/10" : difference > 0 ? "bg-warning/10" : "bg-destructive/10"
            )}>
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                {difference === 0 ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                Difference (Manual - System)
              </span>
              <span className={cn(
                "font-bold",
                difference === 0 ? "text-success" : difference > 0 ? "text-warning" : "text-destructive"
              )}>
                {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
              </span>
            </div>
          </div>

          {/* Note about next day */}
          <div className="bg-info/10 border border-info/20 rounded-xl p-3">
            <p className="text-sm text-info">
              <strong>Next Day Opening:</strong> Shop Kept ({formatCurrency(shopKept)}) + Cash from Home
            </p>
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Closing'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
