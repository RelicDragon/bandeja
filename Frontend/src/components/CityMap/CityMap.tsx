import { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
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

function cityStarIcon(selected: boolean): L.DivIcon {
  const ring = selected ? '#0ea5e9' : '#64748b';
  return L.divIcon({
    className: `city-star-marker ${selected ? 'city-star-marker--selected' : ''}`,
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid ${ring};border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);"><svg width="14" height="14" viewBox="0 0 24 24" fill="${ring}" stroke="${ring}" stroke-width="1.5" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

const CLUB_HOUSE_ICON = L.divIcon({
  className: 'club-house-marker',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#0ea5e9;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.25);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const USER_LOCATION_ICON = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;"><svg width="28" height="28" viewBox="0 0 24 24" fill="#4285f4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

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
  onClubClick?: (cityId: string) => void;
  onMapClick?: () => void;
  className?: string;
  userLocation?: { latitude: number; longitude: number } | null;
  userLocationApproximate?: boolean;
}

function MapClickHandler({ onMapClick }: { onMapClick?: () => void }) {
  useMapEvents({
    click: () => onMapClick?.(),
  });
  return null;
}

export function CityMap({ cities, clubs = [], currentCityId, pendingCityId, onCityClick, onClubClick, onMapClick, className = '', userLocation = null, userLocationApproximate = false }: CityMapProps) {
  const { t } = useTranslation();
  const [resolvedLocation, setResolvedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    appApi.getLocation().then((loc) => {
      if (cancelled || !loc) return;
      setResolvedLocation(loc);
    });
    return () => { cancelled = true; };
  }, []);

  const effectiveUserLocation = userLocation ?? resolvedLocation;

  const userLocationBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!effectiveUserLocation) return null;
    return [
      [effectiveUserLocation.latitude - LOCATION_BOUNDS_DELTA, effectiveUserLocation.longitude - LOCATION_BOUNDS_DELTA],
      [effectiveUserLocation.latitude + LOCATION_BOUNDS_DELTA, effectiveUserLocation.longitude + LOCATION_BOUNDS_DELTA],
    ] as LatLngBoundsLiteral;
  }, [effectiveUserLocation]);

  const withCoords = useMemo(
    () => cities.filter((c): c is City & { latitude: number; longitude: number } => c.latitude != null && c.longitude != null),
    [cities]
  );

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
    userLocationBounds ?? selectedCityBounds ?? centerOfAllBounds;

  if (withCoords.length === 0 && clubs.length === 0 && !effectiveUserLocation) {
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
        {effectiveUserLocation && (
          <Marker
            position={[effectiveUserLocation.latitude, effectiveUserLocation.longitude]}
            icon={USER_LOCATION_ICON}
            eventHandlers={{
              click: (e: L.LeafletMouseEvent) => L.DomEvent.stopPropagation(e),
            }}
          >
            <Popup>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {userLocation == null ? t('city.approximateLocation') : (userLocationApproximate ? t('city.approximateLocation') : t('city.yourLocation'))}
              </div>
            </Popup>
          </Marker>
        )}
        {withCoords.map((city) => {
          const highlightedId = pendingCityId ?? currentCityId;
          const selected = city.id === highlightedId;
          return (
            <Marker
              key={city.id}
              position={[city.latitude, city.longitude]}
              icon={cityStarIcon(selected)}
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
            </Marker>
          );
        })}
        {clubs.map((club) => (
          <Marker
            key={club.id}
            position={[club.latitude, club.longitude]}
            icon={CLUB_HOUSE_ICON}
            eventHandlers={{
              click: (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
                onClubClick?.(club.cityId);
              },
            }}
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
