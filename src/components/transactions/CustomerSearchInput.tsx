import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, Phone, AlertCircle, CreditCard } from 'lucide-react';
import { searchCustomers, getDueBillsForCustomer } from '@/hooks/useSupabaseData';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface CustomerResult {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  dueBalance: number;
  advanceBalance: number;
}

interface DueBill {
  id: string;
  billNumber: string;
  totalAmount: number;
  dueAmount: number;
  createdAt: Date;
}

interface CustomerSearchInputProps {
  value: string;
  onChange: (name: string, customerId?: string, advance?: number) => void;
  showDueBills?: boolean;
  onSelectDueBill?: (bill: DueBill) => void;
  placeholder?: string;
}

export function CustomerSearchInput({
  value,
  onChange,
  showDueBills = false,
  onSelectDueBill,
  placeholder = "Search customer by name or phone..."
}: CustomerSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [dueBills, setDueBills] = useState<DueBill[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true);
        const customers = await searchCustomers(query);
        setResults(customers);
        setIsOpen(true);
        setLoading(false);
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    if (selectedCustomer && showDueBills) {
      getDueBillsForCustomer(selectedCustomer.name).then(setDueBills);
    } else {
      setDueBills([]);
    }
  }, [selectedCustomer, showDueBills]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (customer: CustomerResult) => {
    setQuery(customer.name);
    setSelectedCustomer(customer);
    onChange(customer.name, customer.id, customer.advanceBalance);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setSelectedCustomer(null);
    onChange(newValue);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          className="input-field pl-10"
        />
      </div>

      {/* Selected Customer Info */}
      {selectedCustomer && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 p-3 bg-secondary/50 rounded-xl border border-border"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{selectedCustomer.name}</span>
              {selectedCustomer.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {selectedCustomer.phone}
                </span>
              )}
            </div>
            <div className="flex gap-3 text-xs">
              {selectedCustomer.dueBalance > 0 && (
                <span className="text-warning flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Due: {formatCurrency(selectedCustomer.dueBalance)}
                </span>
              )}
              {selectedCustomer.advanceBalance > 0 && (
                <span className="text-success flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  Advance: {formatCurrency(selectedCustomer.advanceBalance)}
                </span>
              )}
            </div>
          </div>

          {/* Due Bills List */}
          {showDueBills && dueBills.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground mb-2">Due Bills</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {dueBills.map(bill => (
                  <button
                    key={bill.id}
                    onClick={() => onSelectDueBill?.(bill)}
                    className="w-full flex items-center justify-between p-2 bg-warning/10 rounded-lg text-xs hover:bg-warning/20 transition-colors"
                  >
                    <span className="font-medium">{bill.billNumber}</span>
                    <span className="text-muted-foreground">
                      {format(bill.createdAt, 'dd MMM')}
                    </span>
                    <span className="text-warning font-semibold">
                      {formatCurrency(bill.dueAmount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Search Dropdown */}
      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
          >
            {results.map((customer) => (
              <button
                key={customer.id}
                onClick={() => handleSelect(customer)}
                className="w-full p-3 text-left hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{customer.name}</p>
                    {customer.phone && (
                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end text-xs">
                    {customer.dueBalance > 0 && (
                      <span className="text-warning">Due: {formatCurrency(customer.dueBalance)}</span>
                    )}
                    {customer.advanceBalance > 0 && (
                      <span className="text-success">Adv: {formatCurrency(customer.advanceBalance)}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}