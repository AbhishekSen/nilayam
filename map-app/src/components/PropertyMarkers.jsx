import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import PropertyPopup from './PropertyPopup';

export default function PropertyMarkers({ properties }) {
  if (properties.length === 0) return null;

  const markers = properties.map((property) => (
    <Marker
      key={property.id ?? `${property.latitude}-${property.longitude}`}
      position={[property.latitude, property.longitude]}
    >
      <Popup>
        <PropertyPopup property={property} />
      </Popup>
    </Marker>
  ));

  if (properties.length > 500) {
    return <MarkerClusterGroup chunkedLoading>{markers}</MarkerClusterGroup>;
  }

  return <>{markers}</>;
}
