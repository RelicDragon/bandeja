import { useMemo } from 'react';
import type { ClubMapItem } from '@/api/clubs';

const VIRTUAL_RENDER_LIMIT = 150;
const MAX_RENDER = 500;

interface VirtualizedMarkersProps {
  clubs: ClubMapItem[];
  viewportCenter: { lat: number; lng: number } | null;
  zoom: number;
}

export function useVirtualizedMarkers({
  clubs,
  viewportCenter,
  zoom,
}: VirtualizedMarkersProps): ClubMapItem[] {
  return useMemo(() => {
    if (!viewportCenter || clubs.length <= VIRTUAL_RENDER_LIMIT) {
      return clubs.length <= MAX_RENDER ? clubs : clubs.slice(0, MAX_RENDER);
    }
    const renderLimit = Math.min(
      Math.min(VIRTUAL_RENDER_LIMIT + Math.floor(zoom * 10), MAX_RENDER),
      clubs.length
    );
    if (clubs.length <= renderLimit) return clubs;
    const clubsWithDistance = clubs.map((club) => {
      const latDiff = club.latitude - viewportCenter.lat;
      const lngDiff = club.longitude - viewportCenter.lng;
      return { club, distance: latDiff * latDiff + lngDiff * lngDiff };
    });
    clubsWithDistance.sort((a, b) => a.distance - b.distance);
    return clubsWithDistance.slice(0, renderLimit).map((item) => item.club);
  }, [clubs, viewportCenter, zoom]);
}

export function getViewportCenter(bounds: L.LatLngBounds | null): { lat: number; lng: number } | null {
  if (!bounds) return null;
  const center = bounds.getCenter();
  return { lat: center.lat, lng: center.lng };
}
