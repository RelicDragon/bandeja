import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Court, EntityType } from '@/types';

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
  
  if (!isOpen) return null;

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  const isBar = entityType === 'BAR';
  const selectText = isBar ? t('createGame.selectHall') : t('createGame.selectCourt');
  const noAvailableText = isBar ? t('createGame.noHallsAvailable') : t('createGame.noCourtsAvailable');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectText}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-auto flex-1 p-4">
          {courts.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{noAvailableText}</p>
          ) : (
            <div className="space-y-2">
              {showNotBookedOption && (
                <button
                  onClick={() => handleSelect('notBooked')}
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
                  onClick={() => handleSelect(court.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === court.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{court.name}</div>
                      {court.courtType && <div className="text-sm opacity-80 mt-0.5">{court.courtType}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

