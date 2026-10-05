import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { CourtSelectionGrid } from './CourtSelectionGrid';
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
  requiredCourtCount?: number;
  selectedDate: Date;
  /** @deprecated Ignored: reservations are set by "At the club?" (create) or the Courts card. */
  hasBookedCourt?: boolean;
  entityType: EntityType;
  onSelectCourt: (id: string) => void;
  /** @deprecated Ignored, see `hasBookedCourt`. */
  onToggleHasBookedCourt?: (checked: boolean) => void;
  preferredSport?: Sport | null;
  onSportTabChange?: (sport: Sport) => void;
  /** @deprecated Ignored: the "I booked this court" switch is gone. */
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
  requiredCourtCount: requiredCourtCountProp,
  selectedDate,
  entityType,
  onSelectCourt,
  preferredSport,
  onSportTabChange,
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
  const requiredCourtCount =
    requiredCourtCountProp ?? computeRequiredCourtCount(maxParticipants, playersPerMatch);
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
    </div>
  );
});
