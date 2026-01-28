import { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsLiteral } from 'leaflet';
import type { City } from '@/types';
import { appApi } from '@/api/app';
import 'leaflet/dist/leaflet.css';

const LOCATION_RADIUS_KM = 50;
const DEG_PER_KM = 1 / 111;
const LOCATION_BOUNDS_DELTA = LOCATION_RADIUS_KM * DEG_PER_KM;

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
const MIN_RADIUS = 8;
const MAX_RADIUS = 28;

const COUNTRY_COLORS = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#14b8a6',
  '#f97316', '#a855f7', '#06b6d4', '#84cc16', '#e11d48', '#0d9488', '#7c3aed', '#ca8a04',
];

function hashCountry(country: string): number {
  let h = 0;
  for (let i = 0; i < country.length; i++) h = (h * 31 + country.charCodeAt(i)) >>> 0;
  return h % COUNTRY_COLORS.length;
}

function countryColor(country: string): { stroke: string; fill: string } {
  const hex = COUNTRY_COLORS[hashCountry(country)];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { stroke: hex, fill: `rgba(${r},${g},${b},0.5)` };
}

function darken(hex: string, pct: number): string {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - pct)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - pct)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - pct)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function radiusByCountry(cities: Array<{ country: string; clubsCount?: number | null }>): Map<string, number> {
  const byCountry = new Map<string, number>();
  for (const c of cities) {
    const n = Math.max(0, c.clubsCount ?? 0);
    const cur = byCountry.get(c.country) ?? 0;
    if (n > cur) byCountry.set(c.country, n);
  }
  return byCountry;
}

function radiusInCountry(clubsCount: number, maxInCountry: number): number {
  const n = Math.max(0, clubsCount);
  if (maxInCountry <= 0) return MIN_RADIUS;
  const ratio = n / maxInCountry;
  return Math.round(MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS));
}

function FitBounds({ bounds }: { bounds: LatLngBoundsLiteral | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12, animate: true });
  }, [map, bounds]);
  return null;
}

export interface CityMapProps {
  cities: City[];
  currentCityId?: string;
  pendingCityId?: string | null;
  onCityClick?: (cityId: string) => void;
  onMapClick?: () => void;
  className?: string;
  userLocation?: { latitude: number; longitude: number } | null;
}

function MapClickHandler({ onMapClick }: { onMapClick?: () => void }) {
  useMapEvents({
    click: () => onMapClick?.(),
  });
  return null;
}

export function CityMap({ cities, currentCityId, pendingCityId, onCityClick, onMapClick, className = '', userLocation = null }: CityMapProps) {
  const { t } = useTranslation();
  const [locationBounds, setLocationBounds] = useState<LatLngBoundsLiteral | null>(null);

  useEffect(() => {
    let cancelled = false;
    appApi.getLocation().then((loc) => {
      if (cancelled || !loc) return;
      setLocationBounds([
        [loc.latitude - LOCATION_BOUNDS_DELTA, loc.longitude - LOCATION_BOUNDS_DELTA],
        [loc.latitude + LOCATION_BOUNDS_DELTA, loc.longitude + LOCATION_BOUNDS_DELTA],
      ] as LatLngBoundsLiteral);
    });
    return () => { cancelled = true; };
  }, []);

  const userLocationBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!userLocation) return null;
    return [
      [userLocation.latitude - LOCATION_BOUNDS_DELTA, userLocation.longitude - LOCATION_BOUNDS_DELTA],
      [userLocation.latitude + LOCATION_BOUNDS_DELTA, userLocation.longitude + LOCATION_BOUNDS_DELTA],
    ] as LatLngBoundsLiteral;
  }, [userLocation]);

  const withCoords = useMemo(
    () => cities.filter((c): c is City & { latitude: number; longitude: number } => c.latitude != null && c.longitude != null),
    [cities]
  );

  const countryMaxClubs = useMemo(() => radiusByCountry(withCoords), [withCoords]);

  const citiesBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (withCoords.length === 0) return null;
    const lats = withCoords.map((c) => c.latitude!);
    const lngs = withCoords.map((c) => c.longitude!);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ] as LatLngBoundsLiteral;
  }, [withCoords]);

  const bounds: LatLngBoundsLiteral | null = userLocationBounds ?? locationBounds ?? citiesBounds;

  if (withCoords.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm ${className}`}>
        {t('common.noResults')}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full min-h-[280px]"
        scrollWheelZoom={true}
        style={{ minHeight: 280 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds bounds={bounds} />
        <MapClickHandler onMapClick={onMapClick} />
        {withCoords.map((city) => {
          const highlightedId = pendingCityId ?? currentCityId;
          const selected = city.id === highlightedId;
          const maxInCountry = countryMaxClubs.get(city.country) ?? 0;
          const radius = radiusInCountry(city.clubsCount ?? 0, maxInCountry);
          const { stroke, fill } = countryColor(city.country);
          return (
            <CircleMarker
              key={city.id}
              center={[city.latitude, city.longitude]}
              radius={radius}
              pathOptions={{
                color: selected ? darken(stroke, 0.35) : stroke,
                fillColor: fill,
                fillOpacity: 1,
                weight: selected ? 3 : 2,
              }}
              eventHandlers={{
                click: (e: L.LeafletMouseEvent) => {
                  L.DomEvent.stopPropagation(e);
                  onCityClick?.(city.id);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold text-gray-900 dark:text-white">{city.name}</div>
                  <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{city.country}</div>
                  <div className="text-gray-600 dark:text-gray-400 mt-0.5">
                    {t('city.clubsCount', { count: city.clubsCount ?? 0 })}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
