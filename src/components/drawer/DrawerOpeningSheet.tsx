import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DrawerOpening } from '@/types';

interface DrawerOpeningSheetProps {
  isOpen: boolean;
  onClose: () => void;
  opening: DrawerOpening | null;
  onSave: (data: Partial<DrawerOpening>) => Promise<DrawerOpening>;
}

export function DrawerOpeningSheet({ isOpen, onClose, opening, onSave }: DrawerOpeningSheetProps) {
  const [coin, setCoin] = useState('');
  const [cash, setCash] = useState('');
  const [homeAdvance, setHomeAdvance] = useState('');
  const [upiOpening, setUpiOpening] = useState('');
  const [bankOpening, setBankOpening] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opening) {
      setCoin(opening.coin?.toString() || '0');
      setCash(opening.cash?.toString() || '0');
      setHomeAdvance(opening.homeAdvance?.toString() || '0');
      setUpiOpening(opening.upiOpening?.toString() || '0');
      setBankOpening(opening.bankOpening?.toString() || '0');
    } else {
      setCoin('0');
      setCash('0');
      setHomeAdvance('0');
      setUpiOpening('0');
      setBankOpening('0');
    }
  }, [opening, isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        coin: parseFloat(coin) || 0,
        cash: parseFloat(cash) || 0,
        homeAdvance: parseFloat(homeAdvance) || 0,
        upiOpening: parseFloat(upiOpening) || 0,
        bankOpening: parseFloat(bankOpening) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const totalCash = (parseFloat(coin) || 0) + (parseFloat(cash) || 0) + (parseFloat(homeAdvance) || 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">Edit Opening Drawer</SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Coin</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <input
                    type="number"
                    value={coin}
                    onChange={(e) => setCoin(e.target.value)}
                    placeholder="0"
                    className="input-field pl-7"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Cash</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <input
                    type="number"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                    placeholder="0"
                    className="input-field pl-7"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Home Adv.</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <input
                    type="number"
                    value={homeAdvance}
                    onChange={(e) => setHomeAdvance(e.target.value)}
                    placeholder="0"
                    className="input-field pl-7"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">UPI Opening</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <input
                    type="number"
                    value={upiOpening}
                    onChange={(e) => setUpiOpening(e.target.value)}
                    placeholder="0"
                    className="input-field pl-7"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Bank Opening</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <input
                    type="number"
                    value={bankOpening}
                    onChange={(e) => setBankOpening(e.target.value)}
                    placeholder="0"
                    className="input-field pl-7"
                  />
                </div>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Opening Cash</span>
                <span className="font-semibold text-foreground">{formatCurrency(totalCash)}</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-accent w-full py-3 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
