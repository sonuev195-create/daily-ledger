import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Phone, Plus, Edit2, Wallet, Settings } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
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
  created_at: string;
  salary_category_id: string | null;
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
  
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formSalary, setFormSalary] = useState('');
  
  const [newCategoryName, setNewCategoryName] = useState('');
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
      .select('id, type, amount, created_at, salary_category_id')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(20);
    
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
          .update({ name: newCategoryName })
          .eq('id', editingCategory.id);
        
        if (error) throw error;
        toast.success('Category updated');
      } else {
        const { error } = await supabase
          .from('salary_categories')
          .insert({ name: newCategoryName });
        
        if (error) throw error;
        toast.success('Category added');
      }
      
      setNewCategoryName('');
      setEditingCategory(null);
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    }
  };

  const getCategoryName = (id: string | null) => {
    if (!id) return 'N/A';
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
          </div>
        </div>

        {/* Summary Card */}
        <div className={cn("border rounded-xl p-4 mb-6", totalAdvance > 0 ? "bg-warning/10 border-warning/20" : "bg-secondary/50 border-border")}>
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", totalAdvance > 0 ? "bg-warning/20" : "bg-secondary")}>
              <Wallet className={cn("w-6 h-6", totalAdvance > 0 ? "text-warning" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Advance Given</p>
              <p className={cn("text-2xl font-bold", totalAdvance > 0 ? "text-warning" : "text-muted-foreground")}>
                {formatCurrency(totalAdvance)}
              </p>
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
              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className={cn("rounded-xl p-4", selectedEmployee.advance_balance > 0 ? "bg-warning/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Advance Balance</p>
                  <p className={cn("text-xl font-bold", selectedEmployee.advance_balance > 0 ? "text-warning" : "text-muted-foreground")}>
                    {formatCurrency(selectedEmployee.advance_balance)}
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Monthly Salary</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(selectedEmployee.salary)}</p>
                </div>
              </div>

              {/* Recent Transactions */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Recent Transactions</h4>
                {employeeTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions found</p>
                ) : (
                  <div className="space-y-2">
                    {employeeTransactions.map((tx) => (
                      <div key={tx.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.type.replace(/_/g, ' ')} • {format(new Date(tx.created_at), 'MMM d')}
                          </p>
                          {tx.salary_category_id && (
                            <p className="text-xs text-accent">{getCategoryName(tx.salary_category_id)}</p>
                          )}
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
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Salary Categories</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4 overflow-y-auto max-h-[calc(70vh-150px)]">
            {/* Add New Category */}
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={editingCategory ? "Edit category name" : "New category name"}
                className="flex-1"
              />
              <Button onClick={handleSaveCategory}>
                {editingCategory ? 'Update' : 'Add'}
              </Button>
              {editingCategory && (
                <Button variant="outline" onClick={() => { setEditingCategory(null); setNewCategoryName(''); }}>
                  Cancel
                </Button>
              )}
            </div>

            {/* Category List */}
            <div className="space-y-2">
              {categories.map((category) => (
                <div key={category.id} className="bg-secondary/30 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-muted-foreground">{category.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingCategory(category);
                      setNewCategoryName(category.name);
                    }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
