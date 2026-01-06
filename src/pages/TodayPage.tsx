import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, Plus, Receipt, Banknote, ShoppingCart, Users, Home, ArrowLeftRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DrawerSummary } from '@/components/drawer/DrawerSummary';
import { DrawerOpeningSheet } from '@/components/drawer/DrawerOpeningSheet';
import { DrawerClosingSheet } from '@/components/drawer/DrawerClosingSheet';
import { TransactionCard } from '@/components/transactions/TransactionCard';
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet';
import { BillDetailsSheet } from '@/components/bills/BillDetailsSheet';
import { Fab } from '@/components/ui/fab';
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

  // Update date from navigation state
  useEffect(() => {
    if (location.state?.date) {
      setSelectedDate(new Date(location.state.date));
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

  // Group transactions by section
  const transactionsBySection: Record<TransactionSection, Transaction[]> = {
    sale: [],
    expenses: [],
    purchase: [],
    employee: [],
    home: [],
    exchange: [],
  };

  transactions.forEach(t => {
    if (transactionsBySection[t.section]) {
      transactionsBySection[t.section].push(t);
    }
  });

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

        {/* Sections with Transactions */}
        <div className="space-y-4">
          {SECTIONS.map((section, sectionIndex) => {
            const Icon = sectionIcons[section.id];
            const sectionTransactions = transactionsBySection[section.id];
            const types = TYPE_OPTIONS[section.id];

            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIndex * 0.05 }}
                className="bg-card rounded-2xl border border-border overflow-hidden"
              >
                {/* Section Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                    <h3 className="font-semibold text-foreground">{section.label}</h3>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {sectionTransactions.length}
                    </span>
                  </div>
                </div>

                {/* Add Buttons for Types */}
                <div className="px-4 py-3 border-b border-border/50">
                  <div className="flex flex-wrap gap-2">
                    {types.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => handleAddTransaction(section.id, type.value)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transactions */}
                {sectionTransactions.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {sectionTransactions.map((transaction) => (
                      <TransactionCard
                        key={transaction.id}
                        transaction={transaction}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onViewBill={transaction.billId ? () => handleViewBill(transaction) : undefined}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No {section.label.toLowerCase()} transactions today
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* FAB */}
      <Fab onClick={() => {
        setEditingTransaction(null);
        setSelectedSection(null);
        setSelectedType(null);
        setIsAddOpen(true);
      }} />

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
