import { useTranslation } from 'react-i18next';
import { ClubModal, ClubAvatar } from '@/components';
import { CourtLocationLinks } from '@/components/CourtLocationLinks';
import type { Club, Court } from '@/types';

interface CreateGameClubSectionProps {
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourt: string;
  isClubModalOpen: boolean;
  onSelectClub: (id: string) => void;
  onOpenClubModal: () => void;
  onCloseClubModal: () => void;
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
      />
      <div>
        <button
          type="button"
          onClick={onOpenClubModal}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors flex items-center gap-3 min-w-0"
        >
          {club ? (
            <>
              <ClubAvatar club={club} className="h-10 w-[3.75rem] shrink-0" />
              <span className="truncate min-w-0">{club.name}</span>
            </>
          ) : (
            t('createGame.selectClub')
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
