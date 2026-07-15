import { List, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface CityMapChromeOverlayProps {
  locating: boolean;
  onNearMe: () => void;
  onToggleMap: () => void;
  locationMessage: string | null;
  isLoading?: boolean;
}

export function CityMapChromeOverlay({
  locating,
  onNearMe,
  onToggleMap,
  locationMessage,
  isLoading = false,
}: CityMapChromeOverlayProps) {
  const { t } = useTranslation();

  const toolBtn =
    'pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium shadow-md shadow-black/15 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/25 disabled:opacity-60';
  const toolIdle =
    'border-white/80 bg-white/95 text-gray-700 hover:bg-white hover:text-primary-600 dark:border-gray-600/80 dark:bg-gray-900/90 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-primary-400';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col items-end gap-1.5 p-2">
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
        <button
          type="button"
          onClick={onToggleMap}
          disabled={isLoading}
          aria-pressed
          className={`${toolBtn} ${toolIdle} shrink-0 border-primary-400/55 bg-primary-50/95 text-primary-700 dark:border-primary-500/40 dark:bg-primary-900/80 dark:text-primary-200`}
        >
          <List className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          <span>{t('city.list')}</span>
        </button>
      </div>

      {(locating || locationMessage) && (
        <p
          role="status"
          aria-live="polite"
          className={`pointer-events-none rounded-lg px-2 py-1 text-sm backdrop-blur-sm ${
            locationMessage && !locating
              ? 'bg-amber-50/90 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200'
              : 'bg-white/90 text-gray-600 dark:bg-gray-900/80 dark:text-gray-300'
          }`}
        >
          {locating ? t('city.locatingNearby') : locationMessage}
        </p>
      )}
    </div>
  );
}
