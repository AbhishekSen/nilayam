import { useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useProperties } from './hooks/useProperties';
import MapView from './components/MapView';
import FilterPanel from './components/FilterPanel';
import { inferFilterSchema } from './utils/filterSchema';
import { applyFilters } from './utils/applyFilters';

// Fix default marker icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function App() {
  const { data, loading, error } = useProperties();
  const [filterState, setFilterState] = useState({});

  const schema = useMemo(() => inferFilterSchema(data), [data]);
  const filtered = useMemo(
    () => applyFilters(data, schema, filterState),
    [data, schema, filterState]
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
