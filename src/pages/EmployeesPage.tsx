import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Phone, Plus, Edit2, Trash2, Wallet, Settings, Calendar, TrendingUp, Gift, Hammer } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  salary: number;
  advance_balance: number;
}

interface CategoryItem {
  id: string;
  name: string;
  description?: string | null;
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

// Only allowance and rate work types are configurable; wage categories (present, allowance, rate work) are fixed
type SettingsTab = 'allowance' | 'ratework';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeTransactions, setEmployeeTransactions] = useState<EmployeeTransaction[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('allowance');

  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [allowanceCategories, setAllowanceCategories] = useState<CategoryItem[]>([]);
  const [rateWorkTypes, setRateWorkTypes] = useState<CategoryItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formSalary, setFormSalary] = useState('');

  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);

  useEffect(() => {
    fetchEmployees();
    fetchAllCategories();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('employees').select('*').order('name');
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllCategories = async () => {
    const [alRes, rwRes] = await Promise.all([
      supabase.from('allowance_categories').select('*').order('name'),
      supabase.from('rate_work_types').select('*').order('name'),
    ]);
    setAllowanceCategories(alRes.data || []);
    setRateWorkTypes(rwRes.data || []);
  };

  const fetchEmployeeTransactions = async (employeeId: string) => {
    const { data } = await supabase.from('transactions')
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
    if (!formName.trim()) { toast.error('Employee name is required'); return; }
    try {
      if (editEmployee) {
        const { error } = await supabase.from('employees')
          .update({ name: formName, phone: formPhone || null, role: formRole || null, salary: parseFloat(formSalary) || 0 })
          .eq('id', editEmployee.id);
        if (error) throw error;
        toast.success('Employee updated');
      } else {
        const { error } = await supabase.from('employees')
          .insert({ name: formName, phone: formPhone || null, role: formRole || null, salary: parseFloat(formSalary) || 0 });
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
    // Batch all state updates together to prevent jerking
    setFormName(employee.name);
    setFormPhone(employee.phone || '');
    setFormRole(employee.role || '');
    setFormSalary(employee.salary.toString());
    setEditEmployee(employee);
    // Open the sheet after a microtask to ensure state is settled
    requestAnimationFrame(() => setIsAddOpen(true));
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

  const getTableName = (tab: SettingsTab) => {
    if (tab === 'allowance') return 'allowance_categories';
    return 'rate_work_types';
  };

  const getItems = (tab: SettingsTab) => {
    if (tab === 'allowance') return allowanceCategories;
    return rateWorkTypes;
  };

  const handleSaveItem = async () => {
    if (!newItemName.trim()) { toast.error('Name is required'); return; }
    const table = getTableName(settingsTab);
    try {
      if (editingItem) {
        const { error } = await supabase.from(table)
          .update({ name: newItemName, description: newItemDesc || null } as any)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('Updated');
      } else {
        const { error } = await supabase.from(table)
          .insert({ name: newItemName, description: newItemDesc || null } as any);
        if (error) throw error;
        toast.success('Added');
      }
      setNewItemName('');
      setNewItemDesc('');
      setEditingItem(null);
      fetchAllCategories();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Failed to save');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const table = getTableName(settingsTab);
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Deleted'); fetchAllCategories(); }
  };

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.phone?.includes(searchQuery) ||
    e.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);

  const totalAdvance = employees.reduce((sum, e) => sum + e.advance_balance, 0);
  const totalSalary = employees.reduce((sum, e) => sum + e.salary, 0);

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const monthTransactions = employeeTransactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= monthStart && txDate <= monthEnd;
  });
  const monthTotal = monthTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  const settingsTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'allowance', label: 'Allowance Types', icon: <Gift className="w-3 h-3" /> },
    { id: 'ratework', label: 'Rate Work Types', icon: <Hammer className="w-3 h-3" /> },
  ];

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
              Settings
            </Button>
            <Button onClick={() => setIsAddOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add
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
                <p className={cn("text-xl font-bold", totalAdvance > 0 ? "text-warning" : "text-muted-foreground")}>{formatCurrency(totalAdvance)}</p>
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
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or role..."
            className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent" />
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
              <motion.div key={employee.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => handleSelectEmployee(employee)}>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{employee.name}</h3>
                      {employee.role && <span className="text-xs px-2 py-0.5 bg-secondary rounded-full text-muted-foreground">{employee.role}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {employee.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{employee.phone}</span>}
                      {employee.salary > 0 && <span>Salary: {formatCurrency(employee.salary)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("text-lg font-bold", employee.advance_balance > 0 ? "text-warning" : "text-muted-foreground")}>{formatCurrency(employee.advance_balance)}</p>
                      <p className="text-xs text-muted-foreground">Advance</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleEditEmployee(employee)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteEmployee(employee.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
              <div className="grid grid-cols-3 gap-3">
                <div className={cn("rounded-xl p-3", selectedEmployee.advance_balance > 0 ? "bg-warning/10" : "bg-secondary/50")}>
                  <p className="text-xs text-muted-foreground">Advance</p>
                  <p className={cn("text-lg font-bold", selectedEmployee.advance_balance > 0 ? "text-warning" : "text-muted-foreground")}>{formatCurrency(selectedEmployee.advance_balance)}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">Salary</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(selectedEmployee.salary)}</p>
                </div>
                <div className="bg-info/10 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-bold text-info">{formatCurrency(employeeTransactions.reduce((s, t) => s + t.amount, 0))}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{format(selectedMonth, 'MMMM yyyy')}</span>
                <span className="text-sm text-muted-foreground">- {formatCurrency(monthTotal)}</span>
              </div>

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
              <label className="text-sm font-medium">Day Salary</label>
              <Input value={formSalary} onChange={(e) => setFormSalary(e.target.value)} placeholder="0" type="number" className="mt-1" />
            </div>
            <Button onClick={handleSaveEmployee} className="w-full">{editEmployee ? 'Update Employee' : 'Add Employee'}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings Sheet - Allowance Types and Rate Work Types only */}
      <Sheet open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Employee Settings</SheetTitle>
          </SheetHeader>

          {/* Settings Tabs - no wage category tab */}
          <div className="flex rounded-lg overflow-hidden border border-border mb-4">
            {settingsTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setSettingsTab(tab.id); setEditingItem(null); setNewItemName(''); setNewItemDesc(''); }}
                className={cn(
                  "flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1",
                  settingsTab === tab.id ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                )}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[calc(80vh-200px)]">
            {/* Add/Edit Form */}
            <div className="space-y-2 p-3 bg-secondary/30 rounded-xl">
              <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                placeholder={editingItem ? "Edit name" : `New ${settingsTab === 'allowance' ? 'allowance type' : 'work type'} name`} />
              <Input value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} placeholder="Description (optional)" />
              <div className="flex gap-2">
                <Button onClick={handleSaveItem} className="flex-1">{editingItem ? 'Update' : 'Add'}</Button>
                {editingItem && (
                  <Button variant="outline" onClick={() => { setEditingItem(null); setNewItemName(''); setNewItemDesc(''); }}>Cancel</Button>
                )}
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              {getItems(settingsTab).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No items yet. Add one above.</p>
              ) : (
                getItems(settingsTab).map((item) => (
                  <div key={item.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingItem(item);
                        setNewItemName(item.name);
                        setNewItemDesc(item.description || '');
                      }}><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
