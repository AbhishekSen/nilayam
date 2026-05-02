import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useProperties } from './hooks/useProperties';
import MapView from './components/MapView';

// Fix default marker icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function App() {
  const { data, loading, error } = useProperties();

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

  return <MapView properties={data} />;
}
