import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigation, ExternalLink, Phone } from 'lucide-react';
import { useGeoReady } from '@/hooks/useGeoReady';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { getTelUrl } from '@/utils/telUrl';
import type { ClubMapItem } from '@/api/clubs';

export interface ClubListItemProps {
  club: ClubMapItem;
  isSelected: boolean;
  isNearest: boolean;
  onSelect: (cityId: string) => void;
  scrollTargetRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

function ClubListItemInner({ club, isSelected, isNearest, onSelect, scrollTargetRef, className = '' }: ClubListItemProps) {
  const { t } = useTranslation();
  useGeoReady();
  const { translateCity, translateCountry } = useTranslatedGeo();
  const cityDisplay = translateCity(club.cityId, club.cityName, club.country);
  const countryDisplay = translateCountry(club.country);
  const hasWebsite = !!club.website?.trim();
  const hasPhone = !!(club.phone?.trim() && getTelUrl(club.phone.trim()));
  return (
    <div
      ref={scrollTargetRef}
      className={`w-full min-w-0 text-left px-4 py-3 rounded-xl border transition-colors ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-400/50 ring-offset-2 dark:ring-offset-gray-900'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSelect(club.cityId)}
        aria-label={isNearest ? `${club.name}, ${t('city.nearestToYou')}` : undefined}
        className="w-full min-w-0 text-left"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            {isNearest && (
              <span
                className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400"
                title={t('city.nearestToYou')}
              >
                <Navigation className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
              </span>
            )}
            <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{club.name}</span>
          </span>
          {isSelected && (
            <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs bg-primary-500 text-white" aria-hidden>
              ✓
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
          {cityDisplay}, {countryDisplay}
        </div>
        <div className="mt-1.5 flex justify-end">
          <span className="text-xs text-gray-400 dark:text-gray-500">{t('club.courtsCount', { count: club.courtsCount })}</span>
        </div>
      </button>
      {(hasWebsite || hasPhone) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
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
  );
}

export const ClubListItem = memo(ClubListItemInner, (prev, next) =>
  prev.club.id === next.club.id &&
  prev.isSelected === next.isSelected &&
  prev.isNearest === next.isNearest &&
  prev.onSelect === next.onSelect &&
  prev.scrollTargetRef === next.scrollTargetRef
);
