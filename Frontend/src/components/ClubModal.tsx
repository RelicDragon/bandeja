import { useTranslation } from 'react-i18next';
import { Club } from '@/types';
import { BaseModal } from '@/components/BaseModal';

interface ClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: Club[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const ClubModal = ({ isOpen, onClose, clubs, selectedId, onSelect }: ClubModalProps) => {
  const { t } = useTranslation();

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="club-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('createGame.selectClub')}</h3>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {clubs.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('createGame.noClubsAvailable')}</p>
          ) : (
            <div className="space-y-2">
              {clubs.map((club) => (
                <button
                  key={club.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(club.id);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === club.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{club.name}</div>
                  {club.address && <div className="text-sm opacity-80 mt-0.5">{club.address}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
    </BaseModal>
  );
};
