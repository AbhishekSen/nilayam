import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { validateCoordinates } from '../utils/validation';

export function useProperties(csvUrl = '/data/properties.csv') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAndParse() {
      try {
        const response = await fetch(csvUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();

        const { data: rows, errors } = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          transformHeader: (h) => h.trim(),
        });

        if (errors.length > 0) {
          console.warn('CSV parse warnings:', errors);
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

    fetchAndParse();
    return () => { cancelled = true; };
  }, [csvUrl]);

  return { data, loading, error };
}
