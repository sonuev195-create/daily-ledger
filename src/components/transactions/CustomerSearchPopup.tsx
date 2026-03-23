import { useState, useRef, useEffect } from 'react';
import { Search, X, Check, User, AlertCircle, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { formatINR } from '@/lib/format';

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  due_balance: number;
  advance_balance: number;
}

interface CustomerSearchPopupProps {
  value: string;
  onChange: (name: string, customerId?: string, advance?: number) => void;
  placeholder?: string;
  className?: string;
}

export function CustomerSearchPopup({ value, onChange, placeholder = 'Search customer...', className }: CustomerSearchPopupProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadCustomers('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => loadCustomers(query), 200);
    return () => clearTimeout(t);
  }, [query, open]);

  const loadCustomers = async (q: string) => {
    setLoading(true);
    let qb = supabase.from('customers').select('id, name, phone, due_balance, advance_balance').order('name').limit(50);
    if (q.trim()) {
      qb = qb.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    }
    const { data } = await qb;
    setCustomers(data || []);
    setLoading(false);
  };

  const handleSelect = (c: CustomerOption) => {
    onChange(c.name, c.id, c.advance_balance);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { setOpen(true); setQuery(''); }}
        className={cn(
          "w-full h-9 px-3 text-sm bg-background border rounded-md truncate text-left flex items-center gap-2",
          !value ? "border-border text-muted-foreground" : "border-border text-foreground"
        )}
      >
        <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">{value || placeholder}</span>
        {value && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="shrink-0 text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[60vh] p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Select Customer</DialogTitle>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className="pl-9 h-10 text-sm"
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(60vh-70px)]">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : customers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {query ? 'No customers found' : 'No customers'}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {customers.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-secondary/50 flex items-center justify-between transition-colors",
                      c.name === value && "bg-accent/10"
                    )}
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{c.name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {c.due_balance > 0 && (
                        <span className="text-warning flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {formatINR(c.due_balance)}
                        </span>
                      )}
                      {c.advance_balance > 0 && (
                        <span className="text-success flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> {formatINR(c.advance_balance)}
                        </span>
                      )}
                      {c.name === value && <Check className="w-4 h-4 text-accent" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Allow entering new name */}
          {query.trim() && !customers.find(c => c.name.toLowerCase() === query.toLowerCase()) && (
            <div className="p-3 border-t border-border">
              <button
                type="button"
                onClick={() => { onChange(query.trim()); setOpen(false); setQuery(''); }}
                className="w-full px-4 py-2 text-sm bg-accent/10 hover:bg-accent/20 rounded-lg text-accent font-medium transition-colors"
              >
                + Add "{query.trim()}" as new customer
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
