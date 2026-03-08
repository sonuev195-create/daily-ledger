import { useState, useEffect } from 'react';

export interface PaymentMethod {
  id: string;
  name: string;
  reset: 'none' | 'daily' | 'monthly';
  editable: boolean;
}

const DEFAULT_METHODS: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', reset: 'none', editable: false },
  { id: 'upi', name: 'UPI', reset: 'daily', editable: false },
  { id: 'cheque', name: 'Cheque', reset: 'none', editable: false },
  { id: 'adjust', name: 'Adjust', reset: 'daily', editable: false },
];

export function usePaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>(() => {
    const stored = localStorage.getItem('payment-methods');
    return stored ? JSON.parse(stored) : DEFAULT_METHODS;
  });

  useEffect(() => {
    const handleStorage = () => {
      const stored = localStorage.getItem('payment-methods');
      setMethods(stored ? JSON.parse(stored) : DEFAULT_METHODS);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('payment-methods-changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('payment-methods-changed', handleStorage);
    };
  }, []);

  // Get selectable payment modes (exclude advance as it's handled separately)
  const selectableMethods = methods.filter(m => m.id !== 'advance');

  return { methods, selectableMethods };
}

export function getPaymentMethodName(id: string): string {
  const stored = localStorage.getItem('payment-methods');
  const methods: PaymentMethod[] = stored ? JSON.parse(stored) : DEFAULT_METHODS;
  return methods.find(m => m.id === id)?.name || id;
}
