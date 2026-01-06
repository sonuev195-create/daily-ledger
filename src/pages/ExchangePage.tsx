import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Plus, Wallet, CreditCard, Building2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  { value: 'cash', label: 'Cash', icon: Wallet },
  { value: 'upi', label: 'UPI', icon: CreditCard },
  { value: 'bank', label: 'Bank', icon: Building2 },
];

export default function ExchangePage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [givenMode, setGivenMode] = useState('cash');
  const [takenMode, setTakenMode] = useState('upi');
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

    if (givenMode === takenMode) {
      toast.error('Given and taken modes must be different');
      return;
    }

    try {
      const { error } = await supabase
        .from('exchanges')
        .insert({
          from_mode: givenMode,
          to_mode: takenMode,
          amount: amountNum,
          reference: reference || null,
        });
      
      if (error) throw error;
      
      toast.success('Exchange recorded');
      setIsAddOpen(false);
      setAmount('');
      setReference('');
      setGivenMode('cash');
      setTakenMode('upi');
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

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'cash': return Wallet;
      case 'upi': return CreditCard;
      case 'bank': return Building2;
      default: return Wallet;
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'cash': return 'bg-success/10 text-success';
      case 'upi': return 'bg-info/10 text-info';
      case 'bank': return 'bg-primary/10 text-primary';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

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

        {/* Info Card */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-foreground">How Exchange Works</p>
              <p className="text-sm text-muted-foreground">
                Customer gives money in one mode (e.g., UPI) and you return in another mode (e.g., Cash).
                The amounts are always equal.
              </p>
            </div>
          </div>
        </div>

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
              const FromIcon = getModeIcon(exchange.from_mode);
              const ToIcon = getModeIcon(exchange.to_mode);
              
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
                      {/* Given By Customer */}
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Customer Gave</p>
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", getModeColor(exchange.from_mode))}>
                          <FromIcon className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium mt-1 capitalize">{exchange.from_mode}</p>
                      </div>
                      
                      <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
                      
                      {/* Given To Customer */}
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">You Gave</p>
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", getModeColor(exchange.to_mode))}>
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
          
          <div className="space-y-4">
            {/* Customer Gives */}
            <div>
              <label className="text-sm font-medium">Customer Gives (Mode)</label>
              <Select value={givenMode} onValueChange={setGivenMode}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modeOptions.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <div className="flex items-center gap-2">
                        <mode.icon className="w-4 h-4" />
                        {mode.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* You Give */}
            <div>
              <label className="text-sm font-medium">You Give (Mode)</label>
              <Select value={takenMode} onValueChange={setTakenMode}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modeOptions.filter(m => m.value !== givenMode).map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <div className="flex items-center gap-2">
                        <mode.icon className="w-4 h-4" />
                        {mode.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div>
              <label className="text-sm font-medium">Amount</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="mt-1 text-2xl font-bold h-14"
              />
            </div>

            {/* Reference */}
            <div>
              <label className="text-sm font-medium">Reference (Optional)</label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Customer name or note"
                className="mt-1"
              />
            </div>

            <Button onClick={handleSaveExchange} className="w-full">
              Record Exchange
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
