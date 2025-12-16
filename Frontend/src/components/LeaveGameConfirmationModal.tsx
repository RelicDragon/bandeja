import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EntityType } from '@/types';

interface LeaveGameConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isLeaving?: boolean;
  entityType: EntityType;
}

export const LeaveGameConfirmationModal = ({
  isOpen,
  onConfirm,
  onClose,
  isLeaving = false,
  entityType
}: LeaveGameConfirmationModalProps) => {
  const { t } = useTranslation();

  const getConfirmationText = () => {
    const keyMap: Record<EntityType, string> = {
      'GAME': 'gameDetails.leaveGameConfirmationGame',
      'TOURNAMENT': 'gameDetails.leaveGameConfirmationTournament',
      'LEAGUE': 'gameDetails.leaveGameConfirmationLeague',
      'LEAGUE_SEASON': 'gameDetails.leaveGameConfirmationLeagueSeason',
      'BAR': 'gameDetails.leaveGameConfirmationBar',
      'TRAINING': 'gameDetails.leaveGameConfirmationTraining',
    };
    const key = keyMap[entityType] || 'gameDetails.leaveGameConfirmation';
    return t(key);
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        setTimeout(() => {
          document.body.style.overflow = '';
        }, 300);
      };
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="modal-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ pointerEvents: 'auto' }}
        >
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            style={{ pointerEvents: 'auto' }}
          />
          <motion.div
            key="modal-content"
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700 z-10"
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex flex-col text-center">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle
                  size={24}
                  className="text-orange-600 dark:text-orange-400"
                />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('gameDetails.leaveGame')}
              </h3>

              <p className="text-gray-500 dark:text-gray-400 mb-6">
                {getConfirmationText()}
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1"
                disabled={isLeaving}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                variant="danger"
                className="flex-1"
                disabled={isLeaving}
              >
                {isLeaving ? t('common.leaving') || 'Leaving...' : t('common.leave')}
              </Button>
            </div>
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              disabled={isLeaving}
            >
              <X size={20} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

