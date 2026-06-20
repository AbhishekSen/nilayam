import { useMemo, useState } from 'react';
import { useData } from '../context/dataContext';
import MapView from '../components/MapView';
import FilterPanel from '../components/FilterPanel';
import { inferFilterSchema } from '../utils/filterSchema';
import { applyFilters } from '../utils/applyFilters';
import type { FilterState } from '../types/filters';

export default function MapPage() {
  const { data, loading, error } = useData();
  const [filterState, setFilterState] = useState<FilterState>({});

  const schema = useMemo(() => inferFilterSchema(data), [data]);
  const filtered = useMemo(
    () => applyFilters(data, schema, filterState),
    [data, schema, filterState],
  );

  if (loading) {
    return (
      <div className="loading-overlay">
        <p>Loading properties...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-overlay">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="loading-overlay">
        <p>No properties with valid coordinates found.</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <FilterPanel
        schema={schema}
        state={filterState}
        onChange={setFilterState}
        totalCount={data.length}
        filteredCount={filtered.length}
      />
      <main className="map-pane">
        <MapView properties={filtered} />
      </main>
    </div>
  );
}
