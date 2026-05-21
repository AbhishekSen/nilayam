import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLngBoundsLiteral } from 'leaflet';
import type { ValidatedProperty } from '../types/api';

interface Props {
  properties: ValidatedProperty[];
}

export default function FitBounds({ properties }: Props) {
  const map = useMap();

  useEffect(() => {
    if (properties.length === 0) return;

    const bounds: LatLngBoundsLiteral = properties.map(
      (p) => [p.latitude, p.longitude] as [number, number],
    );
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [properties, map]);

  return null;
}
