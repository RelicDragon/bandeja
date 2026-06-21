import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, MapPin } from 'lucide-react';
import { CityModal } from '@/components';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import type { GameFilters } from '@/utils/gameFiltersStorage';

interface FindHeaderActionsProps {
  user: any;
  filters: GameFilters;
  onFiltersChange: (updates: Partial<GameFilters>) => void;
}

export const FindHeaderActions = ({ user, filters, onFiltersChange }: FindHeaderActionsProps) => {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const [showCityModal, setShowCityModal] = useState(false);

  const filtersControlActive = useMemo(() => {
    return (
      Boolean(filters.filtersPanelOpen) ||
      Boolean(filters.filterAvailableSlots) ||
      Boolean(filters.filterSuitableRating) ||
      Boolean(filters.hideBarGames) ||
      Boolean(filters.userFilter) ||
      (filters.filterClubIds?.length ?? 0) > 0 ||
      filters.filterTimeStart !== '00:00' ||
      filters.filterTimeEnd !== '24:00' ||
      (filters.filterLevelMin ?? 1.0) > 1.0 + 1e-6 ||
      (filters.filterLevelMax ?? 7.0) < 7.0 - 1e-6 ||
      Boolean(filters.filterNoRating) ||
      (Boolean(user?.isAdmin) && Boolean(filters.showPrivateGames))
    );
  }, [filters, user?.isAdmin]);

  return (
    <>
      <div className="flex items-center gap-2 min-w-0 w-full">
        <button
          onClick={() => setShowCityModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink min-w-0"
        >
          <MapPin size={16} className="text-primary-600 dark:text-primary-400 shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {user?.currentCity
              ? translateCity(user.currentCity.id, user.currentCity.name, user.currentCity.country)
              : t('auth.selectCity')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onFiltersChange({ filtersPanelOpen: !filters.filtersPanelOpen })}
          className={`relative flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors shrink-0 ${
            filtersControlActive
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Filter
            size={16}
            className={filtersControlActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
            fill={filtersControlActive ? 'currentColor' : 'none'}
          />
          <span className="text-xs font-medium">{t('games.filters')}</span>
        </button>
      </div>
      <CityModal
        isOpen={showCityModal}
        onClose={() => setShowCityModal(false)}
        selectedId={user?.currentCity?.id}
      />
    </>
  );
};
