import { useState, useRef, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ItemOption {
  id: string;
  name: string;
  paperBillName?: string | null;
}

interface ItemSearchSelectProps {
  items: ItemOption[];
  value: string | null;
  onChange: (itemId: string | null) => void;
  placeholder?: string;
  className?: string;
}

export function ItemSearchSelect({ items, value, onChange, placeholder = 'Search item...', className }: ItemSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = value ? items.find(i => i.id === value) : null;

  const filtered = query.trim()
    ? items.filter(i => {
        const q = query.toLowerCase();
        return i.name.toLowerCase().includes(q) || (i.paperBillName?.toLowerCase().includes(q));
      })
    : items;

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { setOpen(true); setQuery(''); }}
        className={cn(
          "w-full h-7 px-1.5 text-[11px] bg-background/50 border rounded truncate text-left flex items-center gap-1",
          !value ? "border-destructive/50 text-destructive" : "border-border text-foreground"
        )}
      >
        {selectedItem ? (
          <>
            <span className="truncate flex-1">{selectedItem.name}</span>
            <button type="button" onClick={handleClear} className="shrink-0 text-muted-foreground hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground truncate flex-1">Select item</span>
            <Search className="w-3 h-3 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[60vh] p-0 gap-0 overflow-hidden">
          <VisuallyHidden><DialogTitle>Select Item</DialogTitle></VisuallyHidden>
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="pl-9 h-10 text-sm"
              />
            </div>
          </div>

          {/* Item List */}
          <div className="overflow-y-auto max-h-[calc(60vh-70px)]">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No items found</div>
            ) : (
              <div className="divide-y divide-border/30">
                {filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm hover:bg-secondary/50 flex items-center justify-between transition-colors",
                      item.id === value && "bg-accent/10"
                    )}
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{item.name}</span>
                      {item.paperBillName && item.paperBillName !== item.name && (
                        <span className="text-muted-foreground ml-2 text-xs">({item.paperBillName})</span>
                      )}
                    </div>
                    {item.id === value && <Check className="w-4 h-4 text-accent shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
