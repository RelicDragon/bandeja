import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle } from 'lucide-react';
import { EntityType } from '@/types';
import { BaseModal } from './BaseModal';

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

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      isBasic 
      modalId="leave-game-confirmation-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
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
    </BaseModal>
  );
};

