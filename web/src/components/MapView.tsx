import { MapContainer, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import PropertyMarkers from './PropertyMarkers';
import FitBounds from './FitBounds';
import type { ValidatedProperty } from '../types/api';

const DEFAULT_CENTER: LatLngExpression = [12.97, 77.59]; // Bangalore
const DEFAULT_ZOOM = 11;

interface Props {
  properties: ValidatedProperty[];
}

export default function MapView({ properties }: Props) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PropertyMarkers properties={properties} />
      <FitBounds properties={properties} />
    </MapContainer>
  );
}
