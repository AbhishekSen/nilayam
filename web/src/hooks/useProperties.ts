import { useState, useEffect } from 'react';
import { fetchProperties } from '../lib/api';
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

    fetchProperties()
      .then((rows) => {
        const validated = rows
          .map(validateCoordinates)
          .filter((r): r is ValidatedProperty => r !== null);
        if (!cancelled) {
          setData(validated);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
