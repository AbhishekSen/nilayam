import type { ReactNode } from 'react';
import { useProperties } from '../hooks/useProperties';
import { DataContext } from './dataContext';

export function DataProvider({ children }: { children: ReactNode }) {
  const value = useProperties();
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
