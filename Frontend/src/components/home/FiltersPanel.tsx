import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Star } from 'lucide-react';
import { ToggleSwitch, RangeSlider } from '@/components';
import { TimeRangeSlider } from '@/components/TimeRangeSlider';
import { clubsApi } from '@/api/clubs';
import { favoritesApi } from '@/api/favorites';
import type { Club } from '@/types';

interface FiltersPanelProps {
  cityId?: string;
  userFilter: boolean;
  onUserFilterChange: (v: boolean) => void;
  clubIds: string[];
  onClubIdsChange: (ids: string[]) => void;
  timeRange: [string, string];
  onTimeRangeChange: (v: [string, string]) => void;
  playerLevelRange: [number, number];
  onPlayerLevelRangeChange: (v: [number, number]) => void;
  hour12: boolean;
  onResetFilters?: () => void;
  showResetFooter?: boolean;
}

export const FiltersPanel = ({
  cityId,
  userFilter,
  onUserFilterChange,
  clubIds,
  onClubIdsChange,
  timeRange,
  onTimeRangeChange,
  playerLevelRange,
  onPlayerLevelRangeChange,
  hour12,
  onResetFilters,
  showResetFooter = false,
}: FiltersPanelProps) => {
  const { t } = useTranslation();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [barsInCity, setBarsInCity] = useState<Club[]>([]);
  const [favoriteClubIds, setFavoriteClubIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const ids = await favoritesApi.getUserFavoriteClubIds();
        if (!cancelled) setFavoriteClubIds(ids);
      } catch {
        if (!cancelled) setFavoriteClubIds([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchClubs = async () => {
      if (!cityId) {
        setClubs([]);
        setBarsInCity([]);
        return;
      }
      try {
        const [allRes, barRes] = await Promise.all([
          clubsApi.getByCityId(cityId),
          clubsApi.getByCityId(cityId, 'BAR'),
        ]);
        if (!cancelled) {
          setClubs(allRes.data ?? []);
          setBarsInCity(barRes.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setClubs([]);
          setBarsInCity([]);
        }
      }
    };
    fetchClubs();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  const barIdSet = useMemo(() => new Set(barsInCity.map((c) => c.id)), [barsInCity]);

  const sortedVenueClubs = useMemo(() => {
    return [...clubs]
      .filter((c) => !barIdSet.has(c.id))
      .sort((a, b) => {
        const af = favoriteClubIds.includes(a.id);
        const bf = favoriteClubIds.includes(b.id);
        if (af && !bf) return -1;
        if (!af && bf) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [clubs, barIdSet, favoriteClubIds]);

  const sortedBars = useMemo(() => {
    return [...barsInCity].sort((a, b) => {
      const af = favoriteClubIds.includes(a.id);
      const bf = favoriteClubIds.includes(b.id);
      if (af && !bf) return -1;
      if (!af && bf) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [barsInCity, favoriteClubIds]);

  const venueIdSet = useMemo(() => new Set(sortedVenueClubs.map((c) => c.id)), [sortedVenueClubs]);

  const anyVenueClubSelected = useMemo(
    () => clubIds.some((id) => venueIdSet.has(id)),
    [clubIds, venueIdSet]
  );
  const anyBarSelected = useMemo(() => clubIds.some((id) => barIdSet.has(id)), [clubIds, barIdSet]);

  const toggleId = (id: string) => {
    onClubIdsChange(clubIds.includes(id) ? clubIds.filter((x) => x !== id) : [...clubIds, id]);
  };

  const clearVenueClubSelection = () => onClubIdsChange(clubIds.filter((id) => !venueIdSet.has(id)));
  const clearBarSelection = () => onClubIdsChange(clubIds.filter((id) => !barIdSet.has(id)));

  const onVenueChipClick = (id: string) => {
    if (clubIds.length === 0) onClubIdsChange([id]);
    else toggleId(id);
  };

  const onBarChipClick = (id: string) => {
    if (clubIds.length === 0) onClubIdsChange([id]);
    else toggleId(id);
  };

  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
      active
        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-gradient-to-b from-white to-gray-50/80 dark:from-gray-900 dark:to-gray-900/95 shadow-sm p-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {t('games.availableForMe', { defaultValue: 'Available for me' })}
        </span>
        <ToggleSwitch checked={userFilter} onChange={onUserFilterChange} />
      </div>
      {userFilter && (
        <p className="text-xs text-primary-700/90 dark:text-primary-300/90 -mt-2">
          {t('games.availableForMeHint', { defaultValue: 'Showing games with available slots and suitable level limits' })}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('gameSubscriptions.clubs')}
        </p>
        {!cityId ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('gameSubscriptions.selectCityFirst')}</p>
        ) : sortedVenueClubs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('gameSubscriptions.noClubs')}</p>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto py-0.5 pr-0.5">
            <button type="button" onClick={clearVenueClubSelection} className={chipClass(!anyVenueClubSelected)}>
              {t('gameSubscriptions.allClubs')}
            </button>
            {sortedVenueClubs.map((club) => {
              const selected = clubIds.includes(club.id);
              const fav = favoriteClubIds.includes(club.id);
              return (
                <button
                  key={club.id}
                  type="button"
                  onClick={() => onVenueChipClick(club.id)}
                  className={chipClass(selected)}
                >
                  {fav && <Star size={12} className="inline mr-1 text-amber-500 fill-amber-500" aria-hidden />}
                  {club.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cityId && barsInCity.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('games.bars')}
          </p>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto py-0.5 pr-0.5">
            <button type="button" onClick={clearBarSelection} className={chipClass(!anyBarSelected)}>
              {t('common.all')}
            </button>
            {sortedBars.map((club) => {
              const selected = clubIds.includes(club.id);
              const fav = favoriteClubIds.includes(club.id);
              return (
                <button
                  key={club.id}
                  type="button"
                  onClick={() => onBarChipClick(club.id)}
                  className={chipClass(selected)}
                >
                  {fav && <Star size={12} className="inline mr-1 text-amber-500 fill-amber-500" aria-hidden />}
                  {club.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('gameSubscriptions.timeRange')}
        </p>
        <TimeRangeSlider value={timeRange} onChange={onTimeRangeChange} hour12={hour12} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('createGame.playerLevel')}
        </p>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-950/40 px-2 py-2">
          <RangeSlider min={1.0} max={7.0} value={playerLevelRange} onChange={onPlayerLevelRangeChange} step={0.1} compact />
        </div>
      </div>

      {showResetFooter && onResetFilters && (
        <div className="pt-4 border-t border-gray-200/80 dark:border-gray-700/80">
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/60 px-3 py-2.5 text-xs font-semibold text-gray-800 dark:text-gray-100 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RotateCcw size={15} className="text-gray-500 dark:text-gray-400 shrink-0" aria-hidden />
            {t('games.resetFilters')}
          </button>
        </div>
      )}
    </div>
  );
};
