import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseSport } from '@shared/sport';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { getSportConfig } from '@/sport/sportRegistry';
import { useCourtDayOccupancy } from '@/hooks/useCourtDayOccupancy';
import {
  effectiveCourtSportFilter,
  filterCourtsByClubSports,
  filterCourtsBySport,
  resolveClubSportsList,
  resolveDefaultCourtSportTab,
  shouldShowCourtSportTabs,
  sportLabelKey,
} from '@/utils/courtSport';
import { CourtSelectionCard } from './CourtSelectionCard';
import type { Club, Court, EntityType, Sport } from '@/types';

interface CourtSelectionGridProps {
  club?: Club;
  courts: Court[];
  selectedCourt: string;
  selectedDate: Date;
  entityType: EntityType;
  showNotBookedOption?: boolean;
  preferredSport?: Sport | null;
  clubSports?: Sport[] | null;
  onSelectCourt: (id: string) => void;
  onSportTabChange?: (sport: Sport) => void;
}

export const CourtSelectionGrid = memo(function CourtSelectionGrid({
  club,
  courts,
  selectedCourt,
  selectedDate,
  entityType,
  showNotBookedOption = true,
  preferredSport,
  clubSports: clubSportsProp,
  onSelectCourt,
  onSportTabChange,
}: CourtSelectionGridProps) {
  const { t } = useTranslation();
  const clubSports = useMemo(
    () => resolveClubSportsList(clubSportsProp, courts),
    [clubSportsProp, courts],
  );
  const showSportTabs = shouldShowCourtSportTabs(clubSportsProp, courts);
  const sportFilter = effectiveCourtSportFilter(clubSportsProp, preferredSport ?? undefined);
  const courtsInClub = useMemo(
    () => filterCourtsByClubSports(courts, clubSportsProp),
    [courts, clubSportsProp],
  );

  const [activeSportTab, setActiveSportTab] = useState<Sport | undefined>(() =>
    resolveDefaultCourtSportTab(clubSports, sportFilter),
  );

  useEffect(() => {
    setActiveSportTab(resolveDefaultCourtSportTab(clubSports, sportFilter));
  }, [clubSports, sportFilter, club?.id]);

  const visibleCourts = useMemo(() => {
    if (showSportTabs && activeSportTab) {
      return filterCourtsBySport(courtsInClub, activeSportTab);
    }
    if (!showSportTabs && sportFilter) {
      return filterCourtsBySport(courtsInClub, sportFilter);
    }
    return courtsInClub;
  }, [courtsInClub, showSportTabs, activeSportTab, sportFilter]);

  const { occupancyByCourtId, loading } = useCourtDayOccupancy({
    clubId: club?.id ?? null,
    club,
    courts: visibleCourts,
    selectedDate,
    enabled: Boolean(club?.id) && visibleCourts.length > 0,
  });

  const sportTabs = useMemo(
    () =>
      clubSports.map((sport) => {
        const config = getSportConfig(sport);
        return {
          id: sport,
          label: `${config.icon} ${t(sportLabelKey(sport))}`,
        };
      }),
    [clubSports, t],
  );

  const handleSportTab = useCallback(
    (sportId: string) => {
      const sport = parseSport(sportId);
      setActiveSportTab(sport);
      onSportTabChange?.(sport);
    },
    [onSportTabChange],
  );

  const isBar = entityType === 'BAR';
  const noAvailableText = isBar ? t('createGame.noHallsAvailable') : t('createGame.noCourtsAvailable');

  return (
    <div className="space-y-2">
      {showSportTabs && sportTabs.length > 0 && (
        <SegmentedSwitch
          tabs={sportTabs}
          activeId={activeSportTab ?? sportTabs[0].id}
          onChange={handleSportTab}
          showOnlyActiveTabText={false}
          layoutId="court-grid-sport"
          className="w-full"
        />
      )}
      {visibleCourts.length === 0 ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">{noAvailableText}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {showNotBookedOption && (
            <CourtSelectionCard
              selectId="notBooked"
              label={t('createGame.notBookedYet')}
              selected={selectedCourt === 'notBooked'}
              onSelectCourt={onSelectCourt}
            />
          )}
          {visibleCourts.map((court) => {
            const occupancy = occupancyByCourtId.get(court.id);
            return (
              <CourtSelectionCard
                key={court.id}
                court={court}
                selectId={court.id}
                selected={selectedCourt === court.id}
                fillPercent={occupancy?.fillPercent ?? 0}
                loading={loading}
                onSelectCourt={onSelectCourt}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
