import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Court, EntityType } from '@/types';
import { BaseModal } from '@/components/BaseModal';

interface CourtModalProps {
  isOpen: boolean;
  onClose: () => void;
  courts: Court[];
  selectedId: string;
  onSelect: (id: string) => void;
  entityType?: EntityType;
  showNotBookedOption?: boolean;
}

export const CourtModal = ({ isOpen, onClose, courts, selectedId, onSelect, entityType, showNotBookedOption = true }: CourtModalProps) => {
  const { t } = useTranslation();
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setInternalIsOpen(true);
    }
  }, [isOpen]);

  const handleClose = () => {
    setInternalIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    handleClose();
  };

  const isBar = entityType === 'BAR';
  const selectText = isBar ? t('createGame.selectHall') : t('createGame.selectCourt');
  const noAvailableText = isBar ? t('createGame.noHallsAvailable') : t('createGame.noCourtsAvailable');

  return (
    <BaseModal
      isOpen={internalIsOpen}
      onClose={handleClose}
      isBasic
      modalId="court-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectText}</h3>
        </div>
        <div className="overflow-y-auto scrollbar-auto flex-1 p-4">
          {courts.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{noAvailableText}</p>
          ) : (
            <div className="space-y-2">
              {showNotBookedOption && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect('notBooked');
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === 'notBooked'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{t('createGame.notBookedYet')}</div>
                </button>
              )}
              {courts.map((court) => (
                <button
                  key={court.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(court.id);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === court.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        {court.name}
                        {court.isIndoor && (
                          <span title="Indoor court">
                            <Home size={14} className={selectedId === court.id ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'} />
                          </span>
                        )}
                      </div>
                      {court.courtType && <div className="text-sm opacity-80 mt-0.5">{court.courtType}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
    </BaseModal>
  );
};

