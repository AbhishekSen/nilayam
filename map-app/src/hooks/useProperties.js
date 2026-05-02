import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { validateCoordinates } from '../utils/validation';

export function useProperties() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProperties() {
      try {
        const { data: rows, error: sbError } = await supabase
          .from('projects_blr')
          .select('*');

        if (sbError) {
          throw new Error(`Supabase query failed: ${sbError.message}`);
        }

        const validated = rows
          .map(validateCoordinates)
          .filter(Boolean);

        if (!cancelled) {
          setData(validated);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchProperties();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
