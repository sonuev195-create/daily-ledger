import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, FileSpreadsheet } from 'lucide-react';
import { Category, BatchPreference } from '@/types';
import { getAllCategories, addCategory, updateCategory, deleteCategory } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface CategorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesChange?: () => void;
}

const batchPreferenceOptions: { value: Exclude<BatchPreference, 'category'>; label: string; description: string }[] = [
  { value: 'latest', label: 'Latest First', description: 'Use newest batch first (LIFO)' },
  { value: 'oldest', label: 'Oldest First', description: 'Use oldest batch first (FIFO)' },
  { value: 'custom', label: 'Custom', description: 'Choose batch manually each time' },
];

export function CategorySheet({ isOpen, onClose, onCategoriesChange }: CategorySheetProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [preference, setPreference] = useState<Exclude<BatchPreference, 'category'>>('latest');
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [bulkData, setBulkData] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      setActiveTab('list');
    }
  }, [isOpen]);

  const loadCategories = async () => {
    setLoading(true);
    const data = await getAllCategories();
    setCategories(data);
    setLoading(false);
  };

  const resetForm = () => {
    setName('');
    setPreference('latest');
    setEditingCategory(null);
    setIsAdding(false);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setPreference(category.batchPreference);
    setIsAdding(true);
    setActiveTab('list');
  };

  const handleDelete = async (category: Category) => {
    if (confirm(`Delete category "${category.name}"?`)) {
      await deleteCategory(category.id);
      await loadCategories();
      onCategoriesChange?.();
      toast.success('Category deleted');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    const categoryData: Category = {
      id: editingCategory?.id || uuidv4(),
      name: name.trim(),
      batchPreference: preference,
      createdAt: editingCategory?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    if (editingCategory) {
      await updateCategory(categoryData);
      toast.success('Category updated');
    } else {
      await addCategory(categoryData);
      toast.success('Category added');
    }

    await loadCategories();
    onCategoriesChange?.();
    resetForm();
  };

  const parseBulkCategories = (data: string): string[] => {
    return data
      .split('\n')
      .map(line => line.split('\t')[0]?.trim() || line.split(',')[0]?.trim() || '')
      .filter(name => name.length > 0);
  };

  const handleBulkImport = async () => {
    const names = parseBulkCategories(bulkData);
    if (names.length === 0) {
      toast.error('No valid categories found');
      return;
    }

    const existingNames = categories.map(c => c.name.toLowerCase());
    const newNames = names.filter(n => !existingNames.includes(n.toLowerCase()));

    if (newNames.length === 0) {
      toast.error('All categories already exist');
      return;
    }

    for (const catName of newNames) {
      await addCategory({
        id: uuidv4(),
        name: catName,
        batchPreference: preference,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await loadCategories();
    onCategoriesChange?.();
    setBulkData('');
    toast.success(`${newNames.length} categories imported`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl p-0 bg-background">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle>Manage Categories</SheetTitle>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-6 mt-4 grid grid-cols-2 bg-secondary/50">
              <TabsTrigger value="list" className="data-[state=active]:bg-background">
                <Plus className="w-4 h-4 mr-2" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="bulk" className="data-[state=active]:bg-background">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Bulk Add
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              {isAdding ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Category Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Electronics, Groceries" className="input-field" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Default Batch Preference</label>
                    <div className="space-y-2">
                      {batchPreferenceOptions.map((option) => (
                        <button key={option.value} onClick={() => setPreference(option.value)}
                          className={`w-full p-3 rounded-xl text-left transition-colors ${
                            preference === option.value
                              ? 'bg-primary/10 border-2 border-primary'
                              : 'bg-secondary/50 border-2 border-transparent hover:bg-secondary'
                          }`}>
                          <p className="font-medium text-foreground">{option.label}</p>
                          <p className="text-sm text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button onClick={resetForm} className="flex-1 py-3 rounded-xl bg-secondary text-foreground">Cancel</button>
                    <button onClick={handleSave} className="flex-1 btn-accent py-3">
                      {editingCategory ? 'Update' : 'Add'} Category
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <button onClick={() => setIsAdding(true)}
                    className="w-full py-3 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Category
                  </button>
                  {loading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-secondary/50 animate-pulse" />)}
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No categories yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <div key={category.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                          <div>
                            <p className="font-medium text-foreground">{category.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {batchPreferenceOptions.find(o => o.value === category.batchPreference)?.label}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEdit(category)}
                              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors">
                              <Edit2 className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDelete(category)}
                              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bulk" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4">
                <h4 className="font-medium text-foreground mb-2">Bulk Add Categories</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Paste category names, one per line. Duplicates will be skipped.
                </p>
                <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 font-mono">
                  Category A<br />Category B<br />Category C
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Default Batch Preference for all</label>
                <div className="flex gap-2 mb-3">
                  {batchPreferenceOptions.map((option) => (
                    <button key={option.value} onClick={() => setPreference(option.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                        preference === option.value ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground'
                      }`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Paste category names</label>
                <textarea value={bulkData} onChange={(e) => setBulkData(e.target.value)}
                  placeholder="Electronics&#10;Groceries&#10;Hardware"
                  className="input-field min-h-[150px] font-mono text-sm" />
              </div>

              {bulkData && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">
                    Found <span className="font-semibold text-foreground">{parseBulkCategories(bulkData).length}</span> categories to import
                  </p>
                </div>
              )}

              <button onClick={handleBulkImport} disabled={!bulkData.trim()} className="btn-accent w-full py-3 disabled:opacity-50">
                Import Categories
              </button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
