import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Phone, Plus, Edit2, Trash2, Wallet, Settings, Calendar, TrendingUp, Banknote } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';


interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  salary: number;
  advance_balance: number;
}

interface SalaryCategory {
  id: string;
  name: string;
  description: string | null;
}

interface EmployeeTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  created_at: string;
  salary_category_id: string | null;
  payments: any;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeTransactions, setEmployeeTransactions] = useState<EmployeeTransaction[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [categories, setCategories] = useState<SalaryCategory[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formSalary, setFormSalary] = useState('');
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [editingCategory, setEditingCategory] = useState<SalaryCategory | null>(null);

  useEffect(() => {
    fetchEmployees();
    fetchCategories();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('salary_categories')
      .select('*')
      .order('name');
    setCategories(data || []);
  };

  const fetchEmployeeTransactions = async (employeeId: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, created_at, salary_category_id, payments')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });
    
    setEmployeeTransactions(data || []);
  };

  const handleSelectEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    await fetchEmployeeTransactions(employee.id);
  };

  const handleSaveEmployee = async () => {
    if (!formName.trim()) {
      toast.error('Employee name is required');
      return;
    }

    try {
      if (editEmployee) {
        const { error } = await supabase
          .from('employees')
          .update({ 
            name: formName, 
            phone: formPhone || null, 
            role: formRole || null,
            salary: parseFloat(formSalary) || 0
          })
          .eq('id', editEmployee.id);
        
        if (error) throw error;
        toast.success('Employee updated');
      } else {
        const { error } = await supabase
          .from('employees')
          .insert({ 
            name: formName, 
            phone: formPhone || null, 
            role: formRole || null,
            salary: parseFloat(formSalary) || 0
          });
        
        if (error) throw error;
        toast.success('Employee added');
      }
      
      closeForm();
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('Failed to save employee');
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditEmployee(employee);
    setFormName(employee.name);
    setFormPhone(employee.phone || '');
    setFormRole(employee.role || '');
    setFormSalary(employee.salary.toString());
    setIsAddOpen(true);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Delete this employee?')) return;
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Deleted'); fetchEmployees(); setSelectedEmployee(null); }
  };

  const closeForm = () => {
    setIsAddOpen(false);
    setEditEmployee(null);
    setFormName('');
    setFormPhone('');
    setFormRole('');
    setFormSalary('');
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('salary_categories')
          .update({ name: newCategoryName, description: newCategoryDesc || null })
          .eq('id', editingCategory.id);
        
        if (error) throw error;
        toast.success('Category updated');
      } else {
        const { error } = await supabase
          .from('salary_categories')
          .insert({ name: newCategoryName, description: newCategoryDesc || null });
        
        if (error) throw error;
        toast.success('Category added');
      }
      
      setNewCategoryName('');
      setNewCategoryDesc('');
      setEditingCategory(null);
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    const { error } = await supabase.from('salary_categories').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Category deleted');
      fetchCategories();
    }
  };

  const getCategoryName = (id: string | null) => {
    if (!id) return 'Uncategorized';
    return categories.find(c => c.id === id)?.name || 'Unknown';
  };

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.phone?.includes(searchQuery) ||
    e.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalAdvance = employees.reduce((sum, e) => sum + e.advance_balance, 0);
  const totalSalary = employees.reduce((sum, e) => sum + e.salary, 0);

  // Calculate category-wise totals for selected employee
  const categoryWiseTotals = employeeTransactions.reduce((acc, tx) => {
    const catId = tx.salary_category_id || 'uncategorized';
    acc[catId] = (acc[catId] || 0) + tx.amount;
    return acc;
  }, {} as Record<string, number>);

  // Calculate month-wise totals
  const monthWiseTotals = employeeTransactions.reduce((acc, tx) => {
    const month = format(new Date(tx.date), 'yyyy-MM');
    acc[month] = (acc[month] || 0) + tx.amount;
    return acc;
  }, {} as Record<string, number>);

  // Filter transactions by selected month
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const monthTransactions = employeeTransactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= monthStart && txDate <= monthEnd;
  });
  const monthTotal = monthTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <AppLayout title="Employees">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Employees</h1>
            <p className="text-sm text-muted-foreground">{employees.length} employees</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsCategoryOpen(true)} className="gap-2">
              <Settings className="w-4 h-4" />
              Categories
            </Button>
            <Button onClick={() => setIsAddOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add
            </Button>
            <Button 
              variant="outline"
              onClick={() => setIsPaymentOpen(true)}
              className="gap-2"
            >
              <Banknote className="w-4 h-4" />
              Pay
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className={cn("border rounded-xl p-4", totalAdvance > 0 ? "bg-warning/10 border-warning/20" : "bg-secondary/50 border-border")}>
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", totalAdvance > 0 ? "bg-warning/20" : "bg-secondary")}>
                <Wallet className={cn("w-5 h-5", totalAdvance > 0 ? "text-warning" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Advance</p>
                <p className={cn("text-xl font-bold", totalAdvance > 0 ? "text-warning" : "text-muted-foreground")}>
                  {formatCurrency(totalAdvance)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-info/10 border border-info/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-info/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Salary</p>
                <p className="text-xl font-bold text-info">{formatCurrency(totalSalary)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or role..."
            className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Employee List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No employees found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEmployees.map((employee, index) => (
              <motion.div
                key={employee.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => handleSelectEmployee(employee)}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{employee.name}</h3>
                      {employee.role && (
                        <span className="text-xs px-2 py-0.5 bg-secondary rounded-full text-muted-foreground">
                          {employee.role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {employee.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {employee.phone}
                        </span>
                      )}
                      {employee.salary > 0 && (
                        <span>Salary: {formatCurrency(employee.salary)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("text-lg font-bold", employee.advance_balance > 0 ? "text-warning" : "text-muted-foreground")}>
                        {formatCurrency(employee.advance_balance)}
                      </p>
                      <p className="text-xs text-muted-foreground">Advance</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditEmployee(employee)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteEmployee(employee.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Employee Detail Sheet */}
      <Sheet open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{selectedEmployee?.name}</SheetTitle>
          </SheetHeader>
          
          {selectedEmployee && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              {/* Balance Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className={cn("rounded-xl p-3", selectedEmployee.advance_balance > 0 ? "bg-warning/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Advance</p>
                  <p className={cn("text-lg font-bold", selectedEmployee.advance_balance > 0 ? "text-warning" : "text-muted-foreground")}>
                    {formatCurrency(selectedEmployee.advance_balance)}
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">Salary</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(selectedEmployee.salary)}</p>
                </div>
                <div className="bg-info/10 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-bold text-info">
                    {formatCurrency(employeeTransactions.reduce((s, t) => s + t.amount, 0))}
                  </p>
                </div>
              </div>

              {/* Category-wise Totals */}
              {Object.keys(categoryWiseTotals).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Category-wise Summary</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(categoryWiseTotals).map(([catId, total]) => (
                      <div key={catId} className="bg-secondary/30 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{getCategoryName(catId === 'uncategorized' ? null : catId)}</p>
                        <p className="font-semibold text-foreground">{formatCurrency(total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Month Selector */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{format(selectedMonth, 'MMMM yyyy')}</span>
                <span className="text-sm text-muted-foreground">- {formatCurrency(monthTotal)}</span>
              </div>

              {/* Recent Transactions */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Recent Transactions</h4>
                {employeeTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions found</p>
                ) : (
                  <div className="space-y-2">
                    {employeeTransactions.slice(0, 20).map((tx) => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.type.replace(/_/g, ' ')} • {format(new Date(tx.date), 'MMM d')}
                          </p>
                          {tx.salary_category_id && (
                            <p className="text-xs text-accent">{getCategoryName(tx.salary_category_id)}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {tx.payments && Array.isArray(tx.payments) && tx.payments.map((p: any, i: number) => (
                            <span key={i} className="capitalize">{p.mode}: ₹{p.amount}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Employee Sheet */}
      <Sheet open={isAddOpen} onOpenChange={(open) => !open && closeForm()}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{editEmployee ? 'Edit Employee' : 'Add Employee'}</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Employee name" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone number" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input value={formRole} onChange={(e) => setFormRole(e.target.value)} placeholder="e.g. Manager, Worker" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Monthly Salary</label>
              <Input value={formSalary} onChange={(e) => setFormSalary(e.target.value)} placeholder="0" type="number" className="mt-1" />
            </div>
            <Button onClick={handleSaveEmployee} className="w-full">
              {editEmployee ? 'Update Employee' : 'Add Employee'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Salary Categories Sheet */}
      <Sheet open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Wage Categories</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4 overflow-y-auto max-h-[calc(80vh-150px)]">
            {/* Add/Edit Category */}
            <div className="space-y-2 p-3 bg-secondary/30 rounded-xl">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={editingCategory ? "Edit category name" : "New category name (e.g., Daily Salary, Rate Work)"}
              />
              <Input
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                placeholder="Description (optional)"
              />
              <div className="flex gap-2">
                <Button onClick={handleSaveCategory} className="flex-1">
                  {editingCategory ? 'Update' : 'Add Category'}
                </Button>
                {editingCategory && (
                  <Button variant="outline" onClick={() => { setEditingCategory(null); setNewCategoryName(''); setNewCategoryDesc(''); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Default Categories Info */}
            <p className="text-xs text-muted-foreground px-1">
              Common categories: Daily Salary, Previous Balance, Rate Work, Allowance, Bonus, Advance Deduction
            </p>

            {/* Category List */}
            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet. Add one above.</p>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{category.name}</p>
                      {category.description && (
                        <p className="text-xs text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingCategory(category);
                          setNewCategoryName(category.name);
                          setNewCategoryDesc(category.description || '');
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Employee Payment Sheet */}
      <EmployeePaymentSheet
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSuccess={() => {
          fetchEmployees();
          if (selectedEmployee) {
            fetchEmployeeTransactions(selectedEmployee.id);
          }
        }}
        selectedDate={new Date()}
      />
    </AppLayout>
  );
}
