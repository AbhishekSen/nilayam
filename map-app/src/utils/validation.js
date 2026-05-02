/**
 * Validates that a row has valid latitude and longitude values.
 * Returns the row with parsed lat/lng, or null if invalid.
 */
export function validateCoordinates(row) {
  const lat = parseFloat(row.latitude);
  const lng = parseFloat(row.longitude);

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
