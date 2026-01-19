import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { BaseModal } from '../BaseModal';

interface GroupCreationModalProps {
  participantCount: number;
  onSelect: (numberOfGroups: number) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const GroupCreationModal = ({
  participantCount,
  onSelect,
  onClose,
  isOpen,
}: GroupCreationModalProps) => {
  const { t } = useTranslation();
  const maxGroups = Math.min(20, Math.floor(participantCount / 4));
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

  const numberOptions = Array.from({ length: maxGroups }, (_, i) => i + 1);

  const handleNumberSelect = (number: number) => {
    setSelectedNumber(number);
  };

  const handleConfirm = () => {
    if (selectedNumber !== null) {
      onSelect(selectedNumber);
      onClose();
    }
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      isBasic 
      modalId="group-creation-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between mb-3 sm:mb-5 md:mb-8 p-3 sm:p-6 md:p-8">
        <div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            {t('gameDetails.selectNumberOfGroups')}
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('gameDetails.groupCreationHint', { count: participantCount, max: maxGroups })}
          </p>
        </div>
      </div>
      
      <div className="mb-3 sm:mb-5 md:mb-8 px-3 sm:px-6 md:px-8">
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 sm:gap-2 md:gap-2.5 w-full max-w-xs sm:max-w-md px-1 mx-auto">
          {numberOptions.map((number) => (
            <button
              key={number}
              onClick={() => handleNumberSelect(number)}
              className={`aspect-square rounded-lg sm:rounded-xl font-bold text-sm sm:text-base transition-all duration-200 ${
                number === selectedNumber
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 scale-110 ring-2 ring-primary-400 ring-offset-1 sm:ring-offset-2 dark:ring-offset-gray-900'
                  : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg border border-gray-200 dark:border-gray-700'
              }`}
            >
              {number}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex gap-2 sm:gap-3 pt-4 px-3 sm:px-6 md:px-8 pb-3 sm:pb-6 md:pb-8">
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-10 sm:h-11 md:h-12 rounded-xl font-semibold hover:scale-105 active:scale-95 transition-all duration-200 text-sm sm:text-base"
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={selectedNumber === null}
          className="flex-1 h-10 sm:h-11 md:h-12 rounded-xl font-semibold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {t('common.confirm')}
        </Button>
      </div>
    </BaseModal>
  );
};

