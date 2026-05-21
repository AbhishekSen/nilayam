import type { Property, ValidatedProperty } from '../types/api';

export function validateCoordinates(row: Property): ValidatedProperty | null {
  const lat = typeof row.latitude === 'number' ? row.latitude : parseFloat(String(row.latitude));
  const lng = typeof row.longitude === 'number' ? row.longitude : parseFloat(String(row.longitude));

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    console.warn(`Skipping row id=${row.id}: missing or non-numeric coordinates`);
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn(`Skipping row id=${row.id}: coordinates out of range (${lat}, ${lng})`);
    return null;
  }

  return { ...row, latitude: lat, longitude: lng };
}
