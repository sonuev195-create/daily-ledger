import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { CategoryAccordion, CategoryId } from '@/components/today/CategoryAccordion';
import { DrawerAccordionContent } from '@/components/today/DrawerAccordionContent';
import { FullDayBillContent } from '@/components/today/FullDayBillContent';
import { CategoryTransactionList } from '@/components/today/CategoryTransactionList';
import { CustomerInlineEntry } from '@/components/today/CustomerInlineEntry';
import { PurchaseInlineEntry } from '@/components/today/PurchaseInlineEntry';
import { EmployeeInlineEntry } from '@/components/today/EmployeeInlineEntry';
import { BillDetailsSheet } from '@/components/bills/BillDetailsSheet';
import { MonthView, YearView } from '@/components/today/MonthYearView';
import { useTransactions } from '@/hooks/useTransactions';
import { useDrawer } from '@/hooks/useDrawer';
import { Transaction, TransactionSection, Bill } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function TodayPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [selectedDate, setSelectedDate] = useState(() => {
    if (location.state?.date) return new Date(location.state.date);
    return new Date();
  });
  const [expandedCategory, setExpandedCategory] = useState<CategoryId | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  const { transactions, loading, add, update, remove, getSummary } = useTransactions(selectedDate);
  const { opening, closing, previousClosing, updateOpening, updateClosing } = useDrawer(selectedDate);
  const summary = getSummary();

  useEffect(() => {
    if (location.state?.date) setSelectedDate(new Date(location.state.date));
    if (location.state?.editTransactionId) {
      const txn = transactions.find(t => t.id === location.state.editTransactionId);
      if (txn) {
        setEditingTransaction(txn);
        const categoryMap: Record<string, CategoryId> = { sale: 'customer', purchase: 'purchase', employee: 'employee', expenses: 'expense', home: 'home', exchange: 'exchange' };
        setExpandedCategory(categoryMap[txn.section] || null);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, transactions]);

  const openingCash = opening ? (opening.coin + opening.cash) : ((previousClosing?.manualCoin ?? 0) + (previousClosing?.manualCash ?? 0));
  const currentCash = openingCash + summary.cashIn - summary.cashOut;
  const currentUpi = summary.upiIn - summary.upiOut;

  const handleSave = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingTransaction) {
      await update({ ...editingTransaction, ...transaction });
    } else {
      await add(transaction);
    }
    setEditingTransaction(null);
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    const categoryMap: Record<string, CategoryId> = { sale: 'customer', purchase: 'purchase', employee: 'employee', expenses: 'expense', home: 'home', exchange: 'exchange' };
    setExpandedCategory(categoryMap[transaction.section] || null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this transaction?')) await remove(id);
  };

  const handleAddTransaction = (section: TransactionSection, type: string) => {};

  const handleToggleCategory = (id: CategoryId) => {
    setExpandedCategory(expandedCategory === id ? null : id);
  };

  const goToPreviousDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const goToNextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const handleDayClickFromMonth = (date: Date) => { setSelectedDate(date); setViewMode('day'); };
  const handleMonthClickFromYear = (date: Date) => { setSelectedDate(date); setViewMode('month'); };

  const renderCategoryContent = (categoryId: CategoryId) => {
    if (categoryId === 'drawer') {
      return <DrawerAccordionContent opening={opening} closing={closing} previousClosing={previousClosing} summary={summary} onSaveOpening={updateOpening} onSaveClosing={updateClosing} />;
    }
    if (categoryId === 'customer') {
      return <CustomerInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={handleSave} onEditTransaction={handleEdit} onDeleteTransaction={handleDelete} editingTransaction={editingTransaction?.section === 'sale' ? editingTransaction : null} onCancelEdit={() => setEditingTransaction(null)} />;
    }
    if (categoryId === 'purchase') {
      return <PurchaseInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={handleSave} onEditTransaction={handleEdit} onDeleteTransaction={handleDelete} editingTransaction={editingTransaction?.section === 'purchase' ? editingTransaction : null} onCancelEdit={() => setEditingTransaction(null)} />;
    }
    if (categoryId === 'employee') {
      return <EmployeeInlineEntry transactions={transactions} selectedDate={selectedDate} onSave={handleSave} onEditTransaction={handleEdit} onDeleteTransaction={handleDelete} />;
    }
    return (
      <CategoryTransactionList categoryId={categoryId as any} transactions={transactions}
        onAddTransaction={handleAddTransaction} onEditTransaction={handleEdit} onDeleteTransaction={handleDelete}
        selectedDate={selectedDate} onSave={handleSave} />
    );
  };

  return (
    <AppLayout title="Today">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:py-8">
        {/* View Mode Tabs */}
        <div className="flex bg-secondary rounded-xl p-1 mb-4 gap-1">
          {(['day', 'month', 'year'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {viewMode === 'day' && (
          <>
            {/* Desktop header */}
            <div className="hidden lg:flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-foreground">{isToday ? 'Today' : format(selectedDate, 'EEEE')}</h1>
                <p className="text-muted-foreground">{format(selectedDate, 'MMMM d, yyyy')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={goToPreviousDay} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <button onClick={() => setSelectedDate(new Date())} className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium">Today</button>
                <button onClick={goToNextDay} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"><ChevronRight className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Mobile nav */}
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <button onClick={goToPreviousDay} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => setSelectedDate(new Date())} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary">
                <Calendar className="w-4 h-4" /><span className="text-sm font-medium">{format(selectedDate, 'MMM d')}</span>
              </button>
              <button onClick={goToNextDay} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => (<div key={i} className="h-14 rounded-xl bg-secondary/50 animate-pulse" />))}</div>
            ) : (
              <CategoryAccordion transactions={transactions} summary={summary} expandedCategory={expandedCategory}
                onToggle={handleToggleCategory} renderContent={renderCategoryContent}
                drawerCash={closing ? (closing.manualCoin + closing.manualCash) : currentCash}
                drawerUpi={closing ? closing.systemUpi : currentUpi} />
            )}
          </>
        )}

        {viewMode === 'month' && (
          <MonthView initialMonth={selectedDate} onDayClick={handleDayClickFromMonth} />
        )}

        {viewMode === 'year' && (
          <YearView initialYear={selectedDate.getFullYear()} onMonthClick={handleMonthClickFromYear} />
        )}
      </div>

      <BillDetailsSheet isOpen={!!viewingBill} onClose={() => { setViewingBill(null); setViewingTransaction(null); }}
        bill={viewingBill} transaction={viewingTransaction} />
    </AppLayout>
  );
}
