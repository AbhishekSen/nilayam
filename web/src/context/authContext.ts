import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Me } from '../types/me';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  me: Me | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
