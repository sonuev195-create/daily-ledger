import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedItem = value ? items.find(i => i.id === value) : null;

  const filtered = query.trim()
    ? items.filter(i => {
        const q = query.toLowerCase();
        return i.name.toLowerCase().includes(q) || (i.paperBillName?.toLowerCase().includes(q));
      })
    : items;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className={cn(
            "w-full h-7 px-1.5 text-[11px] bg-background/50 border rounded truncate text-left flex items-center gap-1",
            !value ? "border-destructive/50 text-destructive" : "border-border text-foreground"
          )}
        >
          {selectedItem ? (
            <span className="truncate flex-1">{selectedItem.name}</span>
          ) : (
            <span className="text-muted-foreground truncate flex-1">No match</span>
          )}
          <Search className="w-3 h-3 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="flex items-center gap-0.5">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full h-7 px-1.5 text-[11px] bg-background border border-accent/50 rounded focus:outline-none focus:ring-1 focus:ring-accent/30"
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          />
          {value && (
            <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-destructive shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="absolute z-50 w-full mt-0.5 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-muted-foreground">No items found</div>
          ) : (
            filtered.slice(0, 50).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={cn(
                  "w-full px-2 py-1.5 text-left text-[11px] hover:bg-secondary/50 border-b border-border/20 last:border-0",
                  item.id === value && "bg-accent/10 font-medium"
                )}
              >
                {item.name}
                {item.paperBillName && item.paperBillName !== item.name && (
                  <span className="text-muted-foreground ml-1">({item.paperBillName})</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
