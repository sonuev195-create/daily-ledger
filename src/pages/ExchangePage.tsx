import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Plus, Wallet, CreditCard, Building2, ArrowRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Exchange {
  id: string;
  date: string;
  from_mode: string;
  to_mode: string;
  amount: number;
  reference: string | null;
  created_at: string;
}

const modeOptions = [
  { value: 'cash', label: 'Cash', icon: Wallet, color: 'bg-success/10 text-success' },
  { value: 'upi', label: 'UPI', icon: CreditCard, color: 'bg-info/10 text-info' },
  { value: 'cheque', label: 'Cheque', icon: Building2, color: 'bg-primary/10 text-primary' },
];

export default function ExchangePage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [customerGivesMode, setCustomerGivesMode] = useState('upi');
  const [youGiveMode, setYouGiveMode] = useState('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    fetchExchanges();
  }, []);

  const fetchExchanges = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('exchanges')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setExchanges(data || []);
    } catch (error) {
      console.error('Error fetching exchanges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExchange = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (customerGivesMode === youGiveMode) {
      toast.error('Customer gives and you give modes must be different');
      return;
    }

    try {
      // Insert into exchanges table
      const { error } = await supabase
        .from('exchanges')
        .insert({
          from_mode: customerGivesMode,
          to_mode: youGiveMode,
          amount: amountNum,
          reference: reference || null,
        });
      
      if (error) throw error;

      // Also create a transaction record for daily tracking
      // The exchange means: customer gives (income in that mode), you give (outgoing in return mode)
      const billNumber = `XC${Date.now().toString().slice(-6)}`;
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          date: new Date().toISOString().split('T')[0],
          section: 'exchange',
          type: 'exchange',
          amount: amountNum,
          payments: [
            { id: crypto.randomUUID(), mode: customerGivesMode, amount: amountNum }
          ],
          give_back: [
            { id: crypto.randomUUID(), mode: youGiveMode, amount: amountNum }
          ],
          bill_number: billNumber,
          reference: reference || `${customerGivesMode} → ${youGiveMode}`,
        });

      if (txError) {
        console.error('Error saving exchange transaction:', txError);
      }
      
      toast.success('Exchange recorded');
      setIsAddOpen(false);
      setAmount('');
      setReference('');
      setCustomerGivesMode('upi');
      setYouGiveMode('cash');
      fetchExchanges();
    } catch (error) {
      console.error('Error saving exchange:', error);
      toast.error('Failed to save exchange');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getModeInfo = (mode: string) => {
    return modeOptions.find(m => m.value === mode) || modeOptions[0];
  };

  // Calculate totals by mode changes
  const modeTotals = exchanges.reduce((acc, ex) => {
    const key = `${ex.from_mode}_to_${ex.to_mode}`;
    acc[key] = (acc[key] || 0) + ex.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout title="Exchange">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Exchange</h1>
            <p className="text-sm text-muted-foreground">Mode-to-mode transfers</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Exchange
          </Button>
        </div>

        {/* How it works */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Give & Take</p>
              <p className="text-sm text-muted-foreground">
                Customer gives money in one mode (e.g., UPI) and you return in another mode (e.g., Cash). 
                This affects your daily cash/UPI balance calculations.
              </p>
            </div>
          </div>
        </div>

        {/* Summary by exchange type */}
        {Object.keys(modeTotals).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {Object.entries(modeTotals).map(([key, total]) => {
              const [from, , to] = key.split('_');
              const fromInfo = getModeInfo(from);
              const toInfo = getModeInfo(to);
              return (
                <div key={key} className="bg-secondary/50 border border-border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <fromInfo.icon className="w-4 h-4 text-muted-foreground" />
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <toInfo.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{from} → {to}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Exchange List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : exchanges.length === 0 ? (
          <div className="text-center py-12">
            <ArrowLeftRight className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No exchanges recorded</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exchanges.map((exchange, index) => {
              const fromInfo = getModeInfo(exchange.from_mode);
              const toInfo = getModeInfo(exchange.to_mode);
              const FromIcon = fromInfo.icon;
              const ToIcon = toInfo.icon;
              
              return (
                <motion.div
                  key={exchange.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="bg-card border border-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Customer Gives */}
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Customer Gave</p>
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", fromInfo.color)}>
                          <FromIcon className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium mt-1 capitalize">{exchange.from_mode}</p>
                      </div>
                      
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                      
                      {/* You Give */}
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">You Gave</p>
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", toInfo.color)}>
                          <ToIcon className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium mt-1 capitalize">{exchange.to_mode}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-xl font-bold text-foreground">{formatCurrency(exchange.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(exchange.created_at), 'dd MMM yyyy')}
                      </p>
                      {exchange.reference && (
                        <p className="text-xs text-accent">{exchange.reference}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Exchange Sheet */}
      <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>New Exchange</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-5">
            {/* Customer Gives */}
            <div>
              <label className="text-sm font-medium mb-2 block">Customer Gives</label>
              <div className="grid grid-cols-3 gap-2">
                {modeOptions.map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = customerGivesMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => {
                        setCustomerGivesMode(mode.value);
                        // Auto-switch the other mode
                        if (youGiveMode === mode.value) {
                          const other = modeOptions.find(m => m.value !== mode.value);
                          if (other) setYouGiveMode(other.value);
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-secondary/30 hover:bg-secondary"
                      )}
                    >
                      <Icon className={cn("w-6 h-6", isSelected ? "text-accent" : "text-muted-foreground")} />
                      <span className={cn("text-sm font-medium", isSelected ? "text-accent" : "text-muted-foreground")}>
                        {mode.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" />
              </div>
            </div>

            {/* You Give */}
            <div>
              <label className="text-sm font-medium mb-2 block">You Give</label>
              <div className="grid grid-cols-3 gap-2">
                {modeOptions.filter(m => m.value !== customerGivesMode).map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = youGiveMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => setYouGiveMode(mode.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-secondary/30 hover:bg-secondary"
                      )}
                    >
                      <Icon className={cn("w-6 h-6", isSelected ? "text-accent" : "text-muted-foreground")} />
                      <span className={cn("text-sm font-medium", isSelected ? "text-accent" : "text-muted-foreground")}>
                        {mode.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-sm font-medium mb-2 block">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="pl-8 text-2xl font-bold h-14"
                />
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="text-sm font-medium mb-2 block">Reference (Optional)</label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Customer name or note"
              />
            </div>

            <Button onClick={handleSaveExchange} className="w-full h-12 text-base">
              Record Exchange
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
