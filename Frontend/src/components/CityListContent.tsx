import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useMemo, useCallback, useDeferredValue } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { City } from '@/types';
import type { CountryWithClubs } from '@/hooks/useCityList';
import { CityMap } from '@/components/CityMap';
import { CountryListItem } from '@/components/CityList/CountryListItem';
import { CityListItem } from '@/components/CityList/CityListItem';
import { ClubListItem } from '@/components/CityList/ClubListItem';
import { UnifiedSearchSectionHeader } from '@/components/CityList/UnifiedSearchSectionHeader';
import { VirtualizedList } from '@/components/CityList/VirtualizedList';
import { CitySelectorSearchChrome } from '@/components/CityList/CitySelectorSearchChrome';
import { CityMapChromeOverlay } from '@/components/CityList/CityMapChromeOverlay';
import { SuggestedCitiesBlock } from '@/components/CityList/SuggestedCitiesBlock';
import {
  CITY_SELECTOR_CHECK,
  citySelectorRowClassName,
} from '@/components/CityList/citySelectorRowStyles';
import { useGeolocation } from '@/hooks/useGeolocation';
import { findNearestCity } from '@/utils/nearestCity';
import { useGeoReady } from '@/hooks/useGeoReady';
import { useCitySelectorClubs } from '@/hooks/useCitySelectorClubs';
import {
  getCountryDisplayName,
  getCountryNativeName,
  getGeoDataLoaded,
} from '@/utils/geoTranslations';
import { CITY_LIST_SEARCH_MIN_LENGTH } from '@/utils/citySearchHelpers';
import { buildUnifiedCitySearchRows, type UnifiedSearchRow } from '@/utils/buildUnifiedCitySearchRows';
import { buildSuggestedCityEntries } from '@/utils/buildSuggestedCityEntries';
import { appApi } from '@/api/app';
import type { ClubMapItem } from '@/api/clubs';

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
}

const LOCATION_HINT_KEYS: Record<string, string> = {
  permission_denied: 'city.locationHintDenied',
  position_unavailable: 'city.locationHintUnavailable',
  timeout: 'city.locationHintTimeout',
  unsupported: 'city.locationHintUnsupported',
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
}: CityListContentProps) => {
  const { t, i18n } = useTranslation();
  const geoReady = useGeoReady();
  const isLoading = showingLoading ?? loading;
  const selectedCityRef = useRef<HTMLButtonElement>(null);
  const scrollTargetRef = useRef<HTMLButtonElement>(null);
  const lastScrolledToSelectedIdRef = useRef<string | null>(null);
  const skipListTransitionRef = useRef(false);
  const nearestPrefetchDoneRef = useRef(false);
  const locateGenRef = useRef(0);
  const showMapRef = useRef(false);
  const ipLocationCacheRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const ipLocationInflightRef = useRef<Promise<{ latitude: number; longitude: number } | null> | null>(null);
  const [allowTransition, setAllowTransition] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [pendingCityId, setPendingCityId] = useState<string | null>(null);
  const [scrollToCityId, setScrollToCityId] = useState<string | null>(null);
  const [nearestCityIdInList, setNearestCityIdInList] = useState<string | null>(null);
  const [suggestedNearestCityId, setSuggestedNearestCityId] = useState<string | null>(null);
  const [userLocationTarget, setUserLocationTarget] = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLocationIsApproximate, setUserLocationIsApproximate] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const { getPosition } = useGeolocation();

  showMapRef.current = showMap;

  const searchLower = search.trim().length >= CITY_LIST_SEARCH_MIN_LENGTH ? search.trim().toLowerCase() : '';
  const deferredSearchLower = useDeferredValue(searchLower);
  const unifiedSearchMode = !showMap && !!searchLower;
  const clubs = useCitySelectorClubs(!isLoading);
  const clubsById = useMemo(() => {
    const m = new Map<string, ClubMapItem>();
    for (const club of clubs) m.set(club.id, club);
    return m;
  }, [clubs]);

  const resolveIpLocation = useCallback(async () => {
    if (ipLocationCacheRef.current) return ipLocationCacheRef.current;
    if (!ipLocationInflightRef.current) {
      ipLocationInflightRef.current = appApi.getLocation().then((ipLoc) => {
        if (ipLoc) ipLocationCacheRef.current = ipLoc;
        ipLocationInflightRef.current = null;
        return ipLoc;
      });
    }
    return ipLocationInflightRef.current;
  }, []);

  useEffect(() => {
    if (!showMap) {
      setPendingCityId(null);
      setUserLocationTarget(null);
      setUserLocationIsApproximate(false);
    }
  }, [showMap]);

  const mapCities = useMemo(
    () => allCities ?? (view === 'city' ? filteredCitiesForCountry : filteredCountries.flatMap((f) => f.cities)),
    [allCities, view, filteredCitiesForCountry, filteredCountries]
  );

  const allCitiesSource = useMemo(() => {
    if (allCities && allCities.length > 0) return allCities;
    return filteredCountries.flatMap((f) => f.cities);
  }, [allCities, filteredCountries]);

  useEffect(() => {
    if (allCitiesSource.length === 0) {
      nearestPrefetchDoneRef.current = false;
      locateGenRef.current += 1;
      setLocating(false);
      setLocationMessage(null);
      setSuggestedNearestCityId(null);
      setNearestCityIdInList(null);
      setScrollToCityId(null);
      return;
    }
    if (nearestPrefetchDoneRef.current || suggestedNearestCityId) return;
    let cancelled = false;
    void (async () => {
      const ipLoc = await resolveIpLocation();
      if (cancelled) return;
      nearestPrefetchDoneRef.current = true;
      if (!ipLoc) return;
      const nearest = findNearestCity(allCitiesSource, ipLoc.latitude, ipLoc.longitude);
      if (!cancelled && nearest) setSuggestedNearestCityId(nearest.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [allCitiesSource, suggestedNearestCityId, resolveIpLocation]);

  const allCountryGroups = useMemo((): CountryWithClubs[] => {
    const m = new Map<string, City[]>();
    for (const c of allCitiesSource) {
      const list = m.get(c.country) ?? [];
      list.push(c);
      m.set(c.country, list);
    }
    return Array.from(m.entries())
      .map(([country, cities]) => ({
        country,
        cities,
        clubsCount: cities.reduce((s, city) => s + (city.clubsCount ?? 0), 0),
      }))
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [allCitiesSource]);

  const unifiedSearchRows = useMemo((): UnifiedSearchRow[] => {
    if (!unifiedSearchMode) return [];
    // Prefer deferred query for smoothness; fall back so first keystroke never flashes empty.
    const query = deferredSearchLower || searchLower;
    if (!query) return [];
    const useGeo = geoReady && getGeoDataLoaded();
    return buildUnifiedCitySearchRows({
      searchLower: query,
      cities: allCitiesSource,
      clubs,
      countries: allCountryGroups,
      useGeo,
    });
  }, [unifiedSearchMode, deferredSearchLower, searchLower, clubs, allCountryGroups, allCitiesSource, geoReady]);

  const displaySelectedCountry = selectedCountry ? getCountryDisplayName(selectedCountry, i18n.language) : '';
  const selectedCountryNative = selectedCountry ? getCountryNativeName(selectedCountry) : null;
  const showSelectedCountryNative = selectedCountryNative && selectedCountryNative !== displaySelectedCountry;

  const selectCountryAndClearSearch = useCallback(
    (country: string) => {
      setSearch('');
      selectCountry(country);
    },
    [selectCountry, setSearch]
  );

  const handleWhereAmI = useCallback(async () => {
    const gen = ++locateGenRef.current;
    setLocating(true);
    setLocationMessage(null);
    try {
      let lat: number;
      let lon: number;
      const ipLoc = await resolveIpLocation();
      if (gen !== locateGenRef.current) return;
      if (ipLoc) {
        lat = ipLoc.latitude;
        lon = ipLoc.longitude;
        setUserLocationTarget(ipLoc);
        setUserLocationIsApproximate(true);
      } else {
        const posResult = await getPosition();
        if (gen !== locateGenRef.current) return;
        if (posResult.position) {
          lat = posResult.position.latitude;
          lon = posResult.position.longitude;
          setUserLocationTarget({ latitude: lat, longitude: lon });
          setUserLocationIsApproximate(false);
        } else {
          const key = LOCATION_HINT_KEYS[posResult.errorCode ?? ''] ?? 'city.locationHintUnavailable';
          setLocationMessage(t(key));
          return;
        }
      }
      const nearest = findNearestCity(allCitiesSource.length > 0 ? allCitiesSource : mapCities, lat, lon);
      if (gen !== locateGenRef.current) return;
      if (nearest) {
        setSuggestedNearestCityId(nearest.id);
        if (showMapRef.current) {
          setPendingCityId(nearest.id);
        } else {
          skipListTransitionRef.current = true;
          setNearestCityIdInList(nearest.id);
          selectCountryAndClearSearch(nearest.country);
          setScrollToCityId(nearest.id);
        }
      } else {
        setLocationMessage(t('city.locationHintNoCity'));
      }
    } catch {
      if (gen === locateGenRef.current) {
        setLocationMessage(t('city.locationHintUnavailable'));
      }
    } finally {
      if (gen === locateGenRef.current) setLocating(false);
    }
  }, [resolveIpLocation, getPosition, allCitiesSource, mapCities, selectCountryAndClearSearch, t]);

  useEffect(() => {
    return () => {
      locateGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!pendingCityId) return;
    const knownInCities = mapCities.some((c) => c.id === pendingCityId);
    const knownInClubs = clubs.some((c) => c.cityId === pendingCityId);
    if (!knownInCities && !knownInClubs) setPendingCityId(null);
  }, [pendingCityId, mapCities, clubs]);

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
    const frame = requestAnimationFrame(() => setAllowTransition(true));
    return () => cancelAnimationFrame(frame);
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

  const searchPlaceholder = t('city.searchCityOrClub');
  const selectedCityId = isSelectorMode ? selectedId : currentCityId;

  useEffect(() => {
    if (search.trim().length > 0) setLocationMessage(null);
  }, [search]);

  const showSuggested = !showMap && !unifiedSearchMode;
  const suggestedEntries = useMemo(() => {
    if (!showSuggested) return [];
    return buildSuggestedCityEntries({
      cities: allCitiesSource,
      nearestCityId: suggestedNearestCityId,
      currentCityId: selectedCityId,
    });
  }, [showSuggested, suggestedNearestCityId, selectedCityId, allCitiesSource]);

  const useVirtualizedCityList = filteredCitiesForCountry.length >= 40;
  const idxForScrollToCity = scrollToCityId != null ? filteredCitiesForCountry.findIndex((c) => c.id === scrollToCityId) : -1;
  const idxForSelected =
    view === 'city' && selectedCityId && selectedCityId !== lastScrolledToSelectedIdRef.current
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
    () =>
      selectedCityId
        ? (filteredCountries.find((item) => item.cities.some((c) => c.id === selectedCityId)) ?? null)
        : null,
    [selectedCityId, filteredCountries]
  );
  const pendingCityName = useMemo(() => {
    if (!pendingCityId) return null;
    const fromCity = mapCities.find((c) => c.id === pendingCityId)?.name;
    if (fromCity) return fromCity;
    return clubs.find((c) => c.cityId === pendingCityId)?.cityName ?? null;
  }, [pendingCityId, mapCities, clubs]);
  const handleScrolledToCityIndex = useCallback(() => setScrollToCityId(null), []);
  const handlePendingCity = useCallback((id: string) => setPendingCityId(id), []);
  const handleMapClick = useCallback(() => setPendingCityId(null), []);

  const onCityClickAndClearSearch = useCallback(
    (cityId: string) => {
      onCityClick(cityId);
      setSearch('');
    },
    [onCityClick, setSearch]
  );

  const suggestedListHeader =
    showSuggested && suggestedEntries.length > 0 ? (
      <SuggestedCitiesBlock
        entries={suggestedEntries}
        selectedCityId={selectedCityId}
        submitting={submitting}
        onSelect={onCityClickAndClearSearch}
      />
    ) : null;

  const countryBackRow =
    selectedCountry && !unifiedSearchMode ? (
      <button
        type="button"
        onClick={backToCountries}
        className="mb-1.5 flex w-full min-w-0 items-center gap-1.5 truncate rounded-lg py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50/80 dark:text-primary-400 dark:hover:bg-primary-950/40"
      >
        <span className="min-w-0 truncate">
          ← {displaySelectedCountry}
          {showSelectedCountryNative && (
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
              {selectedCountryNative}
            </span>
          )}
        </span>
      </button>
    ) : null;

  const cityListHeader = (
    <>
      {suggestedListHeader}
      {countryBackRow}
    </>
  );

  const unifiedItemKey = useCallback((row: UnifiedSearchRow) => {
    if (row.kind === 'section') return `sec:${row.section}`;
    if (row.kind === 'country') return `co:${row.group.country}`;
    if (row.kind === 'club') return `cl:${row.club.id}`;
    return `ci:${row.city.id}`;
  }, []);

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
        showMap ? 'gap-0 p-0' : 'gap-2 p-0.5 pt-1'
      } ${className}`}
    >
      {showError && error && (
        <div className="shrink-0 rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}
      <CitySelectorSearchChrome
        search={search}
        setSearch={setSearch}
        searchPlaceholder={searchPlaceholder}
        isLoading={isLoading}
        showMap={showMap}
        onToggleMap={() => setShowMap((v) => !v)}
        locating={locating}
        onNearMe={handleWhereAmI}
        locationMessage={locationMessage}
      />
      {isLoading ? (
        <div className="flex items-center justify-center py-10 flex-1 min-h-[8rem] shrink-0">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 dark:border-primary-800 border-t-primary-500" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden w-full flex flex-col">
          <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
            <div
              className={`flex flex-1 min-h-0 ${allowTransition ? 'transition-transform duration-300 ease-out' : ''}`}
              style={{ width: '200%', transform: showMap ? 'translateX(-50%)' : 'translateX(0)' }}
            >
              <div className="w-1/2 flex-shrink-0 min-w-0 min-h-0 overflow-hidden flex flex-col">
                {unifiedSearchMode ? (
                  citiesCount === 0 && allCitiesSource.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
                      {t('createLeague.noCitiesAvailable')}
                    </p>
                  ) : unifiedSearchRows.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">{t('common.noResults')}</p>
                  ) : (
                    <VirtualizedList
                      items={unifiedSearchRows}
                      getItemKey={unifiedItemKey}
                      estimateSize={56}
                      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1"
                      contentClassName={`space-y-1.5 p-1 ${contentClassName}`}
                      renderItem={(row) => {
                        if (row.kind === 'section') {
                          return <UnifiedSearchSectionHeader section={row.section} />;
                        }
                        if (row.kind === 'country') {
                          return (
                            <CountryListItem
                              item={row.group}
                              isSelected={countryOfSelected?.country === row.group.country}
                              onSelect={selectCountryAndClearSearch}
                            />
                          );
                        }
                        if (row.kind === 'club') {
                          const club = clubsById.get(row.club.id);
                          if (!club) return null;
                          return (
                            <ClubListItem
                              club={club}
                              isSelected={false}
                              isNearest={false}
                              onSelect={onCityClickAndClearSearch}
                            />
                          );
                        }
                        return (
                          <CityListItem
                            city={row.city}
                            isSelected={row.city.id === selectedCityId}
                            isNearest={row.city.id === nearestCityIdInList}
                            isScrollTarget={false}
                            submitting={submitting}
                            isSelectorMode={isSelectorMode}
                            selectedCityRef={selectedCityRef}
                            scrollTargetRef={scrollTargetRef}
                            onSelect={onCityClickAndClearSearch}
                          />
                        );
                      }}
                    />
                  )
                ) : (
                  <div
                    className={`flex flex-1 min-h-0 w-full ${allowTransition && !skipListTransitionRef.current ? 'transition-transform duration-300 ease-out' : ''}`}
                    style={{ width: '200%', transform: view === 'city' ? 'translateX(-50%)' : 'translateX(0)' }}
                  >
                    <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-hidden flex flex-col">
                      {filteredCountries.length === 0 ? (
                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-1.5">
                          {suggestedListHeader}
                          <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
                            {citiesCount === 0 ? t('createLeague.noCitiesAvailable') : t('common.noResults')}
                          </p>
                        </div>
                      ) : (
                        <VirtualizedList
                          items={filteredCountries}
                          getItemKey={(item) => item.country}
                          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1"
                          contentClassName={`space-y-1.5 ${contentClassName}`}
                          header={suggestedListHeader}
                          renderItem={(item) => (
                            <CountryListItem
                              item={item}
                              isSelected={countryOfSelected?.country === item.country}
                              onSelect={selectCountryAndClearSearch}
                            />
                          )}
                        />
                      )}
                    </div>
                    <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-hidden flex flex-col">
                      {showNoCityOption && isSelectorMode && (
                        <button
                          type="button"
                          onClick={() => onCityClickAndClearSearch('')}
                          aria-pressed={!selectedId}
                          className={`${citySelectorRowClassName(!selectedId, 'px-3 py-2.5')} mb-1.5`}
                        >
                          <span className="flex items-center justify-between gap-2 min-w-0">
                            <span className="font-medium text-sm text-gray-900 dark:text-white">
                              {t('createLeague.noCity')}
                            </span>
                            {!selectedId && (
                              <span className={CITY_SELECTOR_CHECK} aria-hidden>
                                ✓
                              </span>
                            )}
                          </span>
                        </button>
                      )}
                      {filteredCitiesForCountry.length === 0 ? (
                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-1.5 p-1">
                          {cityListHeader}
                          <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">{t('common.noResults')}</p>
                        </div>
                      ) : useVirtualizedCityList ? (
                        <VirtualizedList
                          items={filteredCitiesForCountry}
                          getItemKey={(item) => item.id}
                          estimateSize={52}
                          scrollToIndex={cityScrollToIndex >= 0 ? cityScrollToIndex : null}
                          onScrolledToIndex={handleScrolledToCityIndex}
                          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1"
                          contentClassName={`space-y-1.5 p-1 ${contentClassName}`}
                          header={cityListHeader}
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
                              onSelect={onCityClickAndClearSearch}
                            />
                          )}
                        />
                      ) : (
                        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-1.5 p-1 ${contentClassName}`}>
                          {cityListHeader}
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
                              onSelect={onCityClickAndClearSearch}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="w-1/2 flex-shrink-0 min-w-0 min-h-0 flex flex-col">
                {showMap ? (
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
                    <CityMap
                      cities={mapCities}
                      clubs={clubs}
                      currentCityId={selectedCityId}
                      pendingCityId={pendingCityId}
                      onCityClick={handlePendingCity}
                      onClubClick={handlePendingCity}
                      onMapClick={handleMapClick}
                      className="min-h-0 flex-1"
                      userLocation={userLocationTarget}
                      userLocationApproximate={userLocationIsApproximate}
                    />
                    <CityMapChromeOverlay
                      locating={locating}
                      onNearMe={handleWhereAmI}
                      onToggleMap={() => setShowMap(false)}
                      locationMessage={locationMessage}
                      isLoading={isLoading}
                    />
                    <AnimatePresence>
                      {pendingCityId && (
                        <motion.div
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 12 }}
                          transition={{ duration: 0.2 }}
                          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] p-3"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onCityClickAndClearSearch(pendingCityId);
                              setPendingCityId(null);
                            }}
                            className="pointer-events-auto w-full rounded-2xl bg-primary-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/35"
                          >
                            {pendingCityName
                              ? t('city.selectCityName', { name: pendingCityName })
                              : t('city.selectCity')}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex-1 min-h-[280px]" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
