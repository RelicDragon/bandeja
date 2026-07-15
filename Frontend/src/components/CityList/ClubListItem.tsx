import { memo } from 'react';
import { Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGeoReady } from '@/hooks/useGeoReady';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import type { ClubMapItem } from '@/api/clubs';
import {
  CITY_SELECTOR_CHECK,
  CITY_SELECTOR_ROW_PAD,
  citySelectorRowClassName,
} from '@/components/CityList/citySelectorRowStyles';

export interface ClubListItemProps {
  club: ClubMapItem;
  isSelected: boolean;
  isNearest: boolean;
  onSelect: (cityId: string) => void;
  scrollTargetRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

function ClubAvatarThumb({ club }: { club: ClubMapItem }) {
  const letter = (club.name.trim()[0] ?? '?').toLocaleUpperCase('und');
  if (club.avatar?.trim()) {
    return (
      <img
        src={club.avatar}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg object-cover bg-gray-200 dark:bg-gray-700"
      />
    );
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-sm font-semibold text-primary-700 dark:text-primary-300"
      aria-hidden
    >
      {letter}
    </span>
  );
}

function ClubListItemInner({
  club,
  isSelected,
  isNearest,
  onSelect,
  scrollTargetRef,
  className = '',
}: ClubListItemProps) {
  const { t } = useTranslation();
  useGeoReady();
  const { translateCity, translateCountry } = useTranslatedGeo();
  const cityDisplay = translateCity(club.cityId, club.cityName, club.country);
  const countryDisplay = translateCountry(club.country);
  const subtitle = `${cityDisplay} · ${countryDisplay}`;

  return (
    <div ref={scrollTargetRef} className={className}>
      <button
        type="button"
        onClick={() => onSelect(club.cityId)}
        aria-pressed={isSelected}
        aria-label={isNearest ? `${club.name}, ${t('city.nearestToYou')}` : `${club.name}, ${subtitle}`}
        className={citySelectorRowClassName(isSelected, CITY_SELECTOR_ROW_PAD)}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ClubAvatarThumb club={club} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              {isNearest && (
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-400"
                  title={t('city.nearestToYou')}
                >
                  <Navigation className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </span>
              )}
              <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{club.name}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
          </span>
          {isSelected && (
            <span className={CITY_SELECTOR_CHECK} aria-hidden>
              ✓
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export const ClubListItem = memo(ClubListItemInner, (prev, next) =>
  prev.club.id === next.club.id &&
  prev.club.avatar === next.club.avatar &&
  prev.club.name === next.club.name &&
  prev.club.cityId === next.club.cityId &&
  prev.club.cityName === next.club.cityName &&
  prev.club.country === next.club.country &&
  prev.isSelected === next.isSelected &&
  prev.isNearest === next.isNearest &&
  prev.onSelect === next.onSelect &&
  prev.scrollTargetRef === next.scrollTargetRef
);
