import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../ToggleSwitch';
import { CourtSelectionGrid } from './CourtSelectionGrid';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import type { Club, Court, EntityType, Sport } from '@/types';

interface CreateGameCourtSectionProps {
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourt: string;
  selectedCourtIds?: string[];
  maxParticipants?: number;
  multiSelectCourts?: boolean;
  selectedDate: Date;
  hasBookedCourt: boolean;
  entityType: EntityType;
  onSelectCourt: (id: string) => void;
  onToggleHasBookedCourt: (checked: boolean) => void;
  preferredSport?: Sport | null;
  onSportTabChange?: (sport: Sport) => void;
}

export const CreateGameCourtSection = memo(function CreateGameCourtSection({
  clubs,
  courts,
  selectedClub,
  selectedCourt,
  selectedCourtIds = [],
  maxParticipants = 4,
  multiSelectCourts = false,
  selectedDate,
  hasBookedCourt,
  entityType,
  onSelectCourt,
  onToggleHasBookedCourt,
  preferredSport,
  onSportTabChange,
}: CreateGameCourtSectionProps) {
  const { t } = useTranslation();

  const club = useMemo(
    () => clubs.find((c) => c.id === selectedClub),
    [clubs, selectedClub],
  );

  if (!selectedClub) return null;

  const court =
    selectedCourt !== 'notBooked'
      ? courts.find((c) => c.id === selectedCourt)
      : entityType === 'BAR' && courts.length === 1
        ? courts[0]
        : undefined;
  const showHasBookedSwitch =
    (selectedCourt !== 'notBooked' || (entityType === 'BAR' && courts.length === 1)) &&
    !courtHasActiveBookingIntegration(club, court) &&
    !multiSelectCourts;

  return (
    <div className="space-y-3">
      {!(entityType === 'BAR' && courts.length === 1) && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {entityType === 'BAR' ? t('createGame.hall') : t('createGame.court')}
          </label>
          <CourtSelectionGrid
            club={club}
            courts={courts}
            selectedCourt={selectedCourt}
            selectedCourtIds={selectedCourtIds}
            maxParticipants={maxParticipants}
            multiSelect={multiSelectCourts}
            selectedDate={selectedDate}
            entityType={entityType}
            preferredSport={preferredSport}
            clubSports={club?.sports}
            onSelectCourt={onSelectCourt}
            onSportTabChange={onSportTabChange}
          />
        </div>
      )}
      {showHasBookedSwitch && (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
            {entityType === 'BAR' ? t('createGame.hasBookedHall') : t('createGame.hasBookedCourt')}
          </span>
          <div className="flex-shrink-0">
            <ToggleSwitch checked={hasBookedCourt} onChange={onToggleHasBookedCourt} />
          </div>
        </div>
      )}
    </div>
  );
});
