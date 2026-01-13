import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, Plus, Receipt, Banknote, ShoppingCart, Users, Home, ArrowLeftRight, Wallet, CreditCard, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DrawerSummary } from '@/components/drawer/DrawerSummary';
import { DrawerOpeningSheet } from '@/components/drawer/DrawerOpeningSheet';
import { DrawerClosingSheet } from '@/components/drawer/DrawerClosingSheet';
import { TransactionCard } from '@/components/transactions/TransactionCard';
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet';
import { BillDetailsSheet } from '@/components/bills/BillDetailsSheet';
import { useTransactions } from '@/hooks/useTransactions';
import { useDrawer } from '@/hooks/useDrawer';
import { Transaction, TransactionSection, SECTIONS, TYPE_OPTIONS, Bill } from '@/types';
import { getBillByTransactionId } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

const sectionIcons: Record<TransactionSection, any> = {
  sale: Receipt,
  expenses: Banknote,
  purchase: ShoppingCart,
  employee: Users,
  home: Home,
  exchange: ArrowLeftRight,
};

export default function TodayPage() {
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(() => {
    if (location.state?.date) {
      return new Date(location.state.date);
    }
    return new Date();
  });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDrawerEditOpen, setIsDrawerEditOpen] = useState(false);
  const [isDrawerClosingOpen, setIsDrawerClosingOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedSection, setSelectedSection] = useState<TransactionSection | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);
  
  const { transactions, loading, add, update, remove, getSummary } = useTransactions(selectedDate);
  const { opening, closing, updateOpening, updateClosing } = useDrawer(selectedDate);
  
  const summary = getSummary();

  // Update date from navigation state and handle transaction opening
  useEffect(() => {
    if (location.state?.date) {
      setSelectedDate(new Date(location.state.date));
    }
    // Handle opening transaction sheet from other pages
    if (location.state?.openTransaction) {
      setSelectedSection(location.state.section || null);
      setSelectedType(location.state.type || null);
      setIsAddOpen(true);
      // Clear the state to prevent re-opening on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSave = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingTransaction) {
      await update({ ...editingTransaction, ...transaction });
    } else {
      await add(transaction);
    }
    setEditingTransaction(null);
    setSelectedSection(null);
    setSelectedType(null);
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsAddOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await remove(id);
    }
  };

  const handleViewBill = async (transaction: Transaction) => {
    if (transaction.billId) {
      const bill = await getBillByTransactionId(transaction.id);
      if (bill) {
        setViewingBill(bill);
        setViewingTransaction(transaction);
      }
    }
  };

  const handleAddTransaction = (section: TransactionSection, type: string) => {
    setSelectedSection(section);
    setSelectedType(type);
    setEditingTransaction(null);
    setIsAddOpen(true);
  };

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  // Sort all transactions by creation time
  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Calculate summary totals for display
  const formatCurrencyCompact = (amount: number) => {
    if (amount === 0) return '-';
    if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}k`;
    }
    return `₹${amount}`;
  };

  // Calculate totals by payment mode
  const paymentTotals = transactions.reduce((acc, t) => {
    if (t.section === 'sale' && (t.type === 'sale' || t.type === 'balance_paid' || t.type === 'customer_advance')) {
      t.payments.forEach(p => {
        if (p.mode === 'cash') acc.cashIn += p.amount;
        if (p.mode === 'upi') acc.upiIn += p.amount;
      });
    }
    if (t.section === 'expenses' || (t.section === 'purchase' && t.type !== 'purchase_return')) {
      t.payments.forEach(p => {
        if (p.mode === 'cash') acc.cashOut += p.amount;
        if (p.mode === 'upi') acc.upiOut += p.amount;
      });
    }
    return acc;
  }, { cashIn: 0, upiIn: 0, cashOut: 0, upiOut: 0 });

  return (
    <AppLayout title="Today">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:py-8">
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isToday ? 'Today' : format(selectedDate, 'EEEE')}
            </h1>
            <p className="text-muted-foreground">{format(selectedDate, 'MMMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousDay}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium"
            >
              Today
            </button>
            <button
              onClick={goToNextDay}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Date Navigator */}
        <div className="flex items-center justify-between mb-4 lg:hidden">
          <button
            onClick={goToPreviousDay}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary"
          >
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">{format(selectedDate, 'MMM d')}</span>
          </button>
          <button
            onClick={goToNextDay}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <DrawerSummary
            date={selectedDate}
            summary={summary}
            opening={opening}
            closing={closing}
            onEditOpening={() => setIsDrawerEditOpen(true)}
            onEditClosing={() => setIsDrawerClosingOpen(true)}
          />
        </motion.div>

        {/* Main Layout: Transactions List + Add Buttons */}
        <div className="flex gap-4">
          {/* Transactions List (Similar to AllDatesPage style) */}
          <div className="flex-1 space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-secondary/50 animate-pulse" />
              ))
            ) : sortedTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No transactions today</p>
                <p className="text-sm text-muted-foreground mt-1">Use the buttons on the right to add transactions</p>
              </div>
            ) : (
              sortedTransactions.map((transaction, index) => {
                const Icon = sectionIcons[transaction.section];
                const totalPayment = transaction.payments.reduce((s, p) => s + p.amount, 0);
                const cashAmount = transaction.payments.filter(p => p.mode === 'cash').reduce((s, p) => s + p.amount, 0);
                const upiAmount = transaction.payments.filter(p => p.mode === 'upi').reduce((s, p) => s + p.amount, 0);
                
                return (
                  <motion.div
                    key={transaction.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => handleEdit(transaction)}
                    className="transaction-card p-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        transaction.section === 'sale' ? "bg-success/10 text-success" :
                        transaction.section === 'expenses' ? "bg-destructive/10 text-destructive" :
                        transaction.section === 'purchase' ? "bg-warning/10 text-warning" :
                        transaction.section === 'employee' ? "bg-info/10 text-info" :
                        transaction.section === 'home' ? "bg-primary/10 text-primary" :
                        "bg-accent/10 text-accent"
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">
                            {transaction.customerName || transaction.supplierName || transaction.type.replace(/_/g, ' ')}
                          </span>
                          {transaction.billNumber && (
                            <span className="text-xs text-muted-foreground">#{transaction.billNumber}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{transaction.section}</span>
                          <span>•</span>
                          <span>{format(new Date(transaction.createdAt), 'HH:mm')}</span>
                        </div>
                      </div>

                      {/* Payment Modes Display */}
                      <div className="flex items-center gap-2 shrink-0">
                        {cashAmount > 0 && (
                          <div className="flex items-center gap-1 text-xs">
                            <Wallet className="w-3 h-3 text-success" />
                            <span className="text-success">{formatCurrencyCompact(cashAmount)}</span>
                          </div>
                        )}
                        {upiAmount > 0 && (
                          <div className="flex items-center gap-1 text-xs">
                            <CreditCard className="w-3 h-3 text-info" />
                            <span className="text-info">{formatCurrencyCompact(upiAmount)}</span>
                          </div>
                        )}
                        {transaction.due && transaction.due > 0 && (
                          <div className="flex items-center gap-1 text-xs">
                            <AlertTriangle className="w-3 h-3 text-warning" />
                            <span className="text-warning">Due</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Vertical Add Buttons (Right Side) */}
          <div className="w-14 shrink-0 space-y-2">
            {SECTIONS.map((section) => {
              const Icon = sectionIcons[section.id];
              return (
                <button
                  key={section.id}
                  onClick={() => handleAddTransaction(section.id, TYPE_OPTIONS[section.id][0].value)}
                  className={cn(
                    "w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all",
                    "bg-secondary/50 hover:bg-secondary border border-border hover:border-accent/50",
                    "text-muted-foreground hover:text-accent"
                  )}
                  title={`Add ${section.label}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium leading-none">{section.label.slice(0, 4)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add/Edit Sheet */}
      <AddTransactionSheet
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setEditingTransaction(null);
          setSelectedSection(null);
          setSelectedType(null);
        }}
        onSave={handleSave}
        editTransaction={editingTransaction}
        selectedDate={selectedDate}
        initialSection={selectedSection}
        initialType={selectedType}
      />

      {/* Bill Details Sheet */}
      <BillDetailsSheet
        isOpen={!!viewingBill}
        onClose={() => {
          setViewingBill(null);
          setViewingTransaction(null);
        }}
        bill={viewingBill}
        transaction={viewingTransaction}
      />

      {/* Drawer Opening Edit Sheet */}
      <DrawerOpeningSheet
        isOpen={isDrawerEditOpen}
        onClose={() => setIsDrawerEditOpen(false)}
        opening={opening}
        onSave={updateOpening}
      />

      {/* Drawer Closing Sheet */}
      <DrawerClosingSheet
        isOpen={isDrawerClosingOpen}
        onClose={() => setIsDrawerClosingOpen(false)}
        opening={opening}
        closing={closing}
        summary={summary}
        onSave={updateClosing}
      />
    </AppLayout>
  );
}
