import type { ClubMapItem } from '@/api/clubs';

const CELL_SIZE_DEG = 2;
const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function cellKey(cellLat: number, cellLng: number): string {
  return `${cellLat},${cellLng}`;
}

function latToCell(lat: number): number {
  const n = Math.max(LAT_MIN, Math.min(LAT_MAX, lat));
  return Math.floor((n - LAT_MIN) / CELL_SIZE_DEG);
}

function lngToCell(lng: number): number {
  const n = Math.max(LNG_MIN, Math.min(LNG_MAX, lng));
  return Math.floor((n - LNG_MIN) / CELL_SIZE_DEG);
}

export class SpatialIndex {
  private grid = new Map<string, ClubMapItem[]>();
  private bounds: BoundingBox;

  constructor(clubs: ClubMapItem[]) {
    this.bounds = this.calculateBounds(clubs);
    for (let i = 0; i < clubs.length; i++) {
      const club = clubs[i];
      const ca = latToCell(club.latitude);
      const co = lngToCell(club.longitude);
      const key = cellKey(ca, co);
      const list = this.grid.get(key);
      if (list) list.push(club);
      else this.grid.set(key, [club]);
    }
  }

  private calculateBounds(clubs: ClubMapItem[]): BoundingBox {
    if (clubs.length === 0) {
      return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
    }
    let minLat = clubs[0].latitude;
    let maxLat = clubs[0].latitude;
    let minLng = clubs[0].longitude;
    let maxLng = clubs[0].longitude;
    for (let i = 1; i < clubs.length; i++) {
      const c = clubs[i];
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLng) minLng = c.longitude;
      if (c.longitude > maxLng) maxLng = c.longitude;
    }
    return { minLat, maxLat, minLng, maxLng };
  }

  query(minLat: number, maxLat: number, minLng: number, maxLng: number): ClubMapItem[] {
    const cMinLat = latToCell(minLat);
    const cMaxLat = latToCell(maxLat);
    const cMinLng = lngToCell(minLng);
    const cMaxLng = lngToCell(maxLng);
    const result: ClubMapItem[] = [];
    for (let ca = cMinLat; ca <= cMaxLat; ca++) {
      for (let co = cMinLng; co <= cMaxLng; co++) {
        const list = this.grid.get(cellKey(ca, co));
        if (list) {
          for (let i = 0; i < list.length; i++) {
            const club = list[i];
            if (
              club.latitude >= minLat &&
              club.latitude <= maxLat &&
              club.longitude >= minLng &&
              club.longitude <= maxLng
            ) {
              result.push(club);
            }
          }
        }
      }
    }
    return result;
  }

  getBounds(): BoundingBox {
    return this.bounds;
  }
}
