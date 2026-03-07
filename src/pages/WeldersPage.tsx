import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Search, Phone, Plus, Edit2, Trash2, Calendar, TrendingUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatINR } from '@/lib/format';

interface Welder {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

interface WelderSalesData {
  totalSales: number;
  monthWise: Record<string, number>;
}

export default function WeldersPage() {
  const [welders, setWelders] = useState<Welder[]>([]);
  const [welderTotals, setWelderTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWelder, setSelectedWelder] = useState<Welder | null>(null);
  const [salesData, setSalesData] = useState<WelderSalesData | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editWelder, setEditWelder] = useState<Welder | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');

  useEffect(() => { fetchWelders(); }, []);

  const fetchWelders = async () => {
    setLoading(true);
    const { data } = await supabase.from('welders').select('*').order('name');
    setWelders(data || []);
    // Fetch total sales per welder
    if (data && data.length > 0) {
      const { data: txData } = await supabase.from('transactions').select('welder_id, amount').eq('type', 'sale').not('welder_id', 'is', null);
      const totals: Record<string, number> = {};
      (txData || []).forEach(t => {
        if (t.welder_id) totals[t.welder_id] = (totals[t.welder_id] || 0) + Number(t.amount);
      });
      setWelderTotals(totals);
    }
    setLoading(false);
  };

  const fetchWelderSales = async (welderId: string, year: number) => {
    const yearStart = format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
    const yearEnd = format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
    
    const { data } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('welder_id', welderId)
      .eq('type', 'sale')
      .gte('date', yearStart)
      .lte('date', yearEnd);

    const totalSales = (data || []).reduce((s, t) => s + Number(t.amount), 0);
    const monthWise: Record<string, number> = {};
    (data || []).forEach(t => {
      const month = format(new Date(t.date), 'MMM');
      monthWise[month] = (monthWise[month] || 0) + Number(t.amount);
    });

    setSalesData({ totalSales, monthWise });
  };

  const handleSelectWelder = async (welder: Welder) => {
    setSelectedWelder(welder);
    await fetchWelderSales(welder.id, selectedYear);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    try {
      if (editWelder) {
        await supabase.from('welders').update({ name: formName, phone: formPhone || null }).eq('id', editWelder.id);
        toast.success('Welder updated');
      } else {
        await supabase.from('welders').insert({ name: formName, phone: formPhone || null });
        toast.success('Welder added');
      }
      closeForm();
      fetchWelders();
    } catch { toast.error('Failed to save'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this welder?')) return;
    const { error } = await supabase.from('welders').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Deleted'); fetchWelders(); setSelectedWelder(null); }
  };

  const handleEdit = (w: Welder) => {
    setEditWelder(w);
    setFormName(w.name);
    setFormPhone(w.phone || '');
    setIsAddOpen(true);
  };

  const closeForm = () => {
    setIsAddOpen(false);
    setEditWelder(null);
    setFormName('');
    setFormPhone('');
  };

  const filtered = welders.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) || w.phone?.includes(searchQuery)
  );

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <AppLayout title="Welders">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welders</h1>
            <p className="text-sm text-muted-foreground">{welders.length} welders</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Welder
          </Button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent" />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Flame className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No welders found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((w, i) => (
              <motion.div key={w.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => handleSelectWelder(w)}>
                    <h3 className="font-semibold text-foreground">{w.name}</h3>
                    {w.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{w.phone}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-lg font-bold text-accent">{formatINR(welderTotals[w.id] || 0)}</p>
                      <p className="text-xs text-muted-foreground">Total Sales</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(w)}><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(w.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Welder Detail Sheet */}
      <Sheet open={!!selectedWelder} onOpenChange={open => !open && setSelectedWelder(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Flame className="w-5 h-5" /> {selectedWelder?.name}
            </SheetTitle>
          </SheetHeader>

          {selectedWelder && salesData && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)]">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <Select value={selectedYear.toString()} onValueChange={v => {
                  const yr = parseInt(v);
                  setSelectedYear(yr);
                  fetchWelderSales(selectedWelder.id, yr);
                }}>
                  <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Sales ({selectedYear})</p>
                    <p className="text-2xl font-bold text-accent">{formatINR(salesData.totalSales)}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Monthly Breakdown</h4>
                <div className="grid grid-cols-3 gap-2">
                  {months.map(m => (
                    <div key={m} className="bg-secondary/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">{m}</p>
                      <p className="font-semibold text-foreground">{formatINR(salesData.monthWise[m] || 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Sheet */}
      <Sheet open={isAddOpen} onOpenChange={open => { if (!open) closeForm(); }}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{editWelder ? 'Edit Welder' : 'Add Welder'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Welder name" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Phone number" className="mt-1" />
            </div>
            <Button onClick={handleSave} className="w-full">{editWelder ? 'Update' : 'Add Welder'}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
