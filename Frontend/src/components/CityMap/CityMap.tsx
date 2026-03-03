import { useMemo, useEffect, useState, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { LatLngBoundsLiteral } from 'leaflet';
import type { City } from '@/types';
import type { ClubMapItem } from '@/api/clubs';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { appApi } from '@/api/app';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { getTelUrl } from '@/utils/telUrl';
import { useMapViewport } from './useMapViewport';
import { getClubHouseIcon, getCityMarkerIcon, getUserLocationIcon } from './MarkerIcons';
import { ExternalLink, Phone } from 'lucide-react';
import { useDebounce } from './useDebounce';
import { SpatialIndex } from './spatialIndex';
import { useVirtualizedMarkers, getViewportCenter } from './VirtualizedMarkers';
import 'leaflet/dist/leaflet.css';

const LOCATION_RADIUS_KM = 50;
const DEG_PER_KM = 1 / 111;
const LOCATION_BOUNDS_DELTA = LOCATION_RADIUS_KM * DEG_PER_KM;
const MAX_VIEW_KM = 200;
const HALF_VIEW_DEG = (MAX_VIEW_KM / 2) * DEG_PER_KM;

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
const CLUSTER_ZOOM_THRESHOLD = 13;
const VIEWPORT_DEBOUNCE_MS = 150;
const VIEWPORT_PADDING = 0.15;
const MAX_CLUSTER_MARKERS = 2500;

const clusterIconCache = new Map<string, L.DivIcon>();

function createClusterIcon(cluster: { getChildCount(): number }) {
  const count = cluster.getChildCount();
  let size = 40;
  let className = 'custom-cluster-small';
  
  if (count >= 100) {
    size = 56;
    className = 'custom-cluster-large';
  } else if (count >= 20) {
    size = 48;
    className = 'custom-cluster-medium';
  }

  const cacheKey = `${className}-${count}`;
  if (clusterIconCache.has(cacheKey)) {
    return clusterIconCache.get(cacheKey)!;
  }

  const icon = L.divIcon({
    html: `<div class="${className}">
      <div class="cluster-inner">
        <span>${count}</span>
      </div>
    </div>`,
    className: 'custom-cluster-icon',
    iconSize: [size, size],
  });

  if (clusterIconCache.size < 100) {
    clusterIconCache.set(cacheKey, icon);
  }

  return icon;
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

export type MapLayer = 'cities' | 'clubs';

export interface CityMapProps {
  mapLayer: MapLayer;
  cities: City[];
  clubs?: ClubMapItem[];
  currentCityId?: string;
  pendingCityId?: string | null;
  onClubClick?: (cityId: string) => void;
  onCityClick?: (cityId: string) => void;
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

function ViewportHandler({ onViewportChange }: { onViewportChange: (bounds: L.LatLngBounds, zoom: number) => void }) {
  const { bounds, zoom } = useMapViewport();
  
  useEffect(() => {
    if (bounds) {
      onViewportChange(bounds, zoom);
    }
  }, [bounds, zoom, onViewportChange]);

  return null;
}

function HideAttribution() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer().querySelector('.leaflet-control-attribution');
    if (el) (el as HTMLElement).style.display = 'none';
    return () => {
      if (el) (el as HTMLElement).style.display = '';
    };
  }, [map]);
  return null;
}

interface ClubMarkerProps {
  club: ClubMapItem;
  onClubClick?: (cityId: string) => void;
}

const ClubMarker = memo(({ 
  club, 
  onClubClick 
}: ClubMarkerProps) => {
  const { t } = useTranslation();
  const { translateCity, translateCountry } = useTranslatedGeo();
  
  const handleClick = useCallback((e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onClubClick?.(club.cityId);
    e.target.openPopup();
  }, [club.cityId, onClubClick]);
  
  const cityDisplay = translateCity(club.cityId, club.cityName, club.country);
  const countryDisplay = translateCountry(club.country);
  
  const hasWebsite = !!club.website?.trim();
  const hasPhone = !!(club.phone?.trim() && getTelUrl(club.phone.trim()));
  return (
    <Marker
      position={[club.latitude, club.longitude]}
      icon={getClubHouseIcon()}
      eventHandlers={{ click: handleClick }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-semibold text-gray-900">{club.name}</div>
          <div className="text-gray-500 text-xs mt-0.5">{cityDisplay}, {countryDisplay}</div>
          <div className="text-gray-600 mt-0.5">{t('club.courtsCount', { count: club.courtsCount })}</div>
          {(hasWebsite || hasPhone) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-100">
              {hasWebsite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternalUrl(club.website!);
                  }}
                  className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  <ExternalLink size={14} />
                  {t('common.openWebsite')}
                </button>
              )}
              {hasPhone && (
                <a
                  href={getTelUrl(club.phone!.trim())!}
                  className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone size={14} />
                  {t('common.call')}
                </a>
              )}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}, (prev, next) => 
  prev.club.id === next.club.id && 
  prev.club.latitude === next.club.latitude &&
  prev.club.longitude === next.club.longitude &&
  prev.club.website === next.club.website &&
  prev.club.phone === next.club.phone &&
  prev.onClubClick === next.onClubClick
);

interface CityMarkerProps {
  city: City;
  onCityClick?: (cityId: string) => void;
}

const CityMarker = memo(({ city, onCityClick }: CityMarkerProps) => {
  const { t } = useTranslation();
  const { translateCity, translateCountry } = useTranslatedGeo();
  const handleClick = useCallback((e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onCityClick?.(city.id);
    e.target.openPopup();
  }, [city.id, onCityClick]);
  const cityDisplay = translateCity(city.id, city.name, city.country);
  const countryDisplay = translateCountry(city.country);
  return (
    <Marker
      position={[city.latitude!, city.longitude!]}
      icon={getCityMarkerIcon()}
      eventHandlers={{ click: handleClick }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-semibold text-gray-900">{cityDisplay}</div>
          <div className="text-gray-500 text-xs mt-0.5">{countryDisplay}</div>
          {city.clubsCount != null && (
            <div className="text-gray-600 mt-0.5">{t('city.clubsCount', { count: city.clubsCount })}</div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}, (prev, next) => prev.city.id === next.city.id && prev.onCityClick === next.onCityClick);

export function CityMap({ mapLayer, cities = [], clubs = [], currentCityId, onClubClick, onCityClick, onMapClick, className = '', userLocation = null, userLocationApproximate = false }: CityMapProps) {
  const { t } = useTranslation();
  const [resolvedLocation, setResolvedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);
  const [viewportZoom, setViewportZoom] = useState<number>(DEFAULT_ZOOM);

  const debouncedViewportBounds = useDebounce(viewportBounds, VIEWPORT_DEBOUNCE_MS);
  const debouncedViewportZoom = useDebounce(viewportZoom, VIEWPORT_DEBOUNCE_MS);

  useEffect(() => {
    let cancelled = false;
    appApi.getLocation().then((loc) => {
      if (cancelled || !loc) return;
      setResolvedLocation(loc);
    });
    return () => { cancelled = true; };
  }, []);

  const effectiveUserLocation = userLocation ?? resolvedLocation;

  const citiesWithCoords = useMemo(
    () => cities.filter((c): c is City & { latitude: number; longitude: number } => c.latitude != null && c.longitude != null),
    [cities]
  );

  const citiesBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (citiesWithCoords.length === 0) return null;
    let minLat = citiesWithCoords[0].latitude;
    let maxLat = citiesWithCoords[0].latitude;
    let minLng = citiesWithCoords[0].longitude;
    let maxLng = citiesWithCoords[0].longitude;
    for (let i = 1; i < citiesWithCoords.length; i++) {
      const c = citiesWithCoords[i];
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLng) minLng = c.longitude;
      if (c.longitude > maxLng) maxLng = c.longitude;
    }
    return [[minLat, minLng], [maxLat, maxLng]] as LatLngBoundsLiteral;
  }, [citiesWithCoords]);

  const spatialIndex = useMemo(() => {
    if (clubs.length === 0) return null;
    return new SpatialIndex(clubs);
  }, [clubs]);

  const userLocationBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!effectiveUserLocation) return null;
    return [
      [effectiveUserLocation.latitude - LOCATION_BOUNDS_DELTA, effectiveUserLocation.longitude - LOCATION_BOUNDS_DELTA],
      [effectiveUserLocation.latitude + LOCATION_BOUNDS_DELTA, effectiveUserLocation.longitude + LOCATION_BOUNDS_DELTA],
    ] as LatLngBoundsLiteral;
  }, [effectiveUserLocation]);

  const clubsBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!spatialIndex) return null;
    const b = spatialIndex.getBounds();
    return [
      [b.minLat, b.minLng],
      [b.maxLat, b.maxLng],
    ] as LatLngBoundsLiteral;
  }, [spatialIndex]);

  const cityBoundsMap = useMemo(() => {
    const m = new Map<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }>();
    for (let i = 0; i < clubs.length; i++) {
      const c = clubs[i];
      const lat = c.latitude;
      const lng = c.longitude;
      const existing = m.get(c.cityId);
      if (!existing) {
        m.set(c.cityId, { minLat: lat, maxLat: lat, minLng: lng, maxLng: lng });
      } else {
        if (lat < existing.minLat) existing.minLat = lat;
        if (lat > existing.maxLat) existing.maxLat = lat;
        if (lng < existing.minLng) existing.minLng = lng;
        if (lng > existing.maxLng) existing.maxLng = lng;
      }
    }
    return m;
  }, [clubs]);

  const selectedCityBounds: LatLngBoundsLiteral | null = useMemo(() => {
    if (!currentCityId) return null;
    if (mapLayer === 'cities') {
      const city = citiesWithCoords.find((c) => c.id === currentCityId);
      if (!city) return null;
      return [
        [city.latitude - HALF_VIEW_DEG, city.longitude - HALF_VIEW_DEG],
        [city.latitude + HALF_VIEW_DEG, city.longitude + HALF_VIEW_DEG],
      ] as LatLngBoundsLiteral;
    }
    const b = cityBoundsMap.get(currentCityId);
    if (!b) return null;
    const centerLat = (b.minLat + b.maxLat) / 2;
    const centerLng = (b.minLng + b.maxLng) / 2;
    return [
      [centerLat - HALF_VIEW_DEG, centerLng - HALF_VIEW_DEG],
      [centerLat + HALF_VIEW_DEG, centerLng + HALF_VIEW_DEG],
    ] as LatLngBoundsLiteral;
  }, [currentCityId, cityBoundsMap, mapLayer, citiesWithCoords]);

  const centerOfAllBoundsClubs: LatLngBoundsLiteral | null = useMemo(() => {
    if (!clubsBounds) return null;
    const [[south, west], [north, east]] = clubsBounds;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    return [
      [centerLat - HALF_VIEW_DEG, centerLng - HALF_VIEW_DEG],
      [centerLat + HALF_VIEW_DEG, centerLng + HALF_VIEW_DEG],
    ] as LatLngBoundsLiteral;
  }, [clubsBounds]);

  const centerOfAllBoundsCities: LatLngBoundsLiteral | null = useMemo(() => {
    if (!citiesBounds) return null;
    const [[south, west], [north, east]] = citiesBounds;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    return [
      [centerLat - HALF_VIEW_DEG, centerLng - HALF_VIEW_DEG],
      [centerLat + HALF_VIEW_DEG, centerLng + HALF_VIEW_DEG],
    ] as LatLngBoundsLiteral;
  }, [citiesBounds]);

  const centerOfAllBounds = mapLayer === 'cities' ? centerOfAllBoundsCities : centerOfAllBoundsClubs;
  const bounds: LatLngBoundsLiteral | null =
    userLocationBounds ?? selectedCityBounds ?? centerOfAllBounds;

  const shouldCluster = debouncedViewportZoom < CLUSTER_ZOOM_THRESHOLD;

  const viewportFilteredClubs = useMemo(() => {
    if (!spatialIndex || !debouncedViewportBounds) return clubs;
    const padded = debouncedViewportBounds.pad(VIEWPORT_PADDING);
    const sw = padded.getSouthWest();
    const ne = padded.getNorthEast();
    return spatialIndex.query(sw.lat, ne.lat, sw.lng, ne.lng);
  }, [clubs, spatialIndex, debouncedViewportBounds]);

  const viewportFilteredCities = useMemo(() => {
    if (!debouncedViewportBounds || citiesWithCoords.length === 0) return citiesWithCoords;
    const padded = debouncedViewportBounds.pad(VIEWPORT_PADDING);
    const sw = padded.getSouthWest();
    const ne = padded.getNorthEast();
    return citiesWithCoords.filter(
      (c) => c.latitude >= sw.lat && c.latitude <= ne.lat && c.longitude >= sw.lng && c.longitude <= ne.lng
    );
  }, [citiesWithCoords, debouncedViewportBounds]);

  const viewportClubsForCluster = useMemo(
    () => (viewportFilteredClubs.length <= MAX_CLUSTER_MARKERS ? viewportFilteredClubs : viewportFilteredClubs.slice(0, MAX_CLUSTER_MARKERS)),
    [viewportFilteredClubs]
  );

  const viewportCitiesForCluster = useMemo(
    () => (viewportFilteredCities.length <= MAX_CLUSTER_MARKERS ? viewportFilteredCities : viewportFilteredCities.slice(0, MAX_CLUSTER_MARKERS)),
    [viewportFilteredCities]
  );

  const viewportCenter = useMemo(
    () => getViewportCenter(debouncedViewportBounds),
    [debouncedViewportBounds]
  );

  const virtualizedClubs = useVirtualizedMarkers({
    clubs: shouldCluster ? viewportClubsForCluster : viewportFilteredClubs,
    viewportCenter,
    zoom: debouncedViewportZoom,
  });

  const visibleClubs = shouldCluster ? viewportClubsForCluster : virtualizedClubs;
  const visibleCities = shouldCluster ? viewportCitiesForCluster : viewportFilteredCities.length <= MAX_CLUSTER_MARKERS ? viewportFilteredCities : viewportFilteredCities.slice(0, MAX_CLUSTER_MARKERS);

  const handleViewportChange = useCallback((bounds: L.LatLngBounds, zoom: number) => {
    setViewportBounds(bounds);
    setViewportZoom(zoom);
  }, []);

  const handleUserLocationClick = useCallback((e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
  }, []);

  const isEmpty = mapLayer === 'cities'
    ? citiesWithCoords.length === 0 && !effectiveUserLocation
    : clubs.length === 0 && !effectiveUserLocation;

  if (isEmpty) {
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
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds bounds={bounds} />
        <HideAttribution />
        <MapClickHandler onMapClick={onMapClick} />
        <ViewportHandler onViewportChange={handleViewportChange} />
        {effectiveUserLocation && (
          <Marker
            position={[effectiveUserLocation.latitude, effectiveUserLocation.longitude]}
            icon={getUserLocationIcon()}
            eventHandlers={{ click: handleUserLocationClick }}
          >
            <Popup>
              <div className="text-sm font-medium text-gray-900">
                {userLocation == null ? t('city.approximateLocation') : (userLocationApproximate ? t('city.approximateLocation') : t('city.yourLocation'))}
              </div>
            </Popup>
          </Marker>
        )}
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={80}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          disableClusteringAtZoom={CLUSTER_ZOOM_THRESHOLD}
          iconCreateFunction={createClusterIcon}
          removeOutsideVisibleBounds={true}
        >
          {mapLayer === 'cities'
            ? visibleCities.map((city) => (
                <CityMarker key={`city-${city.id}`} city={city} onCityClick={onCityClick} />
              ))
            : visibleClubs.map((club) => (
                <ClubMarker key={`club-${club.id}`} club={club} onClubClick={onClubClick} />
              ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
