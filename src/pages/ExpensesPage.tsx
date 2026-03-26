import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Edit2, Trash2, Folder, Receipt, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ItemSearchSelect } from '@/components/items/ItemSearchSelect';
import { useItems, deductFromBatch, planBatchAllocations } from '@/hooks/useSupabaseData';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Expense {
  id: string;
  amount: number;
  reference: string | null;
  date: string;
  payments: { mode: string; amount: number }[];
  expense_category_id: string | null;
  created_at: string;
}

const ExpensesPage = () => {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses');
  
  // Category sheet state
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  
  // Expense sheet state
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDetails, setExpenseDetails] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [isItemTaken, setIsItemTaken] = useState(false);
  const [expenseItems, setExpenseItems] = useState<{ itemId: string; itemName: string; qty: number; rate: number }[]>([]);
  const { items: allItems } = useItems();

  useEffect(() => {
    fetchCategories();
    fetchExpenses();
  }, []);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .order('name');
    
    if (error) {
      toast.error('Failed to load categories');
      return;
    }
    setCategories(data || []);
  };

  const fetchExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('section', 'expenses')
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error('Failed to load expenses');
      setLoading(false);
      return;
    }
    
    setExpenses(data?.map(t => ({
      id: t.id,
      amount: t.amount,
      reference: t.reference,
      date: t.date,
      payments: t.payments as { mode: string; amount: number }[],
      expense_category_id: t.expense_category_id,
      created_at: t.created_at
    })) || []);
    setLoading(false);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.error('Category name is required');
      return;
    }

    if (editingCategory) {
      const { error } = await supabase
        .from('expense_categories')
        .update({ name: categoryName, description: categoryDescription || null })
        .eq('id', editingCategory.id);
      
      if (error) {
        toast.error('Failed to update category');
        return;
      }
      toast.success('Category updated');
    } else {
      const { error } = await supabase
        .from('expense_categories')
        .insert({ name: categoryName, description: categoryDescription || null });
      
      if (error) {
        toast.error('Failed to add category');
        return;
      }
      toast.success('Category added');
    }

    setCategorySheetOpen(false);
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDescription('');
    fetchCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase
      .from('expense_categories')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete category');
      return;
    }
    toast.success('Category deleted');
    fetchCategories();
  };

  const handleEditCategory = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDescription(category.description || '');
    setCategorySheetOpen(true);
  };

  const handleAddExpense = async () => {
    if (!selectedCategoryId) {
      toast.error('Please select a category');
      return;
    }

    let amount: number;
    let payments: { mode: string; amount: number }[];

    if (isItemTaken && expenseItems.length > 0) {
      // Item taken mode: amount = total purchase cost of items
      amount = expenseItems.reduce((s, item) => s + (item.qty * item.rate), 0);
      payments = []; // No payment mode needed for item taken
      
      // Deduct inventory
      for (const item of expenseItems) {
        if (item.itemId) {
          const { allocations } = await planBatchAllocations(item.itemId, item.qty, 0);
          for (const alloc of allocations) {
            await deductFromBatch(alloc.batchId, alloc.primaryQty, alloc.secondaryQty);
          }
        }
      }
    } else {
      if (!expenseAmount || parseFloat(expenseAmount) <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }
      amount = parseFloat(expenseAmount);
      payments = [{ mode: paymentMode, amount }];
    }

    // Generate bill number
    const today = format(new Date(), 'yyyyMMdd');
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('section', 'expenses')
      .gte('created_at', format(new Date(), 'yyyy-MM-dd'));
    
    const billNumber = `EX${today}${String((count || 0) + 1).padStart(3, '0')}`;

    const { error } = await supabase
      .from('transactions')
      .insert({
        section: 'expenses',
        type: isItemTaken ? 'item_taken' : 'out',
        amount,
        payments,
        expense_category_id: selectedCategoryId,
        reference: isItemTaken 
          ? `Items: ${expenseItems.map(i => `${i.itemName}×${i.qty}`).join(', ')}`
          : (expenseDetails || null),
        bill_number: billNumber,
        date: format(new Date(), 'yyyy-MM-dd')
      });

    if (error) {
      toast.error('Failed to add expense');
      return;
    }

    toast.success('Expense recorded');
    setExpenseSheetOpen(false);
    setSelectedCategoryId('');
    setExpenseAmount('');
    setExpenseDetails('');
    setPaymentMode('cash');
    setIsItemTaken(false);
    setExpenseItems([]);
    fetchExpenses();
  };

  const addExpenseItem = (itemId: string) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    // Get avg purchase rate from batches
    supabase.from('batches').select('purchase_rate, primary_quantity').eq('item_id', itemId).then(({ data }) => {
      const totalQty = (data || []).reduce((s, b) => s + Number(b.primary_quantity), 0);
      const totalVal = (data || []).reduce((s, b) => s + Number(b.purchase_rate) * Number(b.primary_quantity), 0);
      const avgRate = totalQty > 0 ? totalVal / totalQty : 0;
      setExpenseItems(prev => [...prev, { itemId, itemName: item.name, qty: 1, rate: Math.round(avgRate) }]);
    });
  };

  const removeExpenseItem = (idx: number) => setExpenseItems(prev => prev.filter((_, i) => i !== idx));
  const updateExpenseItem = (idx: number, field: 'qty' | 'rate', value: number) => {
    setExpenseItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const itemTakenTotal = expenseItems.reduce((s, i) => s + (i.qty * i.rate), 0);

    if (!categoryId) return 'Uncategorized';
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Expenses</h1>
          <Button onClick={() => setExpenseSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
              </div>
              <Receipt className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="space-y-3 mt-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No expenses recorded</div>
            ) : (
              <AnimatePresence>
                {expenses.map((expense) => (
                  <motion.div
                    key={expense.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{getCategoryName(expense.expense_category_id)}</p>
                            {expense.reference && (
                              <p className="text-sm text-muted-foreground">{expense.reference}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(expense.date), 'dd MMM yyyy')} • {expense.payments[0]?.mode?.toUpperCase()}
                            </p>
                          </div>
                          <p className="text-lg font-bold text-destructive">{formatCurrency(expense.amount)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-3 mt-4">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setEditingCategory(null);
                setCategoryName('');
                setCategoryDescription('');
                setCategorySheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>

            <AnimatePresence>
              {categories.map((category) => (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Folder className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{category.name}</p>
                            {category.description && (
                              <p className="text-sm text-muted-foreground">{category.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditCategory(category)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteCategory(category.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </div>

      {/* Category Sheet */}
      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Enter category name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Enter description"
              />
            </div>
            <Button className="w-full" onClick={handleSaveCategory}>
              {editingCategory ? 'Update' : 'Add'} Category
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Expense Sheet */}
      <Sheet open={expenseSheetOpen} onOpenChange={setExpenseSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Expense</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item Taken Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsItemTaken(!isItemTaken)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                  isItemTaken ? "border-accent bg-accent/10 text-accent" : "border-border bg-secondary/30 text-muted-foreground"
                )}
              >
                <Package className="w-4 h-4" />
                Item Taken
              </button>
              {isItemTaken && <span className="text-xs text-muted-foreground">Amount = purchase cost of items</span>}
            </div>

            {isItemTaken ? (
              <div className="space-y-2">
                <Label>Add Items</Label>
                <ItemSearchSelect 
                  items={allItems.map(i => ({ id: i.id, name: i.name, sellingPrice: i.sellingPrice }))}
                  value={null}
                  onChange={(itemId) => { if (itemId) addExpenseItem(itemId); }}
                />
                {expenseItems.length > 0 && (
                  <div className="space-y-1 border border-border rounded-lg p-2">
                    {expenseItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate font-medium">{item.itemName}</span>
                        <Input type="number" value={item.qty} onChange={e => updateExpenseItem(idx, 'qty', parseInt(e.target.value) || 0)}
                          className="h-7 w-16 text-xs" />
                        <span className="text-muted-foreground">×</span>
                        <Input type="number" value={item.rate} onChange={e => updateExpenseItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                          className="h-7 w-20 text-xs" />
                        <span className="font-medium w-16 text-right">{(item.qty * item.rate).toLocaleString('en-IN')}</span>
                        <button onClick={() => removeExpenseItem(idx)} className="text-destructive hover:bg-destructive/10 rounded p-0.5">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1 border-t border-border/50 text-sm font-semibold">
                      <span>Total</span>
                      <span>₹{itemTakenTotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="Enter amount" />
                </div>
                <div className="space-y-2">
                  <Label>Details (Optional)</Label>
                  <Textarea value={expenseDetails} onChange={(e) => setExpenseDetails(e.target.value)} placeholder="Enter details" />
                </div>
                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Button className="w-full" onClick={handleAddExpense} disabled={isItemTaken ? expenseItems.length === 0 : false}>
              {isItemTaken ? `Record Item Expense (₹${itemTakenTotal.toLocaleString('en-IN')})` : 'Record Expense'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
};

export default ExpensesPage;
