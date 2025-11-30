import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components';
import { createPortal } from 'react-dom';

interface GroupCreationModalProps {
  participantCount: number;
  onSelect: (numberOfGroups: number) => void;
  onClose: () => void;
}

export const GroupCreationModal = ({
  participantCount,
  onSelect,
  onClose,
}: GroupCreationModalProps) => {
  const { t } = useTranslation();
  const maxGroups = Math.min(20, Math.floor(participantCount / 4));
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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

  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 30, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="relative bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-6 md:p-8 mx-2 sm:mx-4 max-w-2xl w-full border border-gray-200/50 dark:border-gray-700/50 max-h-[95vh] overflow-y-auto"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl pointer-events-none" />
        
        <div className="relative">
          <div className="flex items-center justify-between mb-3 sm:mb-5 md:mb-8">
            <div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                {t('gameDetails.selectNumberOfGroups')}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('gameDetails.groupCreationHint', { count: participantCount, max: maxGroups })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-110 active:scale-95 group"
            >
              <X size={18} className="sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
          
          <div className="mb-3 sm:mb-5 md:mb-8">
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
          
          <div className="flex gap-2 sm:gap-3 pt-4">
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
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modalContent, document.body);
};

