import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkItem {
  id: string;
  name: string;
  sellingPrice: number;
  categoryId: string | null;
  batchPreference: string;
  primaryStock: number;
  secondaryStock: number;
  // editable fields
  newName: string;
  newSellingPrice: string;
  newCategoryId: string;
  newBatchPreference: string;
  newPrimaryStock: string;
  newSecondaryStock: string;
  changed: boolean;
}

interface Category {
  id: string;
  name: string;
}

interface BulkItemEditProps {
  onClose: () => void;
  onSaved: () => void;
}

export function BulkItemEdit({ onClose, onSaved }: BulkItemEditProps) {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: itemsData }, { data: catsData }, { data: batchesData }] = await Promise.all([
      supabase.from('items').select('*').order('sort_order'),
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('batches').select('item_id, primary_quantity, secondary_quantity'),
    ]);

    setCategories(catsData || []);

    const stockMap: Record<string, { primary: number; secondary: number }> = {};
    (batchesData || []).forEach(b => {
      if (!stockMap[b.item_id]) stockMap[b.item_id] = { primary: 0, secondary: 0 };
      stockMap[b.item_id].primary += Number(b.primary_quantity);
      stockMap[b.item_id].secondary += Number(b.secondary_quantity);
    });

    setItems((itemsData || []).map(item => ({
      id: item.id,
      name: item.name,
      sellingPrice: Number(item.selling_price),
      categoryId: item.category_id,
      batchPreference: item.batch_preference,
      primaryStock: stockMap[item.id]?.primary || 0,
      secondaryStock: stockMap[item.id]?.secondary || 0,
      newName: item.name,
      newSellingPrice: String(item.selling_price),
      newCategoryId: item.category_id || '',
      newBatchPreference: item.batch_preference,
      newPrimaryStock: String(stockMap[item.id]?.primary || 0),
      newSecondaryStock: String(stockMap[item.id]?.secondary || 0),
      changed: false,
    })));
    setLoading(false);
  };

  const updateField = (index: number, field: keyof BulkItem, value: string) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      item.changed = item.newName !== item.name ||
        item.newSellingPrice !== String(item.sellingPrice) ||
        item.newCategoryId !== (item.categoryId || '') ||
        item.newBatchPreference !== item.batchPreference ||
        item.newPrimaryStock !== String(item.primaryStock) ||
        item.newSecondaryStock !== String(item.secondaryStock);
      updated[index] = item;
      return updated;
    });
  };

  const handleSaveAll = async () => {
    const changedItems = items.filter(i => i.changed);
    if (changedItems.length === 0) { toast.info('No changes'); return; }
    setSaving(true);

    try {
      for (const item of changedItems) {
        // Update item master
        if (item.newName !== item.name || item.newSellingPrice !== String(item.sellingPrice) ||
            item.newCategoryId !== (item.categoryId || '') || item.newBatchPreference !== item.batchPreference) {
          await supabase.from('items').update({
            name: item.newName,
            selling_price: parseFloat(item.newSellingPrice) || 0,
            category_id: item.newCategoryId || null,
            batch_preference: item.newBatchPreference,
          }).eq('id', item.id);
        }

        // Update stock if changed - adjust opening batch
        const newPrimary = parseFloat(item.newPrimaryStock) || 0;
        const newSecondary = parseFloat(item.newSecondaryStock) || 0;
        if (newPrimary !== item.primaryStock || newSecondary !== item.secondaryStock) {
          const diff = newPrimary - item.primaryStock;
          const secDiff = newSecondary - item.secondaryStock;
          // Find opening stock batch or first batch
          const { data: batches } = await supabase.from('batches')
            .select('*').eq('item_id', item.id).order('purchase_date');
          
          if (batches && batches.length > 0) {
            const openBatch = batches.find(b => b.batch_number === 'Opening Stock') || batches[0];
            await supabase.from('batches').update({
              primary_quantity: Number(openBatch.primary_quantity) + diff,
              secondary_quantity: Number(openBatch.secondary_quantity) + secDiff,
            }).eq('id', openBatch.id);
          } else if (diff > 0 || secDiff > 0) {
            await supabase.from('batches').insert({
              item_id: item.id,
              batch_number: 'Opening Stock',
              purchase_date: new Date().toISOString().split('T')[0],
              purchase_rate: 0,
              primary_quantity: newPrimary,
              secondary_quantity: newSecondary,
            });
          }
        }
      }

      toast.success(`${changedItems.length} items updated`);
      window.dispatchEvent(new Event('items:changed'));
      window.dispatchEvent(new Event('batches:changed'));
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const changedCount = items.filter(i => i.changed).length;

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading items...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">Bulk Edit Items</h3>
          <p className="text-xs text-muted-foreground">{items.length} items • {changedCount} changed</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          <Button size="sm" onClick={handleSaveAll} disabled={saving || changedCount === 0} className="gap-1">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : `Save ${changedCount}`}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_100px_90px_70px_70px] gap-1 px-3 py-2 bg-secondary/50 text-[10px] font-medium text-muted-foreground sticky top-0 z-10">
          <span>Name</span>
          <span>Sell ₹</span>
          <span>Category</span>
          <span>Batch Pref</span>
          <span>Pri.Stk</span>
          <span>Sec.Stk</span>
        </div>

        {items.map((item, i) => (
          <div key={item.id} className={cn(
            "grid grid-cols-[1fr_80px_100px_90px_70px_70px] gap-1 px-3 py-1 border-b border-border/30 items-center",
            item.changed && "bg-accent/5"
          )}>
            <Input
              value={item.newName}
              onChange={e => updateField(i, 'newName', e.target.value)}
              className="h-7 text-xs px-1.5"
            />
            <Input
              type="number"
              value={item.newSellingPrice}
              onChange={e => updateField(i, 'newSellingPrice', e.target.value)}
              className="h-7 text-xs px-1.5"
            />
            <select
              value={item.newCategoryId}
              onChange={e => updateField(i, 'newCategoryId', e.target.value)}
              className="h-7 text-xs px-1 bg-background border border-input rounded"
            >
              <option value="">None</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={item.newBatchPreference}
              onChange={e => updateField(i, 'newBatchPreference', e.target.value)}
              className="h-7 text-xs px-1 bg-background border border-input rounded"
            >
              <option value="category">Category</option>
              <option value="oldest">Oldest</option>
              <option value="latest">Latest</option>
            </select>
            <Input
              type="number"
              value={item.newPrimaryStock}
              onChange={e => updateField(i, 'newPrimaryStock', e.target.value)}
              className="h-7 text-xs px-1.5"
            />
            <Input
              type="number"
              value={item.newSecondaryStock}
              onChange={e => updateField(i, 'newSecondaryStock', e.target.value)}
              className="h-7 text-xs px-1.5"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
