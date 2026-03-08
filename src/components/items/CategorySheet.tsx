import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, FileSpreadsheet } from 'lucide-react';
import { Category } from '@/types';
import { useCategories } from '@/hooks/useSupabaseData';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { SortableItem } from '@/components/ui/sortable-item';

interface CategorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesChange?: () => void;
}

export function CategorySheet({ isOpen, onClose, onCategoriesChange }: CategorySheetProps) {
  const { categories, loading, addCategory, updateCategory, deleteCategory, reorderCategories, refetch } = useCategories();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [bulkData, setBulkData] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  useEffect(() => {
    if (isOpen) { refetch(); setActiveTab('list'); }
  }, [isOpen]);

  const resetForm = () => { setName(''); setEditingCategory(null); setIsAdding(false); };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setIsAdding(true);
    setActiveTab('list');
  };

  const handleDelete = async (category: Category) => {
    if (confirm(`Delete category "${category.name}"?`)) {
      await deleteCategory(category.id);
      onCategoriesChange?.();
      toast.success('Category deleted');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Enter a category name'); return; }
    if (editingCategory) {
      await updateCategory(editingCategory.id, { name: name.trim() });
      toast.success('Category updated');
    } else {
      await addCategory({ name: name.trim(), sortOrder: categories.length + 1 });
      toast.success('Category added');
    }
    onCategoriesChange?.();
    resetForm();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex(c => c.id === active.id);
    const newIndex = categories.findIndex(c => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    await reorderCategories(reordered);
    onCategoriesChange?.();
  };

  const parseBulkCategories = (data: string): string[] => {
    return data.split('\n').map(line => line.split('\t')[0]?.trim() || line.split(',')[0]?.trim() || '').filter(n => n.length > 0);
  };

  const handleBulkImport = async () => {
    const names = parseBulkCategories(bulkData);
    if (names.length === 0) { toast.error('No valid categories found'); return; }
    const existingNames = categories.map(c => c.name.toLowerCase());
    const newNames = names.filter(n => !existingNames.includes(n.toLowerCase()));
    if (newNames.length === 0) { toast.error('All categories already exist'); return; }
    for (const catName of newNames) {
      await addCategory({ name: catName, sortOrder: categories.length + newNames.indexOf(catName) + 1 });
    }
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
                <Plus className="w-4 h-4 mr-2" /> Categories
              </TabsTrigger>
              <TabsTrigger value="bulk" className="data-[state=active]:bg-background">
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Bulk Add
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
                  <div className="flex gap-3 pt-2">
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
                      {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-secondary/50 animate-pulse" />)}
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No categories yet</p>
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {categories.map((category) => (
                            <SortableItem key={category.id} id={category.id} className="p-3 rounded-xl bg-secondary/30">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-foreground">{category.name}</p>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleEdit(category)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors">
                                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                  <button onClick={() => handleDelete(category)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors">
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </button>
                                </div>
                              </div>
                            </SortableItem>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bulk" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4">
                <h4 className="font-medium text-foreground mb-2">Bulk Add Categories</h4>
                <p className="text-sm text-muted-foreground mb-3">Paste category names, one per line. Duplicates will be skipped.</p>
                <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 font-mono">
                  Category A<br />Category B<br />Category C
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
