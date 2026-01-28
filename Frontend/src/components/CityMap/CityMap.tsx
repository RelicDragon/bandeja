import { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsLiteral } from 'leaflet';
import type { City } from '@/types';
import type { ClubMapItem } from '@/api/clubs';
import { appApi } from '@/api/app';
import 'leaflet/dist/leaflet.css';

const LOCATION_RADIUS_KM = 50;
const DEG_PER_KM = 1 / 111;
const LOCATION_BOUNDS_DELTA = LOCATION_RADIUS_KM * DEG_PER_KM;
const MAX_VIEW_KM = 200;
const HALF_VIEW_DEG = (MAX_VIEW_KM / 2) * DEG_PER_KM;

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
const MIN_RADIUS = 8;
const MAX_RADIUS = 28;

const CLUB_HOUSE_ICON = L.divIcon({
  className: 'club-house-marker',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#0ea5e9;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.25);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

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

function clampBoundsToMaxKm(bounds: LatLngBoundsLiteral, maxKm: number): LatLngBoundsLiteral {
  const [[south, west], [north, east]] = bounds;
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const latSpanKm = (north - south) * 111;
  const lngSpanKm = (east - west) * 111;
  if (latSpanKm <= maxKm && lngSpanKm <= maxKm) return bounds;
  const halfDeg = (maxKm / 2) * DEG_PER_KM;
  return [
    [centerLat - halfDeg, centerLng - halfDeg],
    [centerLat + halfDeg, centerLng + halfDeg],
  ];
}

function FitBounds({ bounds }: { bounds: LatLngBoundsLiteral | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    const clamped = clampBoundsToMaxKm(bounds, MAX_VIEW_KM);
    map.fitBounds(clamped, { padding: [24, 24], maxZoom: 12, animate: true });
  }, [map, bounds]);
  return null;
}

export interface CityMapProps {
  cities: City[];
  clubs?: ClubMapItem[];
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

export function CityMap({ cities, clubs = [], currentCityId, pendingCityId, onCityClick, onMapClick, className = '', userLocation = null }: CityMapProps) {
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

  const allPoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [...withCoords.map((c) => ({ lat: c.latitude!, lng: c.longitude! })), ...clubs.map((c) => ({ lat: c.latitude, lng: c.longitude }))];
    return pts;
  }, [withCoords, clubs]);

  const citiesBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (allPoints.length === 0) return null;
    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ] as LatLngBoundsLiteral;
  }, [allPoints]);

  const selectedCityBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!currentCityId || withCoords.length === 0) return null;
    const city = withCoords.find((c) => c.id === currentCityId);
    if (!city) return null;
    return [
      [city.latitude - HALF_VIEW_DEG, city.longitude - HALF_VIEW_DEG],
      [city.latitude + HALF_VIEW_DEG, city.longitude + HALF_VIEW_DEG],
    ] as LatLngBoundsLiteral;
  }, [currentCityId, withCoords]);

  const centerOfAllBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!citiesBounds) return null;
    const [[south, west], [north, east]] = citiesBounds;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    return [
      [centerLat - HALF_VIEW_DEG, centerLng - HALF_VIEW_DEG],
      [centerLat + HALF_VIEW_DEG, centerLng + HALF_VIEW_DEG],
    ] as LatLngBoundsLiteral;
  }, [citiesBounds]);

  const bounds: LatLngBoundsLiteral | null =
    selectedCityBounds ?? userLocationBounds ?? (locationBounds ? clampBoundsToMaxKm(locationBounds, MAX_VIEW_KM) : null) ?? centerOfAllBounds;

  if (withCoords.length === 0 && clubs.length === 0) {
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
        {clubs.map((club) => (
          <Marker
            key={club.id}
            position={[club.latitude, club.longitude]}
            icon={CLUB_HOUSE_ICON}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-gray-900 dark:text-white">{club.name}</div>
                <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{club.cityName}, {club.country}</div>
                <div className="text-gray-600 dark:text-gray-400 mt-0.5">{t('club.courtsCount', { count: club.courtsCount })}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
