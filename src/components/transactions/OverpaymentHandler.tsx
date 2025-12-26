import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, Undo2 } from 'lucide-react';
import { PaymentMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface GiveBackEntry {
  id: string;
  mode: PaymentMode;
  amount: number;
}

interface OverpaymentHandlerProps {
  overpayment: number;
  giveBackEntries: GiveBackEntry[];
  setGiveBackEntries: (entries: GiveBackEntry[]) => void;
  customerName?: string;
}

export function OverpaymentHandler({ 
  overpayment, 
  giveBackEntries, 
  setGiveBackEntries,
  customerName 
}: OverpaymentHandlerProps) {
  const totalGiveBack = giveBackEntries.reduce((sum, e) => sum + e.amount, 0);
  const remainingOverpayment = overpayment - totalGiveBack;

  const addGiveBackMode = () => {
    setGiveBackEntries([
      ...giveBackEntries, 
      { id: uuidv4(), mode: 'cash', amount: 0 }
    ]);
  };

  const updateGiveBack = (id: string, field: 'mode' | 'amount', value: any) => {
    setGiveBackEntries(giveBackEntries.map(e => 
      e.id === id ? { ...e, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : e
    ));
  };

  const removeGiveBack = (id: string) => {
    if (giveBackEntries.length > 0) {
      setGiveBackEntries(giveBackEntries.filter(e => e.id !== id));
    }
  };

  // Auto-fill remaining amount when adding new give-back entry
  useEffect(() => {
    if (giveBackEntries.length === 1 && giveBackEntries[0].amount === 0 && overpayment > 0) {
      updateGiveBack(giveBackEntries[0].id, 'amount', overpayment);
    }
  }, [overpayment]);

  if (overpayment <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Undo2 className="w-4 h-4 text-info" />
          <span className="text-sm font-medium text-info">Overpayment</span>
        </div>
        <span className="text-lg font-bold text-info">
          ₹{overpayment.toLocaleString('en-IN')}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Customer paid ₹{overpayment.toLocaleString('en-IN')} extra. 
        How would you like to return it?
      </p>

      {/* Give Back Entries */}
      <div className="space-y-2">
        {giveBackEntries.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <Select
              value={entry.mode}
              onValueChange={(value) => updateGiveBack(entry.id, 'mode', value as PaymentMode)}
            >
              <SelectTrigger className="w-24 h-9 text-xs bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
              <input
                type="number"
                value={entry.amount || ''}
                onChange={(e) => updateGiveBack(entry.id, 'amount', e.target.value)}
                placeholder="0"
                max={overpayment}
                className="w-full h-9 pl-6 pr-2 text-sm bg-background border border-border rounded-lg focus:ring-1 focus:ring-info"
              />
            </div>
            
            {giveBackEntries.length > 0 && (
              <button
                onClick={() => removeGiveBack(entry.id)}
                className="w-9 h-9 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-lg"
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Add Give Back Mode */}
      <button
        onClick={addGiveBackMode}
        className="w-full py-2 rounded-lg border border-dashed border-info/30 text-info text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-info/10 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Return Mode
      </button>

      {/* Summary */}
      <div className="pt-2 border-t border-info/20 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total Returned</span>
          <span className="font-medium text-info">₹{totalGiveBack.toLocaleString('en-IN')}</span>
        </div>
        
        {remainingOverpayment > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {customerName ? `Save to ${customerName}'s advance` : 'Remaining (save as advance)'}
            </span>
            <span className="font-medium text-warning">₹{remainingOverpayment.toLocaleString('en-IN')}</span>
          </div>
        )}
        
        {remainingOverpayment > 0 && !customerName && (
          <p className="text-[10px] text-warning/80 mt-1">
            ⚠️ Select a customer to save remaining as advance
          </p>
        )}
      </div>
    </motion.div>
  );
}