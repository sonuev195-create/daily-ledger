import { useState, useEffect, useCallback } from 'react';
import { DrawerOpening, DrawerClosing } from '@/types';
import { getDrawerOpening, saveDrawerOpening, getDrawerClosing, saveDrawerClosing } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export function useDrawer(date: Date) {
  const [opening, setOpening] = useState<DrawerOpening | null>(null);
  const [closing, setClosing] = useState<DrawerClosing | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDrawer = useCallback(async () => {
    try {
      setLoading(true);
      const [openingData, closingData] = await Promise.all([
        getDrawerOpening(date),
        getDrawerClosing(date),
      ]);
      setOpening(openingData || null);
      setClosing(closingData || null);
    } catch (err) {
      console.error('Failed to load drawer:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadDrawer();
  }, [loadDrawer]);

  const updateOpening = useCallback(async (data: Partial<DrawerOpening>) => {
    const newOpening: DrawerOpening = {
      id: opening?.id || uuidv4(),
      date: date,
      coin: data.coin ?? opening?.coin ?? 0,
      cash: data.cash ?? opening?.cash ?? 0,
      homeAdvance: data.homeAdvance ?? opening?.homeAdvance ?? 0,
      upiOpening: data.upiOpening ?? opening?.upiOpening ?? 0,
      bankOpening: data.bankOpening ?? opening?.bankOpening ?? 0,
    };
    await saveDrawerOpening(newOpening);
    setOpening(newOpening);
    return newOpening;
  }, [date, opening]);

  const updateClosing = useCallback(async (data: Partial<DrawerClosing>) => {
    const newClosing: DrawerClosing = {
      id: closing?.id || uuidv4(),
      date: date,
      systemCash: data.systemCash ?? closing?.systemCash ?? 0,
      manualCoin: data.manualCoin ?? closing?.manualCoin ?? 0,
      manualCash: data.manualCash ?? closing?.manualCash ?? 0,
      cashToHome: data.cashToHome ?? closing?.cashToHome ?? 0,
      difference: data.difference ?? closing?.difference ?? 0,
      systemUpi: data.systemUpi ?? closing?.systemUpi ?? 0,
      systemBank: data.systemBank ?? closing?.systemBank ?? 0,
    };
    await saveDrawerClosing(newClosing);
    setClosing(newClosing);
    return newClosing;
  }, [date, closing]);

  const getOpeningTotal = useCallback(() => {
    if (!opening) return { cash: 0, upi: 0, bank: 0 };
    return {
      cash: opening.coin + opening.cash + opening.homeAdvance,
      upi: opening.upiOpening,
      bank: opening.bankOpening,
    };
  }, [opening]);

  return {
    opening,
    closing,
    loading,
    updateOpening,
    updateClosing,
    getOpeningTotal,
    refresh: loadDrawer,
  };
}
