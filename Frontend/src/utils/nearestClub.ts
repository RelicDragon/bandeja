import type { ClubMapItem } from '@/api/clubs';

const HAVERSINE_CANDIDATES = 20;

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

function sqDistApprox(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180);
  return dLat * dLat + dLon * dLon;
}

export function findNearestClub(
  clubs: ClubMapItem[],
  latitude: number,
  longitude: number
): ClubMapItem | null {
  if (clubs.length === 0) return null;
  if (clubs.length <= HAVERSINE_CANDIDATES) {
    let nearest = clubs[0];
    let minDist = haversineKm(latitude, longitude, nearest.latitude, nearest.longitude);
    for (let i = 1; i < clubs.length; i++) {
      const c = clubs[i];
      const d = haversineKm(latitude, longitude, c.latitude, c.longitude);
      if (d < minDist) {
        minDist = d;
        nearest = c;
      }
    }
    return nearest;
  }
  const withSq = clubs.map((c) => ({
    club: c,
    sq: sqDistApprox(latitude, longitude, c.latitude, c.longitude),
  }));
  withSq.sort((a, b) => a.sq - b.sq);
  const candidates = withSq.slice(0, HAVERSINE_CANDIDATES);
  let nearest = candidates[0].club;
  let minDist = haversineKm(latitude, longitude, nearest.latitude, nearest.longitude);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i].club;
    const d = haversineKm(latitude, longitude, c.latitude, c.longitude);
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }
  return nearest;
}
