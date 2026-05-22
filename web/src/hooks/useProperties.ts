import { useState, useEffect } from 'react';
import { fetchProperties } from '../lib/api';
import { supabase } from '../lib/supabase';
import { validateCoordinates } from '../utils/validation';
import type { ValidatedProperty } from '../types/api';

export interface UsePropertiesResult {
  data: ValidatedProperty[];
  loading: boolean;
  error: string | null;
}

export function useProperties(): UsePropertiesResult {
  const [data, setData] = useState<ValidatedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          // Not logged in yet — leave loading=true; we'll re-fire on auth change.
          return;
        }
        const rows = await fetchProperties();
        if (cancelled) return;
        const validated = rows
          .map(validateCoordinates)
          .filter((r): r is ValidatedProperty => r !== null);
        setData(validated);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        void load();
      } else if (event === 'SIGNED_OUT') {
        if (cancelled) return;
        setData([]);
        setLoading(true);
        setError(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { data, loading, error };
}
