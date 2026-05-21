import { createContext, useContext } from 'react';
import type { UsePropertiesResult } from '../hooks/useProperties';

export const DataContext = createContext<UsePropertiesResult | null>(null);

export function useData(): UsePropertiesResult {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
