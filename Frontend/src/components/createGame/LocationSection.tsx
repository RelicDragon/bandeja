import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../ToggleSwitch';
import { ClubModal, CourtModal } from '@/components';
import { Club, Court, EntityType } from '@/types';

interface LocationSectionProps {
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourt: string;
  hasBookedCourt: boolean;
  isClubModalOpen: boolean;
  isCourtModalOpen: boolean;
  entityType: EntityType;
  onSelectClub: (id: string) => void;
  onSelectCourt: (id: string) => void;
  onToggleHasBookedCourt: (checked: boolean) => void;
  onOpenClubModal: () => void;
  onCloseClubModal: () => void;
  onOpenCourtModal: () => void;
  onCloseCourtModal: () => void;
}

export const LocationSection = ({
  clubs,
  courts,
  selectedClub,
  selectedCourt,
  hasBookedCourt,
  isClubModalOpen,
  isCourtModalOpen,
  entityType,
  onSelectClub,
  onSelectCourt,
  onToggleHasBookedCourt,
  onOpenClubModal,
  onCloseClubModal,
  onOpenCourtModal,
  onCloseCourtModal,
}: LocationSectionProps) => {
  const { t } = useTranslation();

  return (
    <>
      <ClubModal
        isOpen={isClubModalOpen}
        onClose={onCloseClubModal}
        clubs={clubs}
        selectedId={selectedClub}
        onSelect={onSelectClub}
      />
      {!(entityType === 'BAR' && courts.length === 1) && (
        <CourtModal
          isOpen={isCourtModalOpen}
          onClose={onCloseCourtModal}
          courts={courts}
          selectedId={selectedCourt}
          onSelect={onSelectCourt}
          entityType={entityType}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="section-title">
            {entityType === 'TOURNAMENT' ? t('createGame.locationTournament') :
             entityType === 'LEAGUE' ? t('createGame.locationLeague') :
             t('createGame.location')}
          </h2>
        </div>
        <div className="space-y-3">
          <div>
            <button
              onClick={onOpenClubModal}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
            >
              {selectedClub
                ? clubs.find(pc => pc.id === selectedClub)?.name
                : t('createGame.selectClub')
              }
            </button>
          </div>
          {selectedClub && (
            <>
              {!(entityType === 'BAR' && courts.length === 1) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    {entityType === 'BAR' ? t('createGame.hall') : t('createGame.court')}
                  </label>
                  <button
                    onClick={onOpenCourtModal}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
                  >
                    {selectedCourt === 'notBooked'
                      ? t('createGame.notBookedYet')
                      : courts.find(c => c.id === selectedCourt)?.name
                    }
                  </button>
                </div>
              )}
              {(selectedCourt !== 'notBooked' || (entityType === 'BAR' && courts.length === 1)) && (
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                    {entityType === 'BAR' ? t('createGame.hasBookedHall') : t('createGame.hasBookedCourt')}
                  </span>
                  <div className="flex-shrink-0">
                    <ToggleSwitch checked={hasBookedCourt} onChange={onToggleHasBookedCourt} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

