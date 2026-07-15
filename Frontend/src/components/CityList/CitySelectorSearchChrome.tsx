import { Search, Map as MapIcon, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface CitySelectorSearchChromeProps {
  search: string;
  setSearch: (v: string) => void;
  searchPlaceholder: string;
  isLoading: boolean;
  showMap: boolean;
  onToggleMap: () => void;
  locating: boolean;
  onNearMe: () => void;
  locationMessage: string | null;
}

export function CitySelectorSearchChrome({
  search,
  setSearch,
  searchPlaceholder,
  isLoading,
  showMap,
  onToggleMap,
  locating,
  onNearMe,
  locationMessage,
}: CitySelectorSearchChromeProps) {
  const { t } = useTranslation();

  const toolBtn =
    'inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/25 disabled:opacity-60';
  const toolIdle =
    'border-gray-200/90 dark:border-gray-600/80 bg-white/90 dark:bg-gray-800/70 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/70 hover:text-primary-600 dark:hover:text-primary-400';

  if (showMap) return null;

  return (
    <div className="shrink-0 space-y-2 min-w-0">
      <label className="relative block min-w-0">
        <span className="sr-only">{searchPlaceholder}</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          strokeWidth={2}
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          disabled={isLoading}
          autoComplete="off"
          enterKeyHint="search"
          className="w-full min-w-0 rounded-2xl border border-gray-200/90 bg-white py-3 pl-10 pr-3.5 text-[0.9375rem] leading-snug text-gray-900 shadow-sm shadow-gray-900/5 outline-none transition-[box-shadow,border-color] placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/25 disabled:opacity-60 dark:border-gray-600/80 dark:bg-gray-800/90 dark:text-white dark:shadow-black/20 dark:placeholder:text-gray-500"
        />
      </label>

      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onNearMe}
          disabled={locating || isLoading}
          aria-label={t('city.whereAmI')}
          title={t('city.whereAmI')}
          className={`${toolBtn} ${toolIdle} shrink-0`}
        >
          {locating ? (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500 dark:border-primary-800" />
          ) : (
            <MapPin className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" strokeWidth={2.25} />
          )}
          <span>{t('city.nearMe')}</span>
        </button>
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={onToggleMap}
          disabled={isLoading}
          aria-pressed={false}
          className={`${toolBtn} ${toolIdle} shrink-0`}
        >
          <MapIcon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          <span>{t('city.map')}</span>
        </button>
      </div>

      {(locating || locationMessage) && (
        <p
          role="status"
          aria-live="polite"
          className={`px-1 text-sm ${
            locationMessage && !locating
              ? 'text-amber-700/90 dark:text-amber-300/90'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {locating ? t('city.locatingNearby') : locationMessage}
        </p>
      )}
    </div>
  );
}
