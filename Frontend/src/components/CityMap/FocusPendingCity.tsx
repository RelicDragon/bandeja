import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { City } from '@/types';

const FOCUS_ZOOM = 11;

export function FocusPendingCity({
  pendingCityId,
  cities,
}: {
  pendingCityId: string | null | undefined;
  cities: Array<Pick<City, 'id' | 'latitude' | 'longitude'>>;
}) {
  const map = useMap();
  const citiesRef = useRef(cities);
  citiesRef.current = cities;

  useEffect(() => {
    if (!pendingCityId) return;
    const city = citiesRef.current.find((c) => c.id === pendingCityId);
    if (city?.latitude == null || city?.longitude == null) return;
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    map.flyTo([city.latitude, city.longitude], zoom, { animate: true, duration: 0.6 });
  }, [map, pendingCityId]);

  return null;
}
