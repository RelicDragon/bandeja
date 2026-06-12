import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../ToggleSwitch';
import { CourtModal } from '@/components';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import type { Club, Court, EntityType, Sport } from '@/types';

interface CreateGameCourtSectionProps {
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourt: string;
  hasBookedCourt: boolean;
  bookCourtEnabled?: boolean;
  isCourtModalOpen: boolean;
  entityType: EntityType;
  onSelectCourt: (id: string) => void;
  onToggleHasBookedCourt: (checked: boolean) => void;
  onOpenCourtModal: () => void;
  onCloseCourtModal: () => void;
  preferredSport?: Sport | null;
  onSportTabChange?: (sport: Sport) => void;
}

export const CreateGameCourtSection = ({
  clubs,
  courts,
  selectedClub,
  selectedCourt,
  hasBookedCourt,
  bookCourtEnabled = false,
  isCourtModalOpen,
  entityType,
  onSelectCourt,
  onToggleHasBookedCourt,
  onOpenCourtModal,
  onCloseCourtModal,
  preferredSport,
  onSportTabChange,
}: CreateGameCourtSectionProps) => {
  const { t } = useTranslation();

  if (!selectedClub) return null;

  const club = clubs.find((c) => c.id === selectedClub);
  const court =
    selectedCourt !== 'notBooked'
      ? courts.find((c) => c.id === selectedCourt)
      : entityType === 'BAR' && courts.length === 1
        ? courts[0]
        : undefined;
  const showHasBookedSwitch =
    (selectedCourt !== 'notBooked' || (entityType === 'BAR' && courts.length === 1)) &&
    (!courtHasActiveBookingIntegration(club, court) || !bookCourtEnabled);

  return (
    <>
      {!(entityType === 'BAR' && courts.length === 1) && (
        <CourtModal
          isOpen={isCourtModalOpen}
          onClose={onCloseCourtModal}
          courts={courts}
          selectedId={selectedCourt}
          onSelect={onSelectCourt}
          entityType={entityType}
          preferredSport={preferredSport}
          clubSports={clubs.find((c) => c.id === selectedClub)?.sports}
          onSportTabChange={onSportTabChange}
        />
      )}
      <div className="space-y-3">
        {!(entityType === 'BAR' && courts.length === 1) && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {entityType === 'BAR' ? t('createGame.hall') : t('createGame.court')}
            </label>
            <button
              onClick={onOpenCourtModal}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
            >
              {selectedCourt === 'notBooked' ? (
                t('createGame.notBookedYet')
              ) : (() => {
                const court = courts.find((c) => c.id === selectedCourt);
                return court ? (
                  <CourtDisplayName
                    name={court.name}
                    integrationName={court.integrationCourtName}
                    primaryClassName=""
                    secondaryClassName="text-xs text-gray-500 dark:text-gray-400"
                  />
                ) : null;
              })()}
            </button>
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
    </>
  );
};
