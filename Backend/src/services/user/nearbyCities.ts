export const NEARBY_SAME_COUNTRY_MAX_KM = 80;
export const NEARBY_BORDER_MAX_KM = 30;
export const NEARBY_CITY_LIMIT = 3;

export type NearbyCityCandidate = {
  id: string;
  name: string;
  country: string;
  administrativeArea: string | null;
  subAdministrativeArea: string | null;
  latitude: number;
  longitude: number;
};

export type RankedNearbyCity = NearbyCityCandidate & { km: number };

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthKm * c;
}

function sameMetro(a: NearbyCityCandidate, b: NearbyCityCandidate): boolean {
  if (a.subAdministrativeArea && a.subAdministrativeArea === b.subAdministrativeArea) {
    return true;
  }
  return Boolean(a.administrativeArea && a.administrativeArea === b.administrativeArea);
}

function withinRange(sameCountry: boolean, km: number): boolean {
  if (sameCountry) return km <= NEARBY_SAME_COUNTRY_MAX_KM;
  return km <= NEARBY_BORDER_MAX_KM;
}

export function rankNearbyCities(
  anchor: NearbyCityCandidate,
  cities: NearbyCityCandidate[],
  limit = NEARBY_CITY_LIMIT,
): RankedNearbyCity[] {
  const ranked: RankedNearbyCity[] = [];
  for (const city of cities) {
    if (city.id === anchor.id) continue;
    const km = haversineKm(anchor.latitude, anchor.longitude, city.latitude, city.longitude);
    const sameCountry = city.country === anchor.country;
    if (!withinRange(sameCountry, km)) continue;
    ranked.push({ ...city, km });
  }
  ranked.sort((a, b) => {
    const metroA = sameMetro(anchor, a) ? 0 : 1;
    const metroB = sameMetro(anchor, b) ? 0 : 1;
    if (metroA !== metroB) return metroA - metroB;
    const countryA = a.country === anchor.country ? 0 : 1;
    const countryB = b.country === anchor.country ? 0 : 1;
    if (countryA !== countryB) return countryA - countryB;
    return a.km - b.km;
  });
  return ranked.slice(0, limit);
}
