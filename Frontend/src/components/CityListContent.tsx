import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Map, List, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { City } from '@/types';
import type { CountryWithClubs } from '@/hooks/useCityList';
import { CityMap } from '@/components/CityMap';
import { CountryListItem } from '@/components/CityList/CountryListItem';
import { CityListItem } from '@/components/CityList/CityListItem';
import { VirtualizedList } from '@/components/CityList/VirtualizedList';
import { useGeolocation } from '@/hooks/useGeolocation';
import { findNearestCity } from '@/utils/nearestCity';
import { useGeoReady } from '@/hooks/useGeoReady';
import { getCountryDisplayName, getCountrySearchNames, getCitySearchNames } from '@/utils/geoTranslations';
import { appApi } from '@/api/app';
import { clubsApi, type ClubMapItem } from '@/api/clubs';

export interface CityListContentProps {
  view: 'country' | 'city';
  search: string;
  setSearch: (v: string) => void;
  loading: boolean;
  error: string;
  filteredCountries: CountryWithClubs[];
  filteredCitiesForCountry: City[];
  allCities?: City[];
  selectedCountry: string | null;
  selectCountry: (country: string) => void;
  backToCountries: () => void;
  currentCityId?: string;
  onCityClick: (cityId: string) => void;
  isSelectorMode?: boolean;
  showNoCityOption?: boolean;
  selectedId?: string;
  submitting?: boolean;
  showError?: boolean;
  showingLoading?: boolean;
  citiesCount?: number;
  className?: string;
  contentClassName?: string;
  onLocationError?: (message: string) => void;
}

const LOCATION_ERROR_KEYS: Record<string, string> = {
  permission_denied: 'auth.locationDenied',
  position_unavailable: 'auth.locationUnavailable',
  timeout: 'auth.locationTimeout',
  unsupported: 'auth.locationUnsupported',
};

export const CityListContent = ({
  view,
  search,
  setSearch,
  loading,
  error,
  filteredCountries,
  filteredCitiesForCountry,
  allCities,
  selectedCountry,
  selectCountry,
  backToCountries,
  currentCityId,
  onCityClick,
  isSelectorMode = false,
  showNoCityOption = false,
  selectedId,
  submitting = false,
  showError = true,
  showingLoading,
  citiesCount = 0,
  className = '',
  contentClassName = '',
  onLocationError,
}: CityListContentProps) => {
  const { t, i18n } = useTranslation();
  useGeoReady();
  const isLoading = showingLoading ?? loading;
  const selectedCityRef = useRef<HTMLButtonElement>(null);
  const scrollTargetRef = useRef<HTMLButtonElement>(null);
  const lastScrolledToSelectedIdRef = useRef<string | null>(null);
  const userLocationTargetRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const skipListTransitionRef = useRef(false);
  const [allowTransition, setAllowTransition] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [clubs, setClubs] = useState<ClubMapItem[]>([]);
  const [pendingCityId, setPendingCityId] = useState<string | null>(null);
  const [scrollToCityId, setScrollToCityId] = useState<string | null>(null);
  const [nearestCityIdInList, setNearestCityIdInList] = useState<string | null>(null);
  const [userLocationTarget, setUserLocationTarget] = useState<{ latitude: number; longitude: number } | null>(null);
  userLocationTargetRef.current = userLocationTarget;
  const [userLocationIsApproximate, setUserLocationIsApproximate] = useState(false);
  const [locating, setLocating] = useState(false);
  const { getPosition } = useGeolocation();

  useEffect(() => {
    if (!showMap) {
      setPendingCityId(null);
      setUserLocationTarget(null);
      setUserLocationIsApproximate(false);
      return;
    }
    let cancelled = false;
    const loc = userLocationTargetRef.current;
    const bbox =
      loc != null
        ? {
            minLat: loc.latitude - 2,
            maxLat: loc.latitude + 2,
            minLng: loc.longitude - 2,
            maxLng: loc.longitude + 2,
          }
        : undefined;
    clubsApi.getForMap(bbox).then((data) => {
      if (!cancelled && data) setClubs(Array.isArray(data) ? data : []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showMap]);

  const mapCities = useMemo(
    () => allCities ?? (view === 'city' ? filteredCitiesForCountry : filteredCountries.flatMap((f) => f.cities)),
    [allCities, view, filteredCitiesForCountry, filteredCountries]
  );

  const searchLower = search.trim().length >= 2 ? search.trim().toLowerCase() : '';
  const filteredMapCities = useMemo(() => {
    if (!searchLower) return mapCities;
    return mapCities.filter((c) => {
      const countryNames = getCountrySearchNames(c.country);
      const countryMatch = [countryNames.en, countryNames.es, countryNames.ru, countryNames.sr, countryNames.native]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(searchLower));
      if (countryMatch) return true;
      const cityNames = getCitySearchNames(c.id, c.name, c.country);
      const cityMatch = [cityNames.en, cityNames.es, cityNames.ru, cityNames.sr, cityNames.native]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(searchLower));
      if (cityMatch) return true;
      return (
        c.country.toLowerCase().includes(searchLower) ||
        c.name.toLowerCase().includes(searchLower) ||
        (c.administrativeArea?.toLowerCase().includes(searchLower) ?? false) ||
        (c.subAdministrativeArea?.toLowerCase().includes(searchLower) ?? false)
      );
    });
  }, [mapCities, searchLower]);

  const displaySelectedCountry = selectedCountry
    ? getCountryDisplayName(selectedCountry, i18n.language)
    : '';

  const handleWhereAmI = async () => {
    setLocating(true);
    try {
      let lat: number;
      let lon: number;
      const ipLoc = await appApi.getLocation();
      if (ipLoc) {
        lat = ipLoc.latitude;
        lon = ipLoc.longitude;
        setUserLocationTarget(ipLoc);
        setUserLocationIsApproximate(true);
      } else {
        const posResult = await getPosition();
        if (posResult.position) {
          lat = posResult.position.latitude;
          lon = posResult.position.longitude;
          setUserLocationTarget({ latitude: lat, longitude: lon });
          setUserLocationIsApproximate(false);
        } else {
          const key = LOCATION_ERROR_KEYS[posResult.errorCode ?? ''] ?? 'auth.locationUnavailable';
          onLocationError?.(t(key));
          return;
        }
      }
      const nearest = findNearestCity(mapCities, lat, lon);
      if (nearest) {
        if (showMap) {
          setPendingCityId(nearest.id);
        } else {
          skipListTransitionRef.current = true;
          setNearestCityIdInList(nearest.id);
          selectCountry(nearest.country);
          setScrollToCityId(nearest.id);
        }
      } else {
        onLocationError?.(t('auth.noCityNearby'));
      }
    } catch {
      onLocationError?.(t('auth.locationUnavailable'));
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (pendingCityId && !filteredMapCities.some((c) => c.id === pendingCityId)) setPendingCityId(null);
  }, [pendingCityId, filteredMapCities]);

  useEffect(() => {
    if (scrollToCityId && view === 'city' && !filteredCitiesForCountry.some((c) => c.id === scrollToCityId)) {
      setScrollToCityId(null);
    }
  }, [scrollToCityId, view, filteredCitiesForCountry]);

  useEffect(() => {
    if (nearestCityIdInList && !filteredCitiesForCountry.some((c) => c.id === nearestCityIdInList)) {
      setNearestCityIdInList(null);
    }
  }, [nearestCityIdInList, filteredCitiesForCountry]);

  useEffect(() => {
    if (view === 'country') lastScrolledToSelectedIdRef.current = null;
    else if (view === 'city') skipListTransitionRef.current = false;
  }, [view]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAllowTransition(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (filteredCitiesForCountry.length >= 40) return;
    if (view === 'city' && (currentCityId || selectedId) && selectedCityRef.current) {
      const raf = requestAnimationFrame(() => {
        selectedCityRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [view, currentCityId, selectedId, filteredCitiesForCountry.length]);

  useEffect(() => {
    if (filteredCitiesForCountry.length >= 40) return;
    const canScroll = scrollToCityId && view === 'city' && filteredCitiesForCountry.some((c) => c.id === scrollToCityId);
    if (!canScroll) return;
    const raf = requestAnimationFrame(() => {
      scrollTargetRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setScrollToCityId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToCityId, view, filteredCitiesForCountry]);

  const searchPlaceholder = view === 'country' ? t('city.searchCountries') : t('city.searchCities');
  const selectedCityId = isSelectorMode ? selectedId : currentCityId;
  const useVirtualizedCityList = filteredCitiesForCountry.length >= 40;
  const idxForScrollToCity = scrollToCityId != null ? filteredCitiesForCountry.findIndex((c) => c.id === scrollToCityId) : -1;
  const idxForSelected =
    view === 'city' &&
    selectedCityId &&
    selectedCityId !== lastScrolledToSelectedIdRef.current
      ? filteredCitiesForCountry.findIndex((c) => c.id === selectedCityId)
      : -1;
  const cityScrollToIndex =
    idxForScrollToCity >= 0
      ? idxForScrollToCity
      : idxForSelected >= 0
        ? (() => {
            lastScrolledToSelectedIdRef.current = selectedCityId ?? null;
            return idxForSelected;
          })()
        : -1;
  const countryOfSelected = useMemo(
    () => (selectedCityId ? filteredCountries.find((item) => item.cities.some((c) => c.id === selectedCityId)) ?? null : null),
    [selectedCityId, filteredCountries]
  );
  const pendingCityName = useMemo(
    () =>
      pendingCityId
        ? filteredMapCities.find((c) => c.id === pendingCityId)?.name ?? clubs.find((c) => c.cityId === pendingCityId)?.cityName ?? null
        : null,
    [pendingCityId, filteredMapCities, clubs]
  );
  const handleScrolledToCityIndex = useCallback(() => setScrollToCityId(null), []);
  const handleClubClick = useCallback((id: string) => setPendingCityId(id), []);
  const handleMapClick = useCallback(() => setPendingCityId(null), []);

  return (
    <div className={`space-y-2 p-1 pt-2 min-h-0 flex flex-col flex-1 overflow-hidden min-w-0 ${className}`}>
      {showError && error && (
        <div className="shrink-0 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}
      {!isLoading && (
        <div className="shrink-0 flex items-center gap-2 min-w-0">
          {view === 'city' && !showMap && selectedCountry && (
            <button
              type="button"
              onClick={backToCountries}
              className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline min-w-0 overflow-hidden truncate"
            >
              <span className="truncate">← {displaySelectedCountry}</span>
            </button>
          )}
          <div className="flex-1 min-w-0" />
          <button
            type="button"
            onClick={handleWhereAmI}
            disabled={locating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shrink-0 mr-2 disabled:opacity-60"
          >
            {locating ? (
              <span className="w-4 h-4 shrink-0 border-2 border-primary-200 dark:border-primary-800 border-t-primary-500 rounded-full animate-spin" />
            ) : (
              <MapPin className="w-4 h-4 shrink-0" strokeWidth={2.25} />
            )}
            <span className="text-sm font-medium">{t('city.whereAmI')}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/80 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 shadow-sm transition-all duration-200 focus:ring-2 focus:ring-primary-500/30 focus:outline-none shrink-0"
          >
            {showMap ? (
              <>
                <List className="w-4 h-4 shrink-0" strokeWidth={2.25} />
                <span className="text-sm font-medium">{t('city.list')}</span>
              </>
            ) : (
              <>
                <Map className="w-4 h-4 shrink-0" strokeWidth={2.25} />
                <span className="text-sm font-medium">{t('city.map')}</span>
              </>
            )}
          </button>
        </div>
      )}
      {!showMap && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          disabled={isLoading}
          className="w-full min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none transition-shadow disabled:opacity-60 shrink-0"
        />
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 flex-1 min-h-[8rem] shrink-0">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 dark:border-primary-800 border-t-primary-500" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden w-full flex flex-col">
          <div
            className={`flex flex-1 min-h-0 w-full ${allowTransition ? 'transition-transform duration-300 ease-out' : ''}`}
            style={{ width: '200%', transform: showMap ? 'translateX(-50%)' : 'translateX(0)' }}
          >
            <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-hidden flex flex-col">
              <div
                className={`flex flex-1 min-h-0 w-full ${allowTransition && !skipListTransitionRef.current ? 'transition-transform duration-300 ease-out' : ''}`}
                style={{ width: '200%', transform: view === 'city' ? 'translateX(-50%)' : 'translateX(0)' }}
              >
                <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-hidden flex flex-col">
              {filteredCountries.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
                  {citiesCount === 0 ? t('createLeague.noCitiesAvailable') : t('common.noResults')}
                </p>
              ) : (
                <VirtualizedList
                  items={filteredCountries}
                  getItemKey={(item) => item.country}
                  className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1"
                  contentClassName={`space-y-1.5 ${contentClassName}`}
                  renderItem={(item) => (
                    <CountryListItem
                      item={item}
                      isSelected={countryOfSelected?.country === item.country}
                      onSelect={selectCountry}
                    />
                  )}
                />
              )}
                </div>
                <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-hidden flex flex-col">
                  {showNoCityOption && isSelectorMode && (
                <button
                  onClick={() => onCityClick('')}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all mb-1.5 ${
                    !selectedId
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="font-medium text-sm">{t('createLeague.noCity')}</span>
                </button>
              )}
              {filteredCitiesForCountry.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">{t('common.noResults')}</p>
              ) : useVirtualizedCityList ? (
                <VirtualizedList
                  items={filteredCitiesForCountry}
                  getItemKey={(item) => item.id}
                  estimateSize={72}
                  scrollToIndex={cityScrollToIndex >= 0 ? cityScrollToIndex : null}
                  onScrolledToIndex={handleScrolledToCityIndex}
                  className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1"
                  contentClassName={`space-y-1.5 p-1 ${contentClassName}`}
                  renderItem={(city) => (
                    <CityListItem
                      city={city}
                      isSelected={city.id === selectedCityId}
                      isNearest={city.id === nearestCityIdInList}
                      isScrollTarget={false}
                      submitting={submitting}
                      isSelectorMode={isSelectorMode}
                      selectedCityRef={selectedCityRef}
                      scrollTargetRef={scrollTargetRef}
                      onSelect={onCityClick}
                    />
                  )}
                />
              ) : (
                <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-1.5 p-1 ${contentClassName}`}>
                  {filteredCitiesForCountry.map((city) => (
                    <CityListItem
                      key={city.id}
                      city={city}
                      isSelected={city.id === selectedCityId}
                      isNearest={city.id === nearestCityIdInList}
                      isScrollTarget={city.id === scrollToCityId}
                      submitting={submitting}
                      isSelectorMode={isSelectorMode}
                      selectedCityRef={selectedCityRef}
                      scrollTargetRef={scrollTargetRef}
                      onSelect={onCityClick}
                    />
                  ))}
                </div>
              )}
                </div>
              </div>
            </div>
            <div className="w-1/2 min-w-0 shrink-0 min-h-0 flex flex-col">
              {showMap ? (
                <>
                  <CityMap
                    cities={filteredMapCities}
                    clubs={clubs}
                    currentCityId={selectedCityId}
                    pendingCityId={pendingCityId}
                    onClubClick={handleClubClick}
                    onMapClick={handleMapClick}
                    className="flex-1 min-h-0"
                    userLocation={userLocationTarget}
                    userLocationApproximate={userLocationIsApproximate}
                  />
                  <AnimatePresence>
                    {pendingCityId && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0 pt-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onCityClick(pendingCityId);
                            setPendingCityId(null);
                          }}
                          className="w-full py-2.5 px-8 rounded-xl text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 focus:ring-2 focus:ring-primary-500/30 focus:outline-none transition-colors"
                        >
                          {pendingCityName ? t('city.selectCityName', { name: pendingCityName }) : t('city.selectCity')}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="flex-1 min-h-[280px]" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
