import { useTranslation } from 'react-i18next';
import { ClubSelectorCard } from '@/components/ClubSelectorCard';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import type { Club } from '@/types';
import type { ClubVenueGroup } from '@/utils/groupClubsByVenue';

type ClubVenueListProps = {
  here: Club[];
  elsewhere: ClubVenueGroup[];
  selectedId: string;
  query: string;
  cityName: string;
  loading: boolean;
  onSelect: (club: Club) => void;
  onInfoClick: (club: Club, e: React.MouseEvent) => void;
  onViewCity: (cityId: string, snapshot: { name: string; country: string }) => void;
};

export function ClubVenueList({
  here,
  elsewhere,
  selectedId,
  query,
  cityName,
  loading,
  onSelect,
  onInfoClick,
  onViewCity,
}: ClubVenueListProps) {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const searching = query.trim().length > 0;
  const empty = here.length === 0 && elsewhere.length === 0;

  if (loading && empty) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
      </div>
    );
  }

  if (empty) {
    return (
      <p className="px-1 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {searching
          ? t('browseCity.noClubsMatch', { query: query.trim() })
          : t('browseCity.noClubsInCity', { city: cityName })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {searching && here.length === 0 ? (
        <p className="px-1 text-center text-[12px] font-medium text-gray-500 dark:text-gray-400">
          {t('browseCity.noClubsInCity', { city: cityName })}
        </p>
      ) : null}
      {here.map((club) => (
        <ClubSelectorCard
          key={club.id}
          club={club}
          isSelected={selectedId === club.id}
          onSelect={() => onSelect(club)}
          onInfoClick={(e) => onInfoClick(club, e)}
        />
      ))}
      {elsewhere.map((group) => {
        const label = translateCity(group.cityId, group.name, group.country);
        return (
          <section key={group.cityId}>
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <p className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {label}
              </p>
              <button
                type="button"
                onClick={() => onViewCity(group.cityId, { name: group.name, country: group.country })}
                className="shrink-0 text-[12px] font-semibold text-primary-600 dark:text-primary-400"
              >
                {t('browseCity.viewCity', { city: label })}
              </button>
            </div>
            <div className="space-y-2">
              {group.clubs.map((club) => (
                <ClubSelectorCard
                  key={club.id}
                  club={club}
                  subtitle={club.address || label}
                  isSelected={selectedId === club.id}
                  onSelect={() => onSelect(club)}
                  onInfoClick={(e) => onInfoClick(club, e)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
