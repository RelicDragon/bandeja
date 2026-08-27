import { useTranslation } from 'react-i18next';
import { ChevronRight, Lock, MapPin } from 'lucide-react';
import { ClubModal, ClubAvatar } from '@/components';
import { CourtLocationLinks } from '@/components/CourtLocationLinks';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';
import type { Club, Court, EntityType, Sport } from '@/types';

interface CreateGameClubSectionProps {
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourt: string;
  isClubModalOpen: boolean;
  onSelectClub: (id: string, club?: Club) => void;
  onOpenClubModal: () => void;
  onCloseClubModal: () => void;
  locked?: boolean;
  onLockedActivate?: () => void;
  venueCityId?: string;
  onVenueCityChange?: (cityId: string, snapshot?: { name: string; country: string }) => void;
  entityType?: EntityType;
  preferredSport?: Sport | null;
}

export const CreateGameClubSection = ({
  clubs,
  courts,
  selectedClub,
  selectedCourt,
  isClubModalOpen,
  onSelectClub,
  onOpenClubModal,
  onCloseClubModal,
  locked = false,
  onLockedActivate,
  venueCityId,
  onVenueCityChange,
  entityType,
  preferredSport,
}: CreateGameClubSectionProps) => {
  const { t } = useTranslation();
  const club = clubs.find((c) => c.id === selectedClub);

  return (
    <>
      <ClubModal
        isOpen={isClubModalOpen}
        onClose={onCloseClubModal}
        clubs={clubs}
        selectedId={selectedClub}
        onSelect={onSelectClub}
        cityId={venueCityId}
        onVenueCityChange={onVenueCityChange}
        entityType={entityType}
        preferredSport={preferredSport}
      />
      <div>
        <LocationTimeStepHeader
          icon={MapPin}
          title={t('createGame.club')}
          done={Boolean(club)}
          trailing={locked ? t('gameDetails.locationTime.clubLockedBadge') : null}
        />
        <button
          type="button"
          onClick={locked ? onLockedActivate : onOpenClubModal}
          data-testid={locked ? 'edit-club-locked' : undefined}
          aria-label={
            locked ? t('gameDetails.locationTime.clubLockedAria') : undefined
          }
          className={
            club
              ? 'w-full flex items-center gap-3 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-start transition-colors hover:border-primary-400 dark:hover:border-primary-600'
              : 'w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-950/20 px-3 py-3 text-start transition-colors hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/40'
          }
        >
          {club ? (
            <>
              <ClubAvatar club={club} className="h-10 w-[3.75rem] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                  {club.name}
                </span>
                {club.address ? (
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {club.address}
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40">
                <MapPin size={18} className="text-primary-600 dark:text-primary-400" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-primary-700 dark:text-primary-300">
                {t('createGame.selectClub')}
              </span>
            </>
          )}
          {locked ? (
            <Lock size={16} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
          ) : (
            <ChevronRight size={18} className="shrink-0 text-gray-400 dark:text-gray-500" />
          )}
        </button>
      </div>
      {selectedClub && (
        <CourtLocationLinks
          club={club}
          court={
            selectedCourt !== 'notBooked'
              ? courts.find((c) => c.id === selectedCourt)
              : undefined
          }
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
          linkClassName="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          showWebCameraLink={false}
        />
      )}
    </>
  );
};
