import { City } from '@/types';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function findNearestCity(
  cities: City[],
  latitude: number,
  longitude: number
): City | null {
  if (!isValidCoord(latitude, longitude)) return null;
  const withCoords = cities.filter(
    (c) => c.latitude != null && c.longitude != null
  );
  if (withCoords.length === 0) return null;
  let nearest = withCoords[0];
  let minDist = haversineKm(
    latitude,
    longitude,
    nearest.latitude!,
    nearest.longitude!
  );
  for (let i = 1; i < withCoords.length; i++) {
    const c = withCoords[i];
    const d = haversineKm(latitude, longitude, c.latitude!, c.longitude!);
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }
  return nearest;
}
