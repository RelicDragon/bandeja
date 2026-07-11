import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { ToggleSwitch } from '../ToggleSwitch';
import { CourtSelectionGrid } from './CourtSelectionGrid';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import { computeRequiredCourtCount } from '@/utils/requiredCourtCount';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';
import type { Club, Court, EntityType, Sport } from '@/types';

interface CreateGameCourtSectionProps {
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourt: string;
  selectedCourtIds?: string[];
  maxParticipants?: number;
  playersPerMatch?: number;
  multiSelectCourts?: boolean;
  selectedDate: Date;
  hasBookedCourt: boolean;
  entityType: EntityType;
  onSelectCourt: (id: string) => void;
  onToggleHasBookedCourt: (checked: boolean) => void;
  preferredSport?: Sport | null;
  onSportTabChange?: (sport: Sport) => void;
  showHasBookedSwitch?: boolean;
  showNotBookedOption?: boolean;
}

export const CreateGameCourtSection = memo(function CreateGameCourtSection({
  clubs,
  courts,
  selectedClub,
  selectedCourt,
  selectedCourtIds = [],
  maxParticipants = 4,
  playersPerMatch = 4,
  multiSelectCourts = false,
  selectedDate,
  hasBookedCourt,
  entityType,
  onSelectCourt,
  onToggleHasBookedCourt,
  preferredSport,
  onSportTabChange,
  showHasBookedSwitch: showHasBookedSwitchProp = true,
  showNotBookedOption = true,
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
    showHasBookedSwitchProp &&
    (selectedCourt !== 'notBooked' || (entityType === 'BAR' && courts.length === 1)) &&
    !courtHasActiveBookingIntegration(club, court) &&
    !multiSelectCourts;

  const requiredCourtCount = computeRequiredCourtCount(maxParticipants, playersPerMatch);
  const courtDone = multiSelectCourts
    ? selectedCourtIds.length >= requiredCourtCount
    : selectedCourt !== 'notBooked';
  const courtTrailing = multiSelectCourts
    ? selectedCourtIds.length > 0
      ? `${selectedCourtIds.length}/${requiredCourtCount}`
      : null
    : court
      ? resolveCourtNameParts(court.name, court.integrationCourtName).name
      : null;

  return (
    <div className="space-y-3">
      {!(entityType === 'BAR' && courts.length === 1) && (
        <div>
          <LocationTimeStepHeader
            icon={LayoutGrid}
            title={entityType === 'BAR' ? t('createGame.hall') : t('createGame.court')}
            done={courtDone}
            trailing={courtTrailing}
          />
          <CourtSelectionGrid
            club={club}
            courts={courts}
            selectedCourt={selectedCourt}
            selectedCourtIds={selectedCourtIds}
            maxParticipants={maxParticipants}
            playersPerMatch={playersPerMatch}
            multiSelect={multiSelectCourts}
            selectedDate={selectedDate}
            entityType={entityType}
            preferredSport={preferredSport}
            clubSports={club?.sports}
            onSelectCourt={onSelectCourt}
            onSportTabChange={onSportTabChange}
            showNotBookedOption={showNotBookedOption}
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
