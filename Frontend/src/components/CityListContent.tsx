import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useMemo } from 'react';
import { Map, List, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { City } from '@/types';
import { getCountryFlag } from '@/utils/countryFlag';
import type { CountryWithClubs } from '@/hooks/useCityList';
import { CityMap } from '@/components/CityMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import { findNearestCity } from '@/utils/nearestCity';
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
  const { t } = useTranslation();
  const isLoading = showingLoading ?? loading;
  const selectedCityRef = useRef<HTMLButtonElement>(null);
  const [allowTransition, setAllowTransition] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [clubs, setClubs] = useState<ClubMapItem[]>([]);
  const [pendingCityId, setPendingCityId] = useState<string | null>(null);
  const [userLocationTarget, setUserLocationTarget] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const { getPosition } = useGeolocation();

  useEffect(() => {
    if (!showMap) {
      setPendingCityId(null);
      setUserLocationTarget(null);
      return;
    }
    let cancelled = false;
    clubsApi.getForMap().then((res) => {
      if (!cancelled && res.data) setClubs(res.data);
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
    return mapCities.filter(
      (c) =>
        c.country.toLowerCase().includes(searchLower) ||
        c.name.toLowerCase().includes(searchLower) ||
        (c.administrativeArea?.toLowerCase().includes(searchLower) ?? false) ||
        (c.subAdministrativeArea?.toLowerCase().includes(searchLower) ?? false)
    );
  }, [mapCities, searchLower]);

  const locationErrorKeys: Record<string, string> = {
    permission_denied: 'auth.locationDenied',
    position_unavailable: 'auth.locationUnavailable',
    timeout: 'auth.locationTimeout',
    unsupported: 'auth.locationUnsupported',
  };

  const handleWhereAmI = async () => {
    setLocating(true);
    try {
      let lat: number;
      let lon: number;
      let posResult = await getPosition();
      if (posResult.position) {
        lat = posResult.position.latitude;
        lon = posResult.position.longitude;
      } else {
        const ipLoc = await appApi.getLocation();
        if (ipLoc) {
          lat = ipLoc.latitude;
          lon = ipLoc.longitude;
          setUserLocationTarget(ipLoc);
        } else {
          posResult = await getPosition();
          if (!posResult.position) {
            const key = locationErrorKeys[posResult.errorCode ?? ''] ?? 'auth.locationUnavailable';
            onLocationError?.(t(key));
            return;
          }
          lat = posResult.position.latitude;
          lon = posResult.position.longitude;
        }
      }
      setUserLocationTarget({ latitude: lat, longitude: lon });
      const nearest = findNearestCity(mapCities, lat, lon);
      if (nearest) {
        if (showMap) {
          setPendingCityId(nearest.id);
        } else {
          selectCountry(nearest.country);
          onCityClick(nearest.id);
        }
      } else {
        onLocationError?.(t('auth.noCityNearby'));
      }
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (pendingCityId && !filteredMapCities.some((c) => c.id === pendingCityId)) setPendingCityId(null);
  }, [pendingCityId, filteredMapCities]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAllowTransition(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (view === 'city' && (currentCityId || selectedId) && selectedCityRef.current) {
      const raf = requestAnimationFrame(() => {
        selectedCityRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [view, currentCityId, selectedId, filteredCitiesForCountry.length]);

  const searchPlaceholder = view === 'country' ? t('city.searchCountries') : t('city.searchCities');
  const selectedCityId = isSelectorMode ? selectedId : currentCityId;
  const countryOfSelected = selectedCityId ? filteredCountries.find((item) => item.cities.some((c) => c.id === selectedCityId)) : null;

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
              <span className="truncate">← {selectedCountry}</span>
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
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        disabled={isLoading}
        className="w-full min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none transition-shadow disabled:opacity-60 shrink-0"
      />
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
                className={`flex flex-1 min-h-0 w-full ${allowTransition ? 'transition-transform duration-300 ease-out' : ''}`}
                style={{ width: '200%', transform: view === 'city' ? 'translateX(-50%)' : 'translateX(0)' }}
              >
                <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
              {filteredCountries.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
                  {citiesCount === 0 ? t('createLeague.noCitiesAvailable') : t('common.noResults')}
                </p>
              ) : (
                <div className={`space-y-1.5 ${contentClassName}`}>
                  {filteredCountries.map((item) => {
                    const isSelectedCountry = countryOfSelected?.country === item.country;
                    return (
                      <button
                        key={item.country}
                        type="button"
                        onClick={() => selectCountry(item.country)}
                        className={`w-full min-w-0 text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                          isSelectedCountry
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-400/50 ring-offset-2 dark:ring-offset-gray-900'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium text-sm text-gray-900 dark:text-white min-w-0 overflow-hidden">
                          <span className="text-lg leading-none shrink-0">{getCountryFlag(item.country)}</span>
                          <span className="truncate">{item.country}</span>
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                          {t('city.clubsCount', { count: item.clubsCount })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
                </div>
                <div className="w-1/2 min-w-0 shrink-0 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
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
              ) : (
                <div className={`space-y-1.5 p-1 ${contentClassName}`}>
                  {filteredCitiesForCountry.map((city) => {
                    const isSelected = city.id === selectedCityId;
                    return (
                      <button
                        key={city.id}
                        ref={isSelected ? selectedCityRef : undefined}
                        onClick={() => onCityClick(city.id)}
                        disabled={submitting && !isSelectorMode}
                        className={
                          isSelectorMode
                            ? `w-full min-w-0 text-left px-4 py-3 rounded-xl transition-all ${
                                isSelected
                                  ? 'bg-primary-500 text-white ring-2 ring-primary-400 ring-offset-2 dark:ring-offset-gray-900'
                                  : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`
                            : `w-full min-w-0 text-left p-3 rounded-xl border transition-colors ${
                                isSelected
                                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-400/50 ring-offset-2 dark:ring-offset-gray-900'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
                              } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`
                        }
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{city.name}</span>
                          {isSelected && (
                            <span className={`shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs ${isSelectorMode ? 'bg-white/20 text-white' : 'bg-primary-500 text-white'}`} aria-hidden>✓</span>
                          )}
                        </div>
                        {(city.administrativeArea || city.subAdministrativeArea) && (
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                            {[city.administrativeArea, city.subAdministrativeArea].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        <div className="mt-1.5 flex justify-end">
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {t('city.clubsCount', { count: city.clubsCount ?? 0 })}
                          </span>
                        </div>
                      </button>
                    );
                  })}
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
                    onCityClick={(id) => setPendingCityId(id)}
                    onMapClick={() => setPendingCityId(null)}
                    className="flex-1 min-h-[280px]"
                    userLocation={userLocationTarget}
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
                          {t('city.selectCity')}
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
