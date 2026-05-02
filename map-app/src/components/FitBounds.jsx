import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function FitBounds({ properties }) {
  const map = useMap();

  useEffect(() => {
    if (properties.length === 0) return;

    const bounds = properties.map((p) => [p.latitude, p.longitude]);
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [properties, map]);

  return null;
}
