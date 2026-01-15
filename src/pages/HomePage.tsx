import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface HomeTransaction {
  id: string;
  type: string;
  amount: number;
  reference: string | null;
  date: string;
  payments: { mode: string; amount: number }[];
  created_at: string;
}

const HomePage = () => {
  const [transactions, setTransactions] = useState<HomeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  
  const [transactionType, setTransactionType] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('section', 'home')
      .eq('date', today)
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error('Failed to load transactions');
      setLoading(false);
      return;
    }
    
    setTransactions(data?.map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      reference: t.reference,
      date: t.date,
      payments: t.payments as { mode: string; amount: number }[],
      created_at: t.created_at
    })) || []);
    setLoading(false);
  };

  const handleAddTransaction = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amountNum = parseFloat(amount);
    const payments = [{ mode: paymentMode, amount: amountNum }];

    // Generate bill number
    const todayStr = format(new Date(), 'yyyyMMdd');
    const prefix = transactionType === 'in' ? 'HC' : 'HD';
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('section', 'home')
      .eq('type', transactionType)
      .gte('created_at', format(new Date(), 'yyyy-MM-dd'));
    
    const billNumber = `${prefix}${todayStr}${String((count || 0) + 1).padStart(3, '0')}`;

    const { error } = await supabase
      .from('transactions')
      .insert({
        section: 'home',
        type: transactionType,
        amount: amountNum,
        payments,
        reference: reference || null,
        bill_number: billNumber,
        date: today
      });

    if (error) {
      toast.error('Failed to add transaction');
      return;
    }

    toast.success(`${transactionType === 'in' ? 'Credit' : 'Debit'} recorded`);
    setSheetOpen(false);
    setTransactionType('in');
    setAmount('');
    setReference('');
    setPaymentMode('cash');
    fetchTransactions();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Calculate totals by mode
  const calculateTotals = () => {
    const totals = {
      credit: { cash: 0, upi: 0, bank: 0, total: 0 },
      debit: { cash: 0, upi: 0, bank: 0, total: 0 },
      net: { cash: 0, upi: 0, bank: 0, total: 0 }
    };

    transactions.forEach(t => {
      const mode = t.payments[0]?.mode || 'cash';
      if (t.type === 'in') {
        totals.credit[mode as keyof typeof totals.credit] += t.amount;
        totals.credit.total += t.amount;
      } else {
        totals.debit[mode as keyof typeof totals.debit] += t.amount;
        totals.debit.total += t.amount;
      }
    });

    totals.net.cash = totals.credit.cash - totals.debit.cash;
    totals.net.upi = totals.credit.upi - totals.debit.upi;
    totals.net.bank = totals.credit.bank - totals.debit.bank;
    totals.net.total = totals.credit.total - totals.debit.total;

    return totals;
  };

  const totals = calculateTotals();

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Home</h1>
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Transaction
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Credit Card */}
          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
                <span className="font-medium text-emerald-700">Credit (In)</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totals.credit.total)}</p>
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
                <p>Cash: {formatCurrency(totals.credit.cash)}</p>
                <p>UPI: {formatCurrency(totals.credit.upi)}</p>
                <p>Bank: {formatCurrency(totals.credit.bank)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Debit Card */}
          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpCircle className="h-5 w-5 text-destructive" />
                <span className="font-medium text-destructive">Debit (Out)</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totals.debit.total)}</p>
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
                <p>Cash: {formatCurrency(totals.debit.cash)}</p>
                <p>UPI: {formatCurrency(totals.debit.upi)}</p>
                <p>Bank: {formatCurrency(totals.debit.bank)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Net Balance Card */}
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="font-medium">Net Balance</span>
              </div>
              <p className={`text-2xl font-bold ${totals.net.total >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {formatCurrency(totals.net.total)}
              </p>
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
                <p>Cash: {formatCurrency(totals.net.cash)}</p>
                <p>UPI: {formatCurrency(totals.net.upi)}</p>
                <p>Bank: {formatCurrency(totals.net.bank)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transaction List */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Today's Transactions</h2>
          
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No transactions today</div>
          ) : (
            <AnimatePresence>
              {transactions.map((transaction) => (
                <motion.div
                  key={transaction.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {transaction.type === 'in' ? (
                            <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <ArrowUpCircle className="h-5 w-5 text-destructive" />
                          )}
                          <div>
                            <p className="font-medium">
                              {transaction.type === 'in' ? 'Credit' : 'Debit'}
                            </p>
                            {transaction.reference && (
                              <p className="text-sm text-muted-foreground">{transaction.reference}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {transaction.payments[0]?.mode?.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <p className={`text-lg font-bold ${transaction.type === 'in' ? 'text-emerald-600' : 'text-destructive'}`}>
                          {transaction.type === 'in' ? '+' : '-'}{formatCurrency(transaction.amount)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Add Transaction Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Transaction</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <RadioGroup 
                value={transactionType} 
                onValueChange={(v) => setTransactionType(v as 'in' | 'out')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="in" id="credit" />
                  <Label htmlFor="credit" className="text-emerald-600 font-medium">Credit (In)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="out" id="debit" />
                  <Label htmlFor="debit" className="text-destructive font-medium">Debit (Out)</Label>
                </div>
              </RadioGroup>
            </div>
            
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Reference (Optional)</Label>
              <Textarea
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enter reference or note"
              />
            </div>
            
            <Button className="w-full" onClick={handleAddTransaction}>
              Record Transaction
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
};

export default HomePage;
